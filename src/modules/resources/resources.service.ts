import { Injectable, NotFoundException, ForbiddenException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Like, LessThan, In } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceVersionCompatibility } from '@entities/resource-version-compatibility.entity';
import { ResourceRating } from '@entities/resource-rating.entity';
import { User } from '@entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { parseMarkdown } from '@common/utils/markdown.util';
import { encodeCursor, decodeCursor } from '@common/utils/cursor.util';
import { escapeLike } from '@common/utils/search.util';
import { PUBLIC_RESOURCE_STATUSES, RESOURCE_STATUS } from '@common/utils/constants';
import { isSafeExternalUrl } from '@common/utils/safe-url.util';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MflClientService } from './mfl-client.service';
import { ResourceCategoryService } from './resource-categories.service';
import { isValidRating, ratingAggregateDelta, validateResourceSort } from './resource-rating.util';
import { mergeResourceMetadata, normalizeResourceMetadata } from './resource-detail.util';
import { ResourceStorageService } from './resource-storage.service';
import { ContentSafetyService, ContentRisk } from '@modules/content-safety/content-safety.service';
import { ResourceSubscriptionsService } from './resource-subscriptions.service';
import { randomUUID } from 'crypto';
import { ConsumedResourcePreviewDraft, ResourcePreviewService } from './resource-preview.service';

export interface ResourceFileMeta {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
}

// Only retained for migration/legacy-resource compatibility. New submissions
// never call this flow and always store their payload in forum-managed storage.
interface MflFileMeta {
  file_name: string;
  file_size: number;
  mime_type: string;
  file_buffer: Buffer;
}

type ResourceListScope = 'public' | 'admin';

const RESOURCE_STATUS_PENDING = RESOURCE_STATUS.pending;
const RESOURCE_STATUS_APPROVED = RESOURCE_STATUS.approved;
const RESOURCE_STATUS_REJECTED = RESOURCE_STATUS.rejected;

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ResourceCategory)
    private categoryRepository: Repository<ResourceCategory>,
    @InjectRepository(ResourceVersion)
    private versionRepository: Repository<ResourceVersion>,
    @InjectRepository(ResourceFile)
    private resourceFileRepository: Repository<ResourceFile>,
    @InjectRepository(ResourceRating)
    private ratingRepository: Repository<ResourceRating>,
    private dataSource: DataSource,
    private adminNotificationsService: AdminNotificationsService,
    private notificationsService: NotificationsService,
    private mflClientService: MflClientService,
    private categoryService: ResourceCategoryService,
    private resourceStorageService?: ResourceStorageService,
    private contentSafety?: ContentSafetyService,
    private resourceSubscriptionsService?: ResourceSubscriptionsService,
    private resourcePreviewService?: ResourcePreviewService,
  ) {}

  private emptyContentRisk(): ContentRisk {
    return { score: 0, rules: [], mustReview: false };
  }

  private resourceSafetyText(input: {
    title?: string | null;
    description?: string | null;
    content?: string | null;
    externalUrl?: string | null;
    fileName?: string | null;
  }): string {
    return [input.title, input.description, input.content, input.externalUrl, input.fileName]
      .filter((value): value is string => Boolean(value))
      .join('\n');
  }

  private normalizeResourceType(resourceType: string): string {
    return resourceType === 'file' ? 'upload' : resourceType;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('无效的数值');
    }
    return parsed;
  }

  private toTinyInt(value: unknown, defaultValue: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === 'true') return 1;
    if (value === 'false') return 0;
    return Number(value) ? 1 : 0;
  }

  private normalizeVersion(version: ResourceVersion) {
    return {
      ...version,
      file_size: version.file_size || 0,
      checksum: (version as any).content_hash || null,
      release_notes: (version as any).release_notes_markdown || version.content || null,
    };
  }

  private normalizeResource(resource: Resource, versions?: ResourceVersion[]) {
    return {
      ...resource,
      is_public: resource.is_public === 1,
      use_mfl: resource.use_mfl === 1,
      file_size: resource.file_size || 0,
      slug: resource.slug || null,
      rating_count: resource.rating_count || 0,
      rating_sum: resource.rating_sum || 0,
      rating_average: Number(resource.rating_average) || 0,
      comment_count: Number((resource as Resource & { comment_count?: number }).comment_count) || 0,
      username: resource.user?.username || '',
      avatar_url: resource.user?.avatar_url || null,
      category_name: resource.category?.name || null,
      category_icon: resource.category?.icon || null,
      metadata: normalizeResourceMetadata(resource.metadata_json),
      renderer_metadata: resource.renderer_metadata_json || null,
      preview_url: resource.renderer_status === 'ready' ? `/api/resources/${resource.id}/preview` : null,
      versions: versions?.map((version) => this.normalizeVersion(version)),
    };
  }

  /** One grouped query for a resource batch; never count comments per row. */
  private async normalizeResources(resources: Resource[]): Promise<any[]> {
    if (resources.length === 0) return [];
    const ids = resources.map(({ id }) => id);
    const rows = await this.dataSource.query(
      `SELECT resource_id, COUNT(*) AS comment_count
       FROM resource_comments
       WHERE status = ? AND resource_id IN (${ids.map(() => '?').join(',')})
       GROUP BY resource_id`,
      ['visible', ...ids],
    ) as Array<{ resource_id: number | string; comment_count: number | string }>;
    const counts = new Map(rows.map((row) => [Number(row.resource_id), Number(row.comment_count)]));
    return resources.map((resource) => this.normalizeResource({ ...resource,
      comment_count: counts.get(resource.id) || 0,
    } as Resource));
  }

  private async normalizeOneResource(resource: Resource, versions?: ResourceVersion[]) {
    const [normalized] = await this.normalizeResources([resource]);
    return { ...normalized, versions: versions?.map((version) => this.normalizeVersion(version)) };
  }

  /**
   * Unified public-visibility predicate for resources.
   *
   * A resource is publicly accessible when ALL of the following hold:
   *   1. Its status is in PUBLIC_RESOURCE_STATUSES (approved / published).
   *   2. It is marked public (is_public = 1).
   *   3. Its category exists and is active — or it has no category at all.
   *
   * Centralising the check here keeps `assertResourceVisible`, list queries,
   * and single-resource reads consistent: a disabled category hides every
   * resource beneath it, not just some.
   */
  async isResourcePubliclyAccessible(resource: {
    status?: string;
    is_public?: number;
    category_id?: number | null;
  }): Promise<boolean> {
    const isApproved = (PUBLIC_RESOURCE_STATUSES as readonly string[]).includes(
      resource.status ?? '',
    );
    if (!isApproved || resource.is_public !== 1) {
      return false;
    }

    if (resource.category_id) {
      try {
        const category = await this.categoryService.getById(resource.category_id);
        if (!category || category.is_active !== 1) {
          return false;
        }
      } catch (e) {
        if (e instanceof NotFoundException) {
          return false;
        }
        throw e;
      }
    }

    return true;
  }

  /**
   * List only resources that pass the public-visibility predicate, using a
   * single query with a LEFT JOIN on the category so inactive categories
   * are excluded at the database level rather than in application code,
   * while resources without a category are still included.
   */
  async getPublicResources(): Promise<Resource[]> {
    return this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.user', 'user')
      .leftJoin('resource.category', 'category')
      .where('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 })
      .orderBy('resource.created_at', 'DESC')
      .getMany();
  }

  /**
   * Fetch a single resource by ID, returning null when it exists but is not
   * publicly accessible (rather than throwing). Composes `getById` with the
   * visibility predicate.
   */
  async getPublicResourceById(id: number): Promise<any | null> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) return null;

    const isAccessible = await this.isResourcePubliclyAccessible(resource);
    return isAccessible ? this.normalizeOneResource(resource) : null;
  }

  async create(
    dto: CreateResourceDto,
    userId: number,
    file?: ResourceFileMeta,
    provenance: { ipAddress?: string; rendererDraft?: ConsumedResourcePreviewDraft; uploadSessionId?: string } = {},
  ): Promise<any> {
    const categoryId = this.toOptionalNumber((dto as any).category_id);
    const resourceType = this.normalizeResourceType(dto.resource_type);
    const resourceKind = dto.resource_kind || 'other';

    const category = categoryId
      ? await this.categoryRepository.findOne({ where: { id: categoryId } })
      : null;
    if (categoryId && !category) {
      throw new BadRequestException('分类不存在');
    }

    if (!['upload', 'external'].includes(resourceType)) {
      throw new BadRequestException('无效的资源类型');
    }

    if (resourceType === 'upload' && !file) {
      throw new BadRequestException('文件类资源必须上传文件');
    }

    if (resourceType === 'external' && !dto.external_url) {
      throw new BadRequestException('外链类资源必须填写外链地址');
    }
    this.assertKindFileContract(resourceKind, resourceType, file?.file_name);
    if ((resourceKind === 'map' || resourceKind === 'schematic') && dto.external_url) {
      throw new BadRequestException('地图和蓝图只能使用本站托管文件，不能设置外链地址');
    }

    const contentHtml = dto.content ? parseMarkdown(dto.content) : undefined;
    const risk = this.contentSafety
      ? await this.contentSafety.assess(this.resourceSafetyText({
        title: dto.title,
        description: dto.description,
        content: dto.content,
        externalUrl: dto.external_url,
        fileName: file?.file_name,
      }))
      : this.emptyContentRisk();

    const newResource = this.resourceRepository.create({
      user_id: userId,
      title: dto.title,
      public_id: randomUUID(),
      description: dto.description,
      resource_type: resourceType,
      resource_kind: resourceKind,
      summary: dto.description || null,
      visibility: this.toTinyInt((dto as any).is_public, 1) ? 'public' : 'private',
      file_name: file?.file_name,
      file_path: file?.file_path,
      file_size: file?.file_size,
      mime_type: file?.mime_type,
      content_hash: file?.content_hash,
      external_url: resourceType === 'external' ? dto.external_url : undefined,
      version: dto.version,
      source_url: dto.source_url || null,
      license: dto.license?.trim() || null,
      content: dto.content,
      content_html: contentHtml,
      category_id: categoryId,
      is_public: this.toTinyInt((dto as any).is_public, 1),
      status: RESOURCE_STATUS_PENDING,
      ...(provenance.uploadSessionId ? { game_content_upload_session_id: provenance.uploadSessionId } : {}),
      ...(provenance.rendererDraft ? {
        renderer_status: 'ready' as const,
        renderer_error_code: null,
        renderer_preview_key: provenance.rendererDraft.previewKey,
        renderer_parser_version: provenance.rendererDraft.parserVersion,
        renderer_metadata_json: provenance.rendererDraft.metadata,
      } : {}),
      download_count: 0,
      use_mfl: 0,
      metadata_json: (dto as any).metadata ? normalizeResourceMetadata((dto as any).metadata) : null,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const resource = await manager.save(Resource, newResource);
      await this.createInitialV2Aggregate(manager, resource, dto, userId, file);
      return resource;
    });

    const finalResult = await this.resourceRepository.findOne({
      where: { id: saved.id },
      relations: ['user', 'category'],
    });

    if (!finalResult) {
      throw new NotFoundException('资源不存在');
    }

    if (this.contentSafety) {
      await this.contentSafety.recordFlag({
        userId,
        targetType: 'resource',
        targetId: finalResult.id,
        risk,
        ipAddress: provenance.ipAddress,
      }).catch(() => undefined);
    }

    if (finalResult.status === RESOURCE_STATUS_PENDING) {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'resource',
        item_id: finalResult.id,
        title: finalResult.title,
        content: dto.description || dto.content || dto.external_url || file?.file_name || null,
        author_username: finalResult.user?.username || `#${userId}`,
        action_url: '/admin/resources/moderation',
      }).catch((err) =>
        console.error('Admin resource moderation notification error:', err),
      );
    }

    return this.normalizeOneResource(finalResult);
  }

  /**
   * Dual-writes the structured aggregate while legacy columns remain available
   * for the controlled rollback period. Every new resource therefore has an
   * explicit submitter, release, delivery record and optional compatibility.
   */
  private async createInitialV2Aggregate(
    manager: EntityManager,
    resource: Resource,
    dto: CreateResourceDto,
    submitterUserId: number,
    file: ResourceFileMeta | undefined,
  ): Promise<void> {
      const release = await manager.save(ResourceVersion, manager.create(ResourceVersion, {
        resource_id: resource.id,
        public_id: randomUUID(),
        // This is strictly the resource's own release version. Mindustry build
        // compatibility is represented below in ResourceVersionCompatibility.
        version: dto.version.trim(),
        release_channel: 'stable',
        status: 'pending_review',
        release_notes_markdown: dto.content?.trim() || null,
        release_notes_html: dto.content?.trim() ? parseMarkdown(dto.content) : null,
        created_by_user_id: submitterUserId,
        file_path: file?.file_path || null,
        file_name: file?.file_name || null,
        file_size: file?.file_size || null,
        mime_type: file?.mime_type || null,
        content_hash: file?.content_hash || null,
      } as Partial<ResourceVersion>));

      const credits = [
        { role: 'submitter', subject_type: 'local_user', user_id: submitterUserId, display_name: null },
        ...this.normalizeCredits(dto.original_authors).map((display_name) => ({ role: 'original_author', subject_type: 'external_person', user_id: null, display_name })),
        ...this.normalizeCredits(dto.maintainers).map((display_name) => ({ role: 'maintainer', subject_type: 'external_person', user_id: null, display_name })),
      ];
      await manager.save(ResourceAttribution, credits.map((credit, sort_order) => manager.create(ResourceAttribution, {
        resource_id: resource.id,
        ...credit,
        sort_order,
      })));

      const hosted = resource.resource_type === 'upload';
      await manager.save(ResourceFile, manager.create(ResourceFile, {
        public_id: randomUUID(),
        resource_version_id: release.id,
        role: 'primary',
        delivery_mode: hosted ? 'managed' : 'external',
        original_filename: hosted ? file?.file_name || null : null,
        mime_type: hosted ? file?.mime_type || null : null,
        size_bytes: hosted ? file?.file_size || null : null,
        hash_algorithm: hosted ? 'sha256' : null,
        content_hash: hosted ? file?.content_hash || null : null,
        integrity_status: hosted ? 'verified' : 'unverified_legacy',
        storage_backend: hosted ? 'local' : null,
        storage_key: hosted ? file?.file_path || null : null,
        external_url: hosted ? null : resource.external_url,
        availability_status: hosted ? (file ? 'available' : 'unavailable') : 'available',
        sort_order: 0,
      }));

      const compatibility = dto.compatibility || [];
      if (compatibility.length) {
        await manager.save(ResourceVersionCompatibility, compatibility.map((item) => manager.create(ResourceVersionCompatibility, {
          resource_version_id: release.id,
          runtime: 'mindustry',
          min_version_value: item.min_version_value?.trim() || null,
          max_version_value: item.max_version_value?.trim() || null,
          channel: item.channel?.trim() || null,
          notes: item.notes?.trim() || null,
        })));
      }
  }

  private normalizeCredits(values: string[] | undefined): string[] {
    return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))];
  }

  private assertKindFileContract(kind: string, resourceType: string, fileName?: string): void {
    if (kind !== 'map' && kind !== 'schematic') return;
    if (resourceType !== 'upload' || !fileName) {
      throw new BadRequestException(`${kind === 'map' ? '地图' : '蓝图'}必须上传本站托管文件`);
    }
    const expectedExtension = kind === 'map' ? '.msav' : '.msch';
    if (!fileName.toLowerCase().endsWith(expectedExtension)) {
      throw new BadRequestException(`${kind === 'map' ? '地图' : '蓝图'}仅支持 ${expectedExtension} 文件`);
    }
  }

  /**
   * Push an already-persisted resource's payload to MindFileList and record the
   * identifiers it hands back.
   *
   * Deliberately outside any database transaction. The upload used to run inside
   * `create`'s transaction, so a 50 MB POST held a connection and row locks open
   * for its whole duration — and the compensating `manager.delete` on the failure
   * path was itself inside the doomed transaction, so it rolled back with
   * everything else and the uploaded file was orphaned on MFL forever.
   *
   * The resource row is committed as `pending` first: a metadata row with no
   * download URL is harmless (moderation hides it either way), whereas a remote
   * file with nothing pointing at it is unreclaimable.
   */
  private async attachMflUpload(
    resourceId: number,
    mflMeta: MflFileMeta,
    categorySlug: string,
  ): Promise<void> {
    let mflResult: Awaited<ReturnType<MflClientService['uploadFile']>>;
    try {
      mflResult = await this.mflClientService.uploadFile(
        mflMeta.file_buffer,
        mflMeta.file_name,
        categorySlug,
        mflMeta.mime_type,
        { resourceId },
      );
    } catch (err) {
      // Nothing was stored remotely, so the placeholder row is safe to drop.
      await this.resourceRepository.delete(resourceId);
      throw err;
    }

    if (!mflResult) {
      await this.resourceRepository.delete(resourceId);
      throw new BadRequestException('文件站服务未配置，请改用本地上传或联系管理员');
    }

    try {
      await this.resourceRepository.update(resourceId, {
        mfl_file_id: mflResult.id,
        mfl_download_url: this.mflClientService.getDownloadUrl(mflResult.id),
      });
    } catch (err) {
      // The file exists on MFL but nothing will ever reference it — block it from
      // being downloaded before discarding the row.
      await this.mflClientService.blockDownloads(
        mflResult.id,
        resourceId,
        'the forum could not record the upload',
      );
      await this.resourceRepository.delete(resourceId);
      throw err;
    }
  }

  async getList(
    query: QueryResourcesDto,
    options: { scope?: ResourceListScope; featuredOnly?: boolean; trendingOnly?: boolean } = {},
  ): Promise<any> {
    const {
      limit = 20,
      category_id,
      search,
      status,
      cursor,
      tag,
      tags,
      author,
      supported_version,
      compatibility,
      resource_kind,
      planet,
      block,
      width,
      height,
    } = query;
    const scope = options.scope ?? 'public';
    const sort = options.trendingOnly ? 'created_at' : validateResourceSort(query.sort);
    const direction = String(query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    if (scope === 'public') {
      // Use createQueryBuilder with LEFT JOIN on category so resources whose
      // category has been disabled are excluded at the database level, while
      // resources without any category are still included.
      const qb = this.resourceRepository
        .createQueryBuilder('resource')
        .leftJoinAndSelect('resource.user', 'user')
        .leftJoin('resource.category', 'category')
        .where('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
        .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
        .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 });

      if (options.featuredOnly) qb.andWhere('resource.is_featured = 1');

      const trendScore = `(
        (SELECT COUNT(*) * 3 FROM download_events de WHERE de.resource_id = resource.id AND de.event_type = 'granted' AND de.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) +
        (SELECT COUNT(*) * 2 FROM resource_likes rl WHERE rl.resource_id = resource.id AND rl.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) +
        (SELECT COUNT(*) * 2 FROM resource_favorites rf WHERE rf.resource_id = resource.id AND rf.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
      )`;
      if (options.trendingOnly) qb.addSelect(trendScore, 'trending_score');

      if (category_id) {
        qb.andWhere('resource.category_id = :categoryId', { categoryId: category_id });
      }

      if (search) {
        qb.andWhere('resource.title LIKE :search', { search: `%${escapeLike(search)}%` });
      }

      if (resource_kind?.trim()) {
        qb.andWhere('resource.resource_kind = :resourceKind', { resourceKind: resource_kind.trim() });
      }

      if (author?.trim()) {
        qb.andWhere('user.username = :resourceAuthor', { resourceAuthor: author.trim() });
      }

      if (planet?.trim()) {
        qb.andWhere(
          `JSON_UNQUOTE(JSON_EXTRACT(resource.renderer_metadata_json, '$.planet')) = :resourcePlanet`,
          { resourcePlanet: planet.trim() },
        );
      }
      if (block?.trim()) {
        qb.andWhere(
          `JSON_SEARCH(resource.renderer_metadata_json, 'one', :resourceBlock, NULL, '$.block_types[*].name') IS NOT NULL`,
          { resourceBlock: block.trim() },
        );
      }
      if (width !== undefined) {
        qb.andWhere(
          `CAST(JSON_UNQUOTE(JSON_EXTRACT(resource.renderer_metadata_json, '$.width')) AS UNSIGNED) = :resourceWidth`,
          { resourceWidth: width },
        );
      }
      if (height !== undefined) {
        qb.andWhere(
          `CAST(JSON_UNQUOTE(JSON_EXTRACT(resource.renderer_metadata_json, '$.height')) AS UNSIGNED) = :resourceHeight`,
          { resourceHeight: height },
        );
      }

      // These fields are normalised arrays in metadata_json. JSON_CONTAINS
      // deliberately returns no match for NULL metadata, which is the public
      // contract for an explicit filter. Parameterise every value so a tag can
      // never alter the JSON path or the surrounding query.
      const metadataFilters: Array<[string | undefined, string, string]> = [
        [tag, 'tags', 'resourceTag'],
        [compatibility, 'compatibility', 'resourceCompatibility'],
      ];
      for (const [value, field, parameter] of metadataFilters) {
        if (!value?.trim()) continue;
        qb.andWhere(
          `JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:${parameter}), '$.${field}')`,
          { [parameter]: value.trim() },
        );
      }

      for (const [index, value] of (tags || '').split(',').map((item) => item.trim()).filter(Boolean).entries()) {
        const parameter = `resourceTagBatch${index}`;
        qb.andWhere(`JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:${parameter}), '$.tags')`, { [parameter]: value });
      }

      if (supported_version?.trim()) {
        // New releases declare Mindustry builds in their compatibility rows.
        // JSON metadata remains a legacy fallback until reconciliation proves
        // every historical resource has been migrated.
        qb.andWhere(
          `(EXISTS (SELECT 1 FROM resource_versions rv INNER JOIN resource_version_compatibilities rvc ON rvc.resource_version_id = rv.id WHERE rv.resource_id = resource.id AND rvc.runtime = 'mindustry' AND (rvc.min_version_value IS NULL OR rvc.min_version_value <= :supportedVersion) AND (rvc.max_version_value IS NULL OR rvc.max_version_value >= :supportedVersion)) OR JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:supportedVersion), '$.supported_versions'))`,
          { supportedVersion: supported_version.trim() },
        );
      }

      // Cursor-based pagination
      if (cursor) {
        try {
          const decoded = decodeCursor(cursor);
          const idValue = parseInt(decoded[1]);
          if (options.trendingOnly) {
            const cursorScore = Number(decoded[0]);
            if (!Number.isFinite(cursorScore) || !Number.isSafeInteger(idValue)) throw new Error('invalid cursor');
            qb.andWhere(`(${trendScore} < :cursorScore OR (${trendScore} = :cursorScore AND resource.id < :idValue))`, { cursorScore, idValue });
          } else {
            const cursorValue = sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
            qb.andWhere(
              `(resource.${sort} ${direction === 'ASC' ? '>' : '<'} :cursorValue OR (resource.${sort} = :cursorValue AND resource.id ${direction === 'ASC' ? '>' : '<'} :idValue))`,
              { cursorValue, idValue },
            );
          }
        } catch {
          // Ignore invalid cursors.
        }
      }

      if (options.trendingOnly) qb.orderBy('trending_score', 'DESC').addOrderBy('resource.id', 'DESC');
      else qb.orderBy(`resource.${sort}`, direction).addOrderBy('resource.id', direction);
      qb.take(Number(limit) + 1);

      const selected = options.trendingOnly ? await qb.getRawAndEntities() : null;
      const resources = selected
        ? selected.entities.map((entity, index) => Object.assign(entity, { trending_score: Number(selected.raw[index]?.trending_score) || 0 }))
        : await qb.getMany();

      const hasMore = resources.length > Number(limit);
      if (hasMore) {
        resources.pop();
      }

      let nextCursor: string | null = null;
      if (hasMore && resources.length > 0) {
        const lastResource = resources[resources.length - 1];
        const cursorValue = options.trendingOnly
          ? String((lastResource as Resource & { trending_score: number }).trending_score)
          : sort === 'created_at'
            ? lastResource.created_at.getTime().toString()
            : lastResource[sort].toString();
        nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
      }

      return {
        data: await this.normalizeResources(resources),
        next_cursor: nextCursor,
        has_more: hasMore,
      };
    }

    // Admin scope — use find() without category-active filter
    const where: any = {};

    if (category_id) {
      where.category_id = category_id;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.title = Like(`%${escapeLike(search)}%`);
    }

    let cursorCondition: any = {};
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue =
          sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
        const idValue = parseInt(decoded[1]);

        cursorCondition = [
          { [sort]: LessThan(cursorValue) },
          { [sort]: cursorValue, id: LessThan(idValue) },
        ];
      } catch {
        // Ignore invalid cursors.
      }
    }

    const resources = await this.resourceRepository.find({
      where: cursorCondition.length > 0
        ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
        : where,
      relations: ['user', 'category'],
      order: {
        [sort]: 'DESC',
        id: 'DESC',
      },
      take: Number(limit) + 1,
    });

    const hasMore = resources.length > Number(limit);
    if (hasMore) {
      resources.pop();
    }

    let nextCursor: string | null = null;
    if (hasMore && resources.length > 0) {
      const lastResource = resources[resources.length - 1];
      const cursorValue =
        sort === 'created_at'
          ? lastResource.created_at.getTime().toString()
          : lastResource[sort].toString();
      nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
    }

    return {
      data: await this.normalizeResources(resources),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async getFilterOptions(): Promise<{ supported_versions: string[]; compatibility: string[]; planets: string[] }> {
    const rows = await this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoin('resource.category', 'category')
      .select('resource.metadata_json', 'metadata_json')
      .addSelect('resource.renderer_metadata_json', 'renderer_metadata_json')
      .where('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 })
      .getRawMany<{ metadata_json: unknown; renderer_metadata_json: unknown }>();

    const supportedVersions = new Set<string>();
    const compatibility = new Set<string>();
    const planets = new Set<string>();
    for (const row of rows) {
      const metadata = normalizeResourceMetadata(row.metadata_json);
      metadata.supported_versions.forEach((value) => supportedVersions.add(value));
      metadata.compatibility.forEach((value) => compatibility.add(value));
      const renderer = typeof row.renderer_metadata_json === 'string'
        ? (() => { try { return JSON.parse(row.renderer_metadata_json as string); } catch { return {}; } })()
        : row.renderer_metadata_json;
      if (renderer && typeof renderer === 'object' && !Array.isArray(renderer)) {
        const planet = (renderer as Record<string, unknown>).planet;
        if (typeof planet === 'string' && planet.trim()) planets.add(planet.trim());
      }
    }

    // A failed compatibility query must not hide legacy filter options during
    // the additive migration. It becomes authoritative as backfill completes.
    try {
      const structured = await this.dataSource.query(
        `SELECT DISTINCT rvc.min_version_value, rvc.max_version_value, rvc.platform_key
         FROM resource_version_compatibilities rvc
         INNER JOIN resource_versions rv ON rv.id = rvc.resource_version_id
         INNER JOIN resources resource ON resource.id = rv.resource_id
         WHERE rvc.runtime = 'mindustry' AND resource.deleted_at IS NULL AND resource.status IN (?, ?) AND resource.is_public = 1`,
        PUBLIC_RESOURCE_STATUSES,
      );
      for (const row of structured) {
        if (row.min_version_value) supportedVersions.add(String(row.min_version_value));
        if (row.max_version_value) supportedVersions.add(String(row.max_version_value));
        if (row.platform_key) compatibility.add(String(row.platform_key));
      }
    } catch {
      // Legacy metadata continues to serve filters until the new tables exist.
    }

    return {
      supported_versions: Array.from(supportedVersions).sort((a, b) => a.localeCompare(b, 'zh-CN')),
      compatibility: Array.from(compatibility).sort((a, b) => a.localeCompare(b, 'zh-CN')),
      planets: Array.from(planets).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    };
  }

  /**
   * Authorize a single-resource read.
   *
   * Enforces the same scoping `getList` applies to lists. Without it, fetching by
   * id returned pending and rejected resources — and, via the download route,
   * served their files — which defeated the moderation queue entirely and turned
   * `external_url` into an open redirect that needed no approval.
   *
   * Delegates to `isResourcePubliclyAccessible` for the public path so the
   * category-active check is applied uniformly.
   */
  private async assertResourceVisible(
    resource: { status?: string; is_public?: number; user_id?: number; category_id?: number | null },
    viewer?: { id: number; role: string },
  ): Promise<void> {
    const isStaff = !!viewer && ['admin', 'moderator'].includes(viewer.role);
    const isOwner = !!viewer && resource.user_id === viewer.id;
    if (isStaff || isOwner) {
      return;
    }

    const accessible = await this.isResourcePubliclyAccessible(resource);
    if (!accessible) {
      // 404 rather than 403 so unapproved submissions are not enumerable.
      throw new NotFoundException('资源不存在');
    }
  }

  async getById(id: number, viewer?: { id: number; role: string }): Promise<any> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    await this.assertResourceVisible(resource, viewer);

    return this.normalizeOneResource(resource);
  }

  async getByIdWithVersions(id: number, viewer?: { id: number; role: string }): Promise<any> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    await this.assertResourceVisible(resource, viewer);

    const versions = await this.versionRepository.find({
      where: { resource_id: id },
      order: { created_at: 'DESC' },
    });

    return this.normalizeOneResource(resource, versions);
  }

  async getRelatedResources(id: number, limit = 6): Promise<any[]> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!resource) throw new NotFoundException('资源不存在');

    const qb = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.user', 'user')
      .leftJoinAndSelect('resource.category', 'category')
      .where('resource.id <> :id', { id })
      .andWhere('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 })
      .orderBy('resource.rating_average', 'DESC')
      .addOrderBy('resource.download_count', 'DESC')
      .addOrderBy('resource.created_at', 'DESC')
      .take(Math.min(Math.max(Number(limit) || 6, 1), 12));

    if (resource.category_id) {
      qb.andWhere('resource.category_id = :categoryId', { categoryId: resource.category_id });
    } else if (resource.resource_kind) {
      qb.andWhere('resource.resource_kind = :resourceKind', { resourceKind: resource.resource_kind });
    }

    const related = await qb.getMany();
    return this.normalizeResources(related);
  }

  async incrementDownload(id: number): Promise<void> {
    await this.resourceRepository.increment({ id }, 'download_count', 1);
  }

  async getByUserId(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<any> {
    const where: any = { user_id: userId };

    let cursorCondition: any = {};
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue = new Date(parseInt(decoded[0]));
        const idValue = parseInt(decoded[1]);

        cursorCondition = [
          { created_at: LessThan(cursorValue) },
          { created_at: cursorValue, id: LessThan(idValue) },
        ];
      } catch {
        // Ignore invalid cursors.
      }
    }

    const resources = await this.resourceRepository.find({
      where: cursorCondition.length > 0
        ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
        : where,
      relations: ['user', 'category'],
      order: {
        created_at: 'DESC',
        id: 'DESC',
      },
      take: Number(limit) + 1,
    });

    const hasMore = resources.length > Number(limit);
    if (hasMore) {
      resources.pop();
    }

    let nextCursor: string | null = null;
    if (hasMore && resources.length > 0) {
      const lastResource = resources[resources.length - 1];
      const cursorValue = lastResource.created_at.getTime().toString();
      nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
    }

    return {
      data: await this.normalizeResources(resources),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  /**
   * Get public approved resources by user ID (for user profile display)
   */
  async getPublicByUserId(
    userId: number,
    limit: number = 20,
    cursor?: string,
    page?: number,
  ): Promise<any> {
    const qb = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.user', 'user')
      .leftJoin('resource.category', 'category')
      .where('resource.user_id = :userId', { userId })
      .andWhere('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 });

    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue = new Date(parseInt(decoded[0]));
        const idValue = parseInt(decoded[1]);

        qb.andWhere(
          `(resource.created_at < :cursorValue OR (resource.created_at = :cursorValue AND resource.id < :idValue))`,
          { cursorValue, idValue },
        );
      } catch {
        // Ignore invalid cursors.
      }
    }

    qb.orderBy('resource.created_at', 'DESC')
      .addOrderBy('resource.id', 'DESC');

    if (page !== undefined && !cursor) {
      const safePage = Math.max(1, Number(page));
      const safeLimit = Number(limit);
      const [resources, total] = await qb
        .skip((safePage - 1) * safeLimit)
        .take(safeLimit)
        .getManyAndCount();

      return {
        data: await this.normalizeResources(resources),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        },
      };
    }

    qb.take(Number(limit) + 1);

    const resources = await qb.getMany();

    const hasMore = resources.length > Number(limit);
    if (hasMore) {
      resources.pop();
    }

    let nextCursor: string | null = null;
    if (hasMore && resources.length > 0) {
      const lastResource = resources[resources.length - 1];
      const cursorValue = lastResource.created_at.getTime().toString();
      nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
    }

    return {
      data: await this.normalizeResources(resources),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async update(
    id: number,
    userId: number,
    dto: UpdateResourceDto,
    userRole?: string,
    provenance: { ipAddress?: string } = {},
  ): Promise<any> {
    const updateResult = await this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, {
        where: { id },
        relations: ['user'],
      });

      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      // Staff may edit any resource — this branch was missing, unlike PostsService.
      const isStaff = userRole === 'admin' || userRole === 'moderator';
      if (resource.user_id !== userId && !isStaff) {
        throw new ForbiddenException('没有权限编辑此资源');
      }

      const categoryId = this.toOptionalNumber((dto as any).category_id);
      if (categoryId && categoryId !== resource.category_id) {
        const category = await manager.findOne(ResourceCategory, {
          where: { id: categoryId },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      const updateData: Partial<Resource> = {};

      const requestedResourceType = dto.resource_type
        ? this.normalizeResourceType(dto.resource_type)
        : resource.resource_type;
      const requestedResourceKind = dto.resource_kind ?? resource.resource_kind ?? 'other';
      if ((requestedResourceKind === 'map' || requestedResourceKind === 'schematic') && dto.external_url !== undefined) {
        throw new BadRequestException('地图和蓝图只能使用本站托管文件，不能设置外链地址');
      }
      this.assertKindFileContract(requestedResourceKind, requestedResourceType, resource.file_name || undefined);

      if (dto.title) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.resource_type) {
        if (!['upload', 'external'].includes(requestedResourceType)) {
          throw new BadRequestException('无效的资源类型');
        }
        updateData.resource_type = requestedResourceType;
      }
      if (dto.resource_kind !== undefined) {
        updateData.resource_kind = requestedResourceKind;
        if (!this.resourcePreviewService?.supports({ resource_kind: requestedResourceKind } as Resource)) {
          updateData.renderer_status = null;
          updateData.renderer_error_code = null;
          updateData.renderer_preview_key = null;
          updateData.renderer_parser_version = null;
          updateData.renderer_metadata_json = null;
        }
      }
      if (dto.external_url !== undefined) {
        if (dto.external_url && !isSafeExternalUrl(dto.external_url)) {
          throw new BadRequestException('外部链接必须是 http 或 https 地址');
        }
        updateData.external_url = dto.external_url;
      }
      if (dto.version !== undefined) updateData.version = dto.version;
      if (dto.content !== undefined) {
        updateData.content = dto.content;
        updateData.content_html = parseMarkdown(dto.content);
      }
      if ((dto as any).category_id !== undefined) updateData.category_id = categoryId;
      if ((dto as any).is_public !== undefined) {
        updateData.is_public = this.toTinyInt((dto as any).is_public, resource.is_public);
      }
      if ((dto as any).metadata !== undefined) {
        updateData.metadata_json = mergeResourceMetadata(resource.metadata_json, (dto as any).metadata);
      }

      const contentChanged = ['title', 'description', 'content', 'external_url'].some(
        (field) => Object.prototype.hasOwnProperty.call(dto, field),
      );
      const risk = contentChanged && this.contentSafety
        ? await this.contentSafety.assess(this.resourceSafetyText({
          title: dto.title ?? resource.title,
          description: dto.description ?? resource.description,
          content: dto.content ?? resource.content,
          externalUrl: dto.external_url ?? resource.external_url,
          fileName: resource.file_name,
        }))
        : this.emptyContentRisk();

      // Changing what people actually download has to go back through moderation.
      // Otherwise an owner could get a benign resource approved and then swap
      // `external_url` for a malware link while keeping the approved badge.
      const payloadChanged =
        (dto.external_url !== undefined && dto.external_url !== resource.external_url) ||
        (dto.resource_type !== undefined &&
          updateData.resource_type !== undefined &&
          updateData.resource_type !== resource.resource_type);

      const requiresSafetyReview = risk.mustReview;
      const wasPublic = PUBLIC_RESOURCE_STATUSES.includes(resource.status as any);
      if ((requiresSafetyReview || (payloadChanged && !isStaff)) && wasPublic) {
        updateData.status = 'pending';
      }

      await manager.update(Resource, id, updateData);

      const result = await manager.findOne(Resource, {
        where: { id },
        relations: ['user', 'category'],
      });

      if (!result) {
        throw new NotFoundException('资源不存在');
      }

      return {
        resource: result,
        risk,
        needsModerationNotice: updateData.status === RESOURCE_STATUS_PENDING && resource.status !== RESOURCE_STATUS_PENDING,
      };
    });

    if (this.contentSafety) {
      await this.contentSafety.recordFlag({
        userId,
        targetType: 'resource',
        targetId: updateResult.resource.id,
        risk: updateResult.risk,
        ipAddress: provenance.ipAddress,
      }).catch(() => undefined);
    }

    if (updateResult.needsModerationNotice) {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'resource',
        item_id: updateResult.resource.id,
        title: updateResult.resource.title,
        content: updateResult.resource.description || updateResult.resource.content || updateResult.resource.external_url || updateResult.resource.file_name || null,
        author_username: updateResult.resource.user?.username || `#${userId}`,
        action_url: '/admin/resources/moderation',
      }).catch((err) => console.error('Admin resource moderation notification error:', err));
    }

    return this.normalizeOneResource(updateResult.resource);
  }

  async delete(id: number, userId: number, userRole?: string): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    const isStaff = userRole === 'admin' || userRole === 'moderator';
    if (resource.user_id !== userId && !isStaff) {
      throw new ForbiddenException('没有权限删除此资源');
    }

    await this.softDeleteResource(resource);
  }

  async adminDelete(id: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    await this.softDeleteResource(resource);
  }

  /**
   * Retire a resource, matching how posts and replies are deleted.
   *
   * `resources.deleted_at` has existed for a while, so hard-deleting the row (and
   * its versions, and the files on disk) was both inconsistent with the rest of
   * the forum and unrecoverable. Once the row is soft-deleted the entity's
   * `@DeleteDateColumn` hides it from every read, so the forum stops serving it.
   *
   * An MFL-hosted payload is reachable by direct link regardless of what the forum
   * shows, so it is explicitly quarantined. Local files stay on disk until the row
   * is purged — see the note in the accompanying report; no retention sweep covers
   * `resources` yet.
   */
  private async softDeleteResource(resource: Resource): Promise<void> {
    if (resource.use_mfl && resource.mfl_file_id) {
      await this.mflClientService.blockDownloads(
        resource.mfl_file_id,
        resource.id,
        'the forum resource was deleted',
      );
    }

    await this.resourceRepository.softDelete(resource.id);
  }

  private async promoteResourceFile(filePath: string | null | undefined): Promise<string | null | undefined> {
    if (!this.resourceStorageService || !filePath) return filePath;
    try {
      return await this.resourceStorageService.promote(filePath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new UnprocessableEntityException('资源文件不存在或已失效，请重新上传后再审核');
      }
      throw error;
    }
  }

  async updateStatus(
    id: number,
    status: string,
    options: { actorUsername?: string | null; rejectReason?: string | null } = {},
  ): Promise<any> {
    const validStatuses: string[] = [
      RESOURCE_STATUS_PENDING,
      RESOURCE_STATUS_APPROVED,
      RESOURCE_STATUS_REJECTED,
    ];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('无效的状态');
    }

    const existingResource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!existingResource) {
      throw new NotFoundException('资源不存在');
    }

    if (existingResource.status !== status) {
      if (status === RESOURCE_STATUS_APPROVED && this.resourceStorageService) {
        const promotedResourcePath = await this.promoteResourceFile(existingResource.file_path);
        if (typeof promotedResourcePath === 'string' && promotedResourcePath !== existingResource.file_path) {
          await this.resourceRepository.update(id, { file_path: promotedResourcePath });
          existingResource.file_path = promotedResourcePath;
        }
        const versions = await this.versionRepository.find({ where: { resource_id: id } });
        for (const version of versions) {
          const promotedVersionPath = await this.promoteResourceFile(version.file_path);
          if (typeof promotedVersionPath === 'string' && promotedVersionPath !== version.file_path) {
            await this.versionRepository.update(version.id, { file_path: promotedVersionPath });
            await this.resourceFileRepository.update(
              { resource_version_id: version.id, role: 'primary' },
              { storage_key: promotedVersionPath },
            );
          }
        }
      }
      const updateData: Partial<Resource> = { status };
      if (status === RESOURCE_STATUS_REJECTED) {
        updateData.reject_reason = options.rejectReason || null;
      } else if (status === RESOURCE_STATUS_APPROVED) {
        updateData.reject_reason = null;
      }
      await this.resourceRepository.update(id, updateData);
      await this.syncLatestV2ReleaseStatus(id, status);

      // Sync approval status to MFL if applicable
      if (existingResource.use_mfl && existingResource.mfl_file_id) {
        const mflStatus = status === RESOURCE_STATUS_APPROVED ? 'approved'
          : status === RESOURCE_STATUS_REJECTED ? 'rejected' : null;
        if (mflStatus) {
          this.mflClientService.updateApprovalStatus(
            existingResource.mfl_file_id,
            mflStatus,
            id,
          ).catch((err) =>
            console.error('MFL approval sync error:', err),
          );
        }
      }
    }

    const resource = existingResource.status === status
      ? existingResource
      : await this.resourceRepository.findOne({
        where: { id },
        relations: ['user', 'category'],
      });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    if (
      existingResource.status !== status
      && [RESOURCE_STATUS_APPROVED, RESOURCE_STATUS_REJECTED].includes(status as any)
    ) {
      this.adminNotificationsService.publishModerationResult({
        item_type: 'resource',
        item_id: resource.id,
        action: status as 'approved' | 'rejected',
        actor_username: options.actorUsername || undefined,
        subject: resource.title,
        action_url: `/admin/resources?status=${status}`,
      }).catch((err) =>
        console.error('Admin resource moderation result notification error:', err),
      );

      // Notify the resource author about the moderation result
      const notificationContent = status === RESOURCE_STATUS_APPROVED
        ? `你的资源「${resource.title}」已通过审核`
        : `你的资源「${resource.title}」未通过审核${options.rejectReason ? '：' + options.rejectReason : ''}`;

      this.notificationsService.create({
        user_id: resource.user_id,
        type: 'system',
        content: notificationContent,
        emailEvent: 'system',
      }).catch((err) =>
        console.error('Resource author notification error:', err),
      );

      if (status === RESOURCE_STATUS_APPROVED) {
        if (resource.renderer_status !== 'ready' && this.resourcePreviewService?.supports(resource)) {
          void this.resourcePreviewService.enqueue(resource).catch((err) =>
            console.error(`Resource preview enqueue error for ${resource.id}:`, err),
          );
        }
        this.resourceSubscriptionsService?.notifyResourceUpdate(resource)
          .catch((err) => console.error('Resource subscriber notification error:', err));
      }
    }

    return this.normalizeOneResource(resource);
  }

  async setFeatured(id: number, featured: boolean): Promise<any> {
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource) throw new NotFoundException('资源不存在');
    await this.resourceRepository.update(id, { is_featured: featured ? 1 : 0 });
    const updated = await this.resourceRepository.findOne({ where: { id }, relations: ['user', 'category'] });
    return updated ? this.normalizeOneResource(updated) : null;
  }

  /** Keep the resource-level moderation workflow projected onto its latest release. */
  private async syncLatestV2ReleaseStatus(resourceId: number, resourceStatus: string): Promise<void> {
    const latest = await this.versionRepository.find({
      where: { resource_id: resourceId },
      order: { created_at: 'DESC', id: 'DESC' },
      take: 1,
    });
    const release = latest[0];
    if (!release) return;

    if (resourceStatus === RESOURCE_STATUS_APPROVED) {
      await this.versionRepository.update(release.id, {
        status: 'published',
        published_at: new Date(),
      } as Partial<ResourceVersion>);
      await this.resourceRepository.update(resourceId, {
        latest_published_version_id: release.id,
      });
    } else if (resourceStatus === RESOURCE_STATUS_REJECTED) {
      await this.versionRepository.update(release.id, {
        status: 'rejected',
      } as Partial<ResourceVersion>);
    }
  }

  async countByStatus(status: string): Promise<number> {
    return this.resourceRepository.count({
      where: { status },
    });
  }

  /**
   * Upsert a user's rating for a resource.
   * Creates or updates the rating and maintains denormalized aggregates.
   */
  async upsertRating(resourceId: number, userId: number, rating: number): Promise<any> {
    if (!isValidRating(rating)) {
      throw new BadRequestException('评分必须是 1 到 5 的整数');
    }

    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, { where: { id: resourceId } });
      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      // Locking the caller's own rating row (there is a unique index on
      // resource_id+user_id) serialises concurrent submissions from the same user,
      // so `oldRating` cannot go stale between here and the aggregate update.
      const existingRating = await manager.findOne(ResourceRating, {
        where: { resource_id: resourceId, user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      const oldRating = existingRating?.rating ?? null;

      if (existingRating) {
        await manager.update(ResourceRating, existingRating.id, { rating });
      } else {
        await manager.save(
          ResourceRating,
          manager.create(ResourceRating, {
            resource_id: resourceId,
            user_id: userId,
            rating,
          }),
        );
      }

      await this.applyRatingDelta(manager, resourceId, oldRating, rating);

      const updatedResource = await manager.findOne(Resource, {
        where: { id: resourceId },
        relations: ['user', 'category'],
      });

      return this.normalizeOneResource(updatedResource!);
    });
  }

  /**
   * Delete a user's rating for a resource.
   */
  async deleteRating(resourceId: number, userId: number): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, { where: { id: resourceId } });
      if (!resource) {
        throw new NotFoundException('资源不存在');
      }

      const existingRating = await manager.findOne(ResourceRating, {
        where: { resource_id: resourceId, user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existingRating) {
        throw new NotFoundException('未找到评分记录');
      }

      await manager.delete(ResourceRating, existingRating.id);

      await this.applyRatingDelta(manager, resourceId, existingRating.rating, null);

      const updatedResource = await manager.findOne(Resource, {
        where: { id: resourceId },
        relations: ['user', 'category'],
      });

      return this.normalizeOneResource(updatedResource!);
    });
  }

  /**
   * Apply a rating change to the denormalized aggregates in a single statement.
   *
   * The counters are shifted by a delta rather than overwritten with values
   * computed in JS from an earlier SELECT: two users rating a resource at the same
   * time both read the same `rating_count`/`rating_sum` and the second write
   * silently discarded the first, corrupting the aggregate for good.
   *
   * `rating_average` is derived in the same statement — MySQL evaluates SET
   * expressions left to right and later ones see the already-updated columns.
   * GREATEST(..., 0) keeps a replayed delete from pushing the counters negative.
   */
  private async applyRatingDelta(
    manager: EntityManager,
    resourceId: number,
    oldRating: number | null,
    newRating: number | null,
  ): Promise<void> {
    const { countDelta, sumDelta } = ratingAggregateDelta(oldRating, newRating);
    if (countDelta === 0 && sumDelta === 0) {
      return;
    }

    await manager.query(
      `UPDATE resources
          SET rating_count = GREATEST(rating_count + ?, 0),
              rating_sum = GREATEST(rating_sum + ?, 0),
              rating_average = CASE WHEN rating_count > 0
                                    THEN ROUND(rating_sum / rating_count, 2)
                                    ELSE 0 END
        WHERE id = ?`,
      [countDelta, sumDelta, resourceId],
    );
  }

  /**
   * Get a user's rating for a resource.
   */
  async getUserRating(resourceId: number, userId: number): Promise<number | null> {
    const rating = await this.ratingRepository.findOne({
      where: { resource_id: resourceId, user_id: userId },
    });

    return rating?.rating ?? null;
  }

  async getHotResources(limit: number = 10): Promise<any[]> {
    const resources = await this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.user', 'user')
      .leftJoin('resource.category', 'category')
      .where('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 })
      .orderBy('resource.download_count', 'DESC')
      .take(limit)
      .getMany();

    return this.normalizeResources(resources);
  }
}
