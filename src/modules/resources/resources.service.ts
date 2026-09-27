import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, UnprocessableEntityException, Optional } from '@nestjs/common';
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
import { resolveOptionalContentSource } from '@common/utils/tiptap-content.util';
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
import { createHash } from 'crypto';
import { ConsumedResourcePreviewDraft, ResourcePreviewService } from './resource-preview.service';
import { ResourceDuplicateService, RESOURCE_DUPLICATE_STATUSES } from './resource-duplicate.service';
import { SiteConfigService } from '@config/site-profile';

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
    @Optional() private resourceDuplicateService?: ResourceDuplicateService,
    @Optional() private siteConfig?: SiteConfigService,
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
    provenance: { ipAddress?: string; rendererDraft?: ConsumedResourcePreviewDraft; uploadSessionId?: string; idempotencyKey?: string; idempotencyPayload?: unknown } = {},
  ): Promise<any> {
    const categoryId = this.toOptionalNumber((dto as any).category_id);
    const resourceType = this.normalizeResourceType(dto.resource_type);
    const resourceKind = dto.resource_kind || 'other';
    const idempotencyKey = this.validateIdempotencyKey(provenance.idempotencyKey);
    const payloadFingerprint = this.hashCanonical(provenance.idempotencyPayload ?? dto);
    const requestFingerprint = this.hashCanonical({ payloadFingerprint, content_hash: file?.content_hash || null });

    if (idempotencyKey) {
      const replay = await this.findIdempotentSubmission(userId, idempotencyKey, payloadFingerprint, requestFingerprint);
      if (replay) return replay;
    }

    const rendererMetadata = provenance.rendererDraft?.metadata || null;
    const structureHash = typeof rendererMetadata?.structure_hash === 'string' ? rendererMetadata.structure_hash : null;
    const normalizedStructureHash = typeof rendererMetadata?.normalized_structure_hash === 'string' ? rendererMetadata.normalized_structure_hash : null;
    const duplicate = this.resourceDuplicateService ? await this.resourceDuplicateService.inspect({
      contentHash: file?.content_hash,
      structureHash,
      normalizedStructureHash,
      resourceKind,
      sourceUrl: dto.source_url,
      title: dto.title,
    }) : null;
    if (duplicate?.exact) throw this.duplicateConflict(duplicate.existing_resources[0]);
    if (duplicate?.structure && !dto.duplicate_note?.trim()) {
      throw new ConflictException({
        code: 'RESOURCE_STRUCTURE_DUPLICATE',
        message: '发现一个结构相同的蓝图。请说明用途或内容上的区别后继续提交。',
        existing_resources: duplicate.existing_resources,
      });
    }

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

    const contentSource = resolveOptionalContentSource(dto.content, dto.content_json);
    dto.content = contentSource?.content || undefined;
    const risk = this.contentSafety
      ? await this.contentSafety.assess(this.resourceSafetyText({
        title: dto.title,
        description: dto.description,
        content: contentSource?.content,
        externalUrl: dto.external_url,
        fileName: file?.file_name,
      }))
      : this.emptyContentRisk();
    const requiresModeration = risk.mustReview || (this.siteConfig?.isEnabled('resourcePreModeration') ?? true);

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
      structure_hash: structureHash,
      normalized_structure_hash: normalizedStructureHash,
      duplicate_note: dto.duplicate_note?.trim() || null,
      external_url: resourceType === 'external' ? dto.external_url : undefined,
      version: dto.version,
      source_url: dto.source_url || null,
      license: dto.license?.trim() || null,
      content: contentSource?.content || null,
      content_language: dto.content_language?.trim() || 'unknown',
      content_html: contentSource?.content_html || null,
      content_json: contentSource?.content_json || null,
      content_text: contentSource?.content_text || null,
      category_id: categoryId,
      is_public: this.toTinyInt((dto as any).is_public, 1),
      status: requiresModeration ? RESOURCE_STATUS_PENDING : RESOURCE_STATUS_APPROVED,
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
    } as any) as unknown as Resource;

    let replayed = false;
    const saved = await this.dataSource.transaction(async (manager) => {
      if (idempotencyKey) {
        await manager.query('DELETE FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ? AND expires_at <= NOW()', [userId, idempotencyKey]);
        try {
          await manager.query(`INSERT INTO resource_submission_idempotency
            (user_id, idempotency_key, request_fingerprint, payload_fingerprint, resource_id, expires_at)
            VALUES (?, ?, ?, ?, NULL, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
          [userId, idempotencyKey, requestFingerprint, payloadFingerprint]);
        } catch (error: any) {
          if (!['ER_DUP_ENTRY', 1062].includes(error?.code) && error?.errno !== 1062) throw error;
          const rows = await manager.query(`SELECT request_fingerprint, payload_fingerprint, resource_id
            FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ? AND expires_at > NOW() FOR UPDATE`, [userId, idempotencyKey]);
          const prior = rows?.[0];
          if (!prior || prior.payload_fingerprint !== payloadFingerprint || prior.request_fingerprint !== requestFingerprint) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key 已用于另一份资源请求。' });
          }
          if (prior.resource_id) {
            const existing = await manager.findOne(Resource, { where: { id: Number(prior.resource_id) }, relations: ['user', 'category'] });
            if (existing) { replayed = true; return existing; }
            await manager.query('DELETE FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ?', [userId, idempotencyKey]);
            await manager.query(`INSERT INTO resource_submission_idempotency
              (user_id, idempotency_key, request_fingerprint, payload_fingerprint, resource_id, expires_at)
              VALUES (?, ?, ?, ?, NULL, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
            [userId, idempotencyKey, requestFingerprint, payloadFingerprint]);
          } else {
            throw new ConflictException({ code: 'IDEMPOTENCY_IN_PROGRESS', message: '相同的资源请求仍在处理中，请稍后使用相同 Idempotency-Key 重试。' });
          }
        }
      }

      const resource = await manager.save(Resource, newResource);
      if (file?.content_hash) await this.claimContentHash(manager, file.content_hash, resource.id);
      if (structureHash) await this.claimStructureHash(manager, structureHash, resource.id, dto.duplicate_note?.trim() || '');
      await this.createInitialV2Aggregate(manager, resource, dto, userId, file, contentSource);
      if (idempotencyKey) {
        await manager.query('UPDATE resource_submission_idempotency SET resource_id = ? WHERE user_id = ? AND idempotency_key = ?', [resource.id, userId, idempotencyKey]);
      }
      return resource;
    });

    const finalResult = await this.resourceRepository.findOne({
      where: { id: saved.id },
      relations: ['user', 'category'],
    });

    if (!finalResult) {
      throw new NotFoundException('资源不存在');
    }

    if (replayed) return this.normalizeOneResource(finalResult);

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
    contentSource: ReturnType<typeof resolveOptionalContentSource>,
  ): Promise<void> {
      const release = await manager.save(ResourceVersion, manager.create(ResourceVersion, {
        resource_id: resource.id,
        public_id: randomUUID(),
        // This is strictly the resource's own release version. Mindustry build
        // compatibility is represented below in ResourceVersionCompatibility.
        version: dto.version.trim(),
        release_channel: 'stable',
        status: resource.status === RESOURCE_STATUS_APPROVED ? 'published' : 'pending_review',
        ...(resource.status === RESOURCE_STATUS_APPROVED ? { published_at: new Date() } : {}),
        release_notes_markdown: contentSource?.content.trim() || null,
        release_notes_html: contentSource?.content_html || null,
        created_by_user_id: submitterUserId,
        file_path: file?.file_path || null,
        file_name: file?.file_name || null,
        file_size: file?.file_size || null,
        mime_type: file?.mime_type || null,
        content_hash: file?.content_hash || null,
      } as Partial<ResourceVersion>));
      if (resource.status === RESOURCE_STATUS_APPROVED) {
        await manager.update(Resource, resource.id, { latest_published_version_id: release.id });
      }

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

      const compatibility: Array<{
        min_version_value?: string;
        max_version_value?: string;
        channel?: string;
        notes?: string;
        provenance: 'user_declared' | 'inferred';
        confidence: 'low' | 'medium' | 'high' | null;
      }> = (dto.compatibility || []).map((item) => ({ ...item, provenance: 'user_declared', confidence: null }));
      const renderer = (resource.renderer_metadata_json || {}) as Record<string, any>;
      const inferred = renderer.compatibility?.minimum_supported_build;
      const inferredBuild = inferred === null || inferred === undefined ? NaN : Number(inferred);
      if (Number.isFinite(inferredBuild) && inferredBuild > 0) compatibility.push({
        min_version_value: String(inferredBuild), max_version_value: undefined, channel: undefined,
        notes: '基于蓝图内容自动推测', provenance: 'inferred', confidence: renderer.compatibility.confidence || 'low',
      });
      if (compatibility.length) {
        await manager.save(ResourceVersionCompatibility, compatibility.map((item) => manager.create(ResourceVersionCompatibility, {
          resource_version_id: release.id,
          runtime: 'mindustry',
          min_version_value: item.min_version_value?.trim() || null,
          max_version_value: item.max_version_value?.trim() || null,
          channel: item.channel?.trim() || null,
          notes: item.notes?.trim() || null,
          provenance: item.provenance || 'user_declared',
          confidence: item.confidence || null,
        })));
      }
  }

  async findIdempotentReplay(userId: number, key: string | undefined, dto: Record<string, unknown>): Promise<any | null> {
    const normalizedKey = this.validateIdempotencyKey(key);
    if (!normalizedKey) return null;
    const payloadFingerprint = this.hashCanonical(dto);
    const rows = await this.dataSource.query(`SELECT request_fingerprint, payload_fingerprint, resource_id
      FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ? AND expires_at > NOW()`, [userId, normalizedKey]);
    const prior = rows?.[0];
    if (!prior) return null;
    if (prior.payload_fingerprint !== payloadFingerprint) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key 已用于另一份资源请求。' });
    }
    if (!prior.resource_id) return null;
    const existing = await this.getByIdWithVersions(Number(prior.resource_id), { id: userId, role: 'user' });
    if (existing) return existing;
    await this.dataSource.query('DELETE FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ? AND resource_id = ?', [userId, key, Number(prior.resource_id)]);
    return null;
  }

  private validateIdempotencyKey(key?: string): string | null {
    if (!key) return null;
    const value = key.trim();
    if (!/^[\x21-\x7e]{1,128}$/.test(value)) throw new BadRequestException('Idempotency-Key 格式无效');
    return value;
  }

  private hashCanonical(value: unknown): string {
    const canonical = (input: any): any => {
      if (Array.isArray(input)) return input.map(canonical);
      if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical(input[key])]));
      return input;
    };
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
  }

  private async findIdempotentSubmission(userId: number, key: string, payloadFingerprint: string, requestFingerprint: string): Promise<any | null> {
    const rows = await this.dataSource.query(`SELECT request_fingerprint, payload_fingerprint, resource_id
      FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ? AND expires_at > NOW()`, [userId, key]);
    const prior = rows?.[0];
    if (!prior) return null;
    if (prior.payload_fingerprint !== payloadFingerprint || prior.request_fingerprint !== requestFingerprint) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key 已用于另一份资源请求。' });
    }
    if (!prior.resource_id) return null;
    const existing = await this.getByIdWithVersions(Number(prior.resource_id), { id: userId, role: 'user' });
    if (existing) return existing;
    await this.dataSource.query('DELETE FROM resource_submission_idempotency WHERE user_id = ? AND idempotency_key = ? AND resource_id = ?', [userId, key, Number(prior.resource_id)]);
    return null;
  }

  private duplicateConflict(existing?: { id: number | null; public_id?: string | null; title: string; status: string; url: string; is_public?: number; category_visible?: boolean }): ConflictException {
    const visible = existing && existing.id !== null
      && (existing.is_public === undefined || Number(existing.is_public) === 1)
      && existing.category_visible !== false
      && ['approved', 'published'].includes(existing.status);
    return new ConflictException({
      code: 'RESOURCE_DUPLICATE',
      message: '这个文件已经提交过了。',
      existing_resource: visible ? { id: existing.id, public_id: existing.public_id || null, title: existing.title, status: existing.status, url: existing.url } : {
        id: null, public_id: null, title: '已有资源正在审核或不可见', status: 'pending', url: '/resources',
      },
    });
  }

  async claimResourceVersionHash(manager: EntityManager, contentHash: string, resourceId: number): Promise<void> {
    return this.claimContentHash(manager, contentHash, resourceId, false);
  }

  private async claimContentHash(manager: EntityManager, contentHash: string, resourceId: number, allowSameResource = true): Promise<void> {
    try {
      await manager.query('INSERT INTO resource_content_hash_claims (content_hash, resource_id) VALUES (?, ?)', [contentHash, resourceId]);
      return;
    } catch (error: any) {
      if (!['ER_DUP_ENTRY', 1062].includes(error?.code) && error?.errno !== 1062) throw error;
    }
    const rows = await manager.query(`SELECT c.resource_id, r.public_id, r.title, r.status, r.is_public,
        (r.category_id IS NULL OR category.is_active = 1) AS category_visible
      FROM resource_content_hash_claims c
      INNER JOIN resources r ON r.id = c.resource_id
      LEFT JOIN resource_categories category ON category.id = r.category_id
      WHERE c.content_hash = ? AND r.deleted_at IS NULL AND r.status IN ('pending','pending_review','approved','published') FOR UPDATE`, [contentHash]);
    const existing = rows?.[0];
    if (existing && (Number(existing.resource_id) !== resourceId || !allowSameResource)) throw this.duplicateConflict({
      id: Number(existing.resource_id), public_id: existing.public_id || null, is_public: Number(existing.is_public),
      category_visible: Number(existing.category_visible) === 1,
      title: existing.title, status: existing.status, url: `/resources/${existing.resource_id}`,
    });
    await manager.query('UPDATE resource_content_hash_claims SET resource_id = ? WHERE content_hash = ?', [resourceId, contentHash]);
  }

  private async claimStructureHash(manager: EntityManager, structureHash: string, resourceId: number, duplicateNote: string): Promise<void> {
    await manager.query('INSERT IGNORE INTO resource_structure_hash_claims (structure_hash, resource_id) VALUES (?, ?)', [structureHash, resourceId]);
    await manager.query('SELECT resource_id FROM resource_structure_hash_claims WHERE structure_hash = ? FOR UPDATE', [structureHash]);
    const rows = await manager.query(`SELECT id, public_id, title, status, is_public FROM resources
      WHERE structure_hash = ? AND id <> ? AND deleted_at IS NULL AND merged_into_resource_id IS NULL
        AND status IN ('pending','pending_review','approved','published') ORDER BY id ASC LIMIT 1 FOR UPDATE`, [structureHash, resourceId]);
    const existing = rows?.[0];
    if (!existing) {
      await manager.query('UPDATE resource_structure_hash_claims SET resource_id = ? WHERE structure_hash = ?', [resourceId, structureHash]);
      return;
    }
    await manager.query('UPDATE resource_structure_hash_claims SET resource_id = ? WHERE structure_hash = ?', [Number(existing.id), structureHash]);
    if (duplicateNote.trim()) return;
    const visible = Number(existing.is_public) === 1 && ['approved', 'published'].includes(existing.status);
    const reference = visible
      ? { id: Number(existing.id), public_id: existing.public_id || null, title: existing.title, status: existing.status, url: `/resources/${existing.id}` }
      : { id: null, public_id: null, title: '已有资源正在审核或不可见', status: 'pending', url: '/resources' };
    throw new ConflictException({
      code: 'RESOURCE_STRUCTURE_DUPLICATE',
      message: '发现一个结构相同的蓝图。请说明用途或内容上的区别后继续提交。',
      existing_resources: [reference],
    });
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
      content_language,
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

      if (content_language?.trim()) {
        qb.andWhere('resource.content_language = :contentLanguage', { contentLanguage: content_language.trim() });
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

    if (content_language?.trim()) {
      where.content_language = content_language.trim();
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
    const compatibilities = versions.length ? await this.dataSource.query(
      `SELECT resource_version_id, runtime, min_version_value, max_version_value, channel, notes, provenance, confidence
       FROM resource_version_compatibilities WHERE resource_version_id IN (${versions.map(() => '?').join(',')})
       ORDER BY id ASC`, versions.map(({ id: versionId }) => versionId),
    ) : [];
    const byVersion = new Map<number, any[]>();
    for (const item of compatibilities || []) {
      const versionId = Number(item.resource_version_id);
      const rows = byVersion.get(versionId) || [];
      rows.push({ runtime: item.runtime, min_version_value: item.min_version_value, max_version_value: item.max_version_value,
        channel: item.channel, notes: item.notes, provenance: item.provenance, confidence: item.confidence });
      byVersion.set(versionId, rows);
    }
    return this.normalizeOneResource(resource, versions.map((version) => ({ ...version,
      compatibility: byVersion.get(version.id) || [],
    } as ResourceVersion)));
  }

  async findMergedResourceTarget(id: number): Promise<number | null> {
    let current = id;
    const visited = new Set<number>([id]);
    for (let depth = 0; depth < 12; depth += 1) {
      const rows = await this.dataSource.query('SELECT merged_into_resource_id FROM resources WHERE id = ? LIMIT 1', [current]);
      const next = Number(rows?.[0]?.merged_into_resource_id || 0);
      if (!next) return current === id ? null : current;
      if (visited.has(next)) throw new ConflictException('资源合并关系存在循环');
      visited.add(next);
      current = next;
    }
    throw new ConflictException('资源合并链超过安全深度');
  }

  private async resourceMergeCounts(query: (sql: string, params?: any[]) => Promise<any[]>, resourceId: number) {
    const tables = [
      'resource_comments', 'resource_favorites', 'resource_likes', 'resource_ratings',
      'resource_subscriptions', 'resource_attributions', 'resource_versions', 'resource_files',
      'download_events', 'resource_version_dependencies', 'content_relations',
      'knowledge_articles', 'game_content_upload_sessions', 'resource_media_links', 'resource_content_hash_claims', 'resource_structure_hash_claims',
      'resources',
    ];
    const presentRows = await query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => '?').join(',')})`, tables);
    const present = new Set((presentRows || []).map((row) => String(row.table_name)));
    const counts: Record<string, number> = {};
    const count = async (name: string, sql: string, params: any[] = [resourceId], resultKey = name) => {
      if (!present.has(name)) { counts[resultKey] = 0; return; }
      const rows = await query(sql, params);
      counts[resultKey] = Number(rows?.[0]?.count || 0);
    };
    await Promise.all([
      count('resource_comments', 'SELECT COUNT(*) AS count FROM resource_comments WHERE resource_id = ?'),
      count('resource_favorites', 'SELECT COUNT(*) AS count FROM resource_favorites WHERE resource_id = ?'),
      count('resource_likes', 'SELECT COUNT(*) AS count FROM resource_likes WHERE resource_id = ?'),
      count('resource_ratings', 'SELECT COUNT(*) AS count FROM resource_ratings WHERE resource_id = ?'),
      count('resource_subscriptions', 'SELECT COUNT(*) AS count FROM resource_subscriptions WHERE resource_id = ?'),
      count('resource_attributions', 'SELECT COUNT(*) AS count FROM resource_attributions WHERE resource_id = ?'),
      count('resource_versions', 'SELECT COUNT(*) AS count FROM resource_versions WHERE resource_id = ?'),
      count('resource_files', 'SELECT COUNT(*) AS count FROM resource_files f JOIN resource_versions v ON v.id = f.resource_version_id WHERE v.resource_id = ?'),
      count('download_events', 'SELECT COUNT(*) AS count FROM download_events WHERE resource_id = ?'),
      count('resource_version_dependencies', 'SELECT COUNT(*) AS count FROM resource_version_dependencies d JOIN resource_versions v ON v.id = d.resource_version_id WHERE v.resource_id = ?'),
      count('content_relations', `SELECT COUNT(*) AS count FROM content_relations
        WHERE (target_type = 'resource' AND target_id = CAST(? AS CHAR)) OR (source_type = 'resource' AND source_id = ?)`, [resourceId, resourceId]),
      count('knowledge_articles', 'SELECT COUNT(*) AS count FROM knowledge_articles WHERE related_resource_id = ?'),
      count('game_content_upload_sessions', 'SELECT COUNT(*) AS count FROM game_content_upload_sessions WHERE resource_id = ?'),
      count('resource_media_links', 'SELECT COUNT(*) AS count FROM resource_media_links WHERE resource_id = ?'),
      count('resources', `SELECT COUNT(*) AS count FROM resources
        WHERE id = ? AND (file_path IS NOT NULL OR content_hash IS NOT NULL OR mfl_file_id IS NOT NULL OR external_url IS NOT NULL)`, [resourceId], 'legacy_root_file'),
    ]);
    return counts;
  }

  async previewResourceMerge(sourceId: number, targetId: number) {
    if (sourceId === targetId) throw new BadRequestException('来源资源和目标资源不能相同');
    const [source, target] = await Promise.all([
      this.resourceRepository.findOne({ where: { id: sourceId } }),
      this.resourceRepository.findOne({ where: { id: targetId } }),
    ]);
    if (!source || !target) throw new NotFoundException('来源或目标资源不存在');
    if (source.merged_into_resource_id) throw new ConflictException({ code: 'RESOURCE_ALREADY_MERGED', canonical_id: source.merged_into_resource_id });
    if (target.merged_into_resource_id) throw new ConflictException({ code: 'MERGE_TARGET_IS_NOT_CANONICAL', canonical_id: target.merged_into_resource_id });
    const sourcePublic = Number(source.is_public) === 1 && PUBLIC_RESOURCE_STATUSES.includes(source.status as any);
    const targetPublic = Number(target.is_public) === 1 && PUBLIC_RESOURCE_STATUSES.includes(target.status as any);
    if (sourcePublic && !targetPublic) throw new BadRequestException('公开资源只能合并到另一个公开资源，避免旧链接失效');
    const [sourceCounts, targetCounts] = await Promise.all([
      this.resourceMergeCounts((sql, params) => this.dataSource.query(sql, params), sourceId),
      this.resourceMergeCounts((sql, params) => this.dataSource.query(sql, params), targetId),
    ]);
    const versions = await this.dataSource.query(`SELECT COUNT(*) AS count FROM resource_versions sv
      INNER JOIN resource_versions tv ON tv.resource_id = ? AND tv.version = sv.version
      WHERE sv.resource_id = ?`, [targetId, sourceId]);
    return {
      source: { id: source.id, title: source.title, status: source.status },
      target: { id: target.id, title: target.title, status: target.status },
      source_counts: sourceCounts,
      target_counts: targetCounts,
      version_name_collisions: Number(versions?.[0]?.count || 0),
      policy: {
        interactions: '按用户去重后合并到目标资源',
        colliding_versions: '不覆盖目标版本；仅在来源和目标版本都已发布时，把可用来源附件并入为补充文件',
        canonical_metadata: '目标标题与已有字段优先，空字段从来源补齐',
        source_record: '保留来源资源并标记为 merged，旧详情 API 返回永久重定向',
      },
    };
  }

  async mergeResource(sourceId: number, targetId: number, adminUserId: number) {
    if (sourceId === targetId) throw new BadRequestException('来源资源和目标资源不能相同');
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.query('SELECT * FROM resources WHERE id IN (?, ?) ORDER BY id FOR UPDATE', [sourceId, targetId]);
      const source = locked.find((row: any) => Number(row.id) === sourceId);
      const target = locked.find((row: any) => Number(row.id) === targetId);
      if (!source || !target) throw new NotFoundException('来源或目标资源不存在');
      if (source.deleted_at || target.deleted_at) throw new NotFoundException('来源或目标资源不存在');
      if (source.merged_into_resource_id) throw new ConflictException({ code: 'RESOURCE_ALREADY_MERGED', canonical_id: source.merged_into_resource_id });
      if (target.merged_into_resource_id) throw new ConflictException({ code: 'MERGE_TARGET_IS_NOT_CANONICAL', canonical_id: target.merged_into_resource_id });
      const sourcePublic = Number(source.is_public) === 1 && PUBLIC_RESOURCE_STATUSES.includes(source.status as any);
      const targetPublic = Number(target.is_public) === 1 && PUBLIC_RESOURCE_STATUSES.includes(target.status as any);
      if (sourcePublic && !targetPublic) throw new ConflictException({ code: 'MERGE_TARGET_MUST_BE_PUBLIC', message: '公开资源只能合并到另一个公开资源，避免旧链接失效。' });

      const tableRows = await manager.query(`SELECT table_name FROM information_schema.tables
        WHERE table_schema = DATABASE()`, []);
      const present = new Set((tableRows || []).map((row: any) => String(row.table_name)));
      const counts = await this.resourceMergeCounts((sql, params) => manager.query(sql, params), sourceId);
      const migrated: Record<string, number> = { preview: 0, version_collisions: 0 };
      const safely = async (table: string, sql: string, params: any[]) => {
        if (!present.has(table)) return 0;
        const result = await manager.query(sql, params);
        const changed = Number(result?.affectedRows ?? result?.raw?.affectedRows ?? 0);
        migrated[table] = (migrated[table] || 0) + changed;
        return changed;
      };
      migrated.preview = Object.values(counts).reduce((sum, value) => sum + value, 0);

      for (const [table, columns] of [
        ['resource_favorites', 'user_id, created_at'],
        ['resource_likes', 'user_id, created_at'],
      ] as Array<[string, string]>) {
        await safely(table, `INSERT IGNORE INTO ${table} (resource_id, ${columns}) SELECT ?, ${columns} FROM ${table} WHERE resource_id = ?`, [targetId, sourceId]);
        await safely(table, `DELETE FROM ${table} WHERE resource_id = ?`, [sourceId]);
      }
      await safely('resource_subscriptions', `INSERT IGNORE INTO resource_subscriptions (resource_id, user_id, notification_level, created_at)
        SELECT ?, user_id, notification_level, created_at FROM resource_subscriptions WHERE resource_id = ?`, [targetId, sourceId]);
      await safely('resource_subscriptions', 'DELETE FROM resource_subscriptions WHERE resource_id = ?', [sourceId]);
      await safely('resource_ratings', `INSERT IGNORE INTO resource_ratings (resource_id, user_id, rating, created_at, updated_at)
        SELECT ?, user_id, rating, created_at, updated_at FROM resource_ratings WHERE resource_id = ?`, [targetId, sourceId]);
      await safely('resource_ratings', 'DELETE FROM resource_ratings WHERE resource_id = ?', [sourceId]);
      await safely('resource_comments', 'UPDATE resource_comments SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);
      await safely('resource_attributions', 'UPDATE resource_attributions SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);
      await safely('resource_media_links', 'UPDATE resource_media_links SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);
      await safely('knowledge_articles', 'UPDATE knowledge_articles SET related_resource_id = ? WHERE related_resource_id = ?', [targetId, sourceId]);
      await safely('game_content_upload_sessions', 'UPDATE game_content_upload_sessions SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);

      const sourceVersions = present.has('resource_versions')
        ? await manager.query('SELECT id, version, status FROM resource_versions WHERE resource_id = ? ORDER BY id', [sourceId]) : [];
      const targetVersions = present.has('resource_versions')
        ? await manager.query('SELECT id, version, status FROM resource_versions WHERE resource_id = ?', [targetId]) : [];
      const targetVersionByName = new Map<string, { id: number; status: string | null }>(targetVersions.map((row: any) => [String(row.version), { id: Number(row.id), status: row.status || null }]));
      const versionIdMap = new Map<number, number>();
      const moveIds: number[] = [];
      const versionCollisionMappings: Array<{ source_version_id: number; target_version_id: number; attachments_migrated: boolean }> = [];
      for (const versionRow of sourceVersions) {
        const oldId = Number(versionRow.id);
        const existing = targetVersionByName.get(String(versionRow.version));
        if (existing) {
          versionIdMap.set(oldId, existing.id);
          migrated.version_collisions += 1;
          const canMigratePublishedEvidence = source.status === 'approved' || source.status === 'published'
            ? versionRow.status === 'published' && existing.status === 'published'
            : false;
          let attachmentsMigrated = false;
          if (canMigratePublishedEvidence && present.has('resource_files')) {
            attachmentsMigrated = await safely('resource_files', `UPDATE resource_files
              SET resource_version_id = ?, role = CASE WHEN role = 'primary' THEN 'supplementary' ELSE role END,
                  sort_order = 1000000 + id
              WHERE resource_version_id = ? AND availability_status = 'available'`, [existing.id, oldId]) > 0;
            if (present.has('resource_version_dependencies')) {
              await safely('resource_version_dependencies', 'UPDATE resource_version_dependencies SET resource_version_id = ? WHERE resource_version_id = ?', [existing.id, oldId]);
            }
            if (present.has('resource_version_compatibilities')) {
              await safely('resource_version_compatibilities', 'UPDATE resource_version_compatibilities SET resource_version_id = ? WHERE resource_version_id = ?', [existing.id, oldId]);
            }
          }
          versionCollisionMappings.push({ source_version_id: oldId, target_version_id: existing.id, attachments_migrated: attachmentsMigrated });
        } else {
          versionIdMap.set(oldId, oldId);
          targetVersionByName.set(String(versionRow.version), { id: oldId, status: versionRow.status || null });
          moveIds.push(oldId);
        }
      }
      if (moveIds.length) {
        await safely('resource_versions', `UPDATE resource_versions SET resource_id = ? WHERE id IN (${moveIds.map(() => '?').join(',')})`, [targetId, ...moveIds]);
      }
      if (present.has('download_events')) {
        for (const [oldVersionId, canonicalVersionId] of versionIdMap) {
          if (oldVersionId !== canonicalVersionId) await safely('download_events', 'UPDATE download_events SET version_id = ? WHERE version_id = ?', [canonicalVersionId, oldVersionId]);
        }
        await safely('download_events', 'UPDATE download_events SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);
      }
      await safely('resource_version_dependencies', `UPDATE resource_version_dependencies SET target_resource_id = ? WHERE target_resource_id = ?`, [targetId, sourceId]);
      if (present.has('content_relations')) {
        await safely('content_relations', `INSERT IGNORE INTO content_relations (source_type, source_id, target_type, target_id, relation_type, created_at)
          SELECT source_type, source_id, target_type, ?, relation_type, created_at FROM content_relations
          WHERE target_type = 'resource' AND target_id = CAST(? AS CHAR)`, [String(targetId), sourceId]);
        await safely('content_relations', `DELETE FROM content_relations WHERE target_type = 'resource' AND target_id = CAST(? AS CHAR)`, [sourceId]);
        await safely('content_relations', `INSERT IGNORE INTO content_relations (source_type, source_id, target_type, target_id, relation_type, created_at)
          SELECT source_type, ?, target_type, target_id, relation_type, created_at FROM content_relations
          WHERE source_type = 'resource' AND source_id = ?`, [targetId, sourceId]);
        await safely('content_relations', `DELETE FROM content_relations WHERE source_type = 'resource' AND source_id = ?`, [sourceId]);
      }

      const parseJson = (value: any) => {
        if (!value) return {};
        if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } }
        return typeof value === 'object' ? value : {};
      };
      const sourceMetadata = parseJson(source.metadata_json);
      const targetMetadata = parseJson(target.metadata_json);
      const mergedMetadata = { ...sourceMetadata, ...targetMetadata };
      if (Array.isArray(sourceMetadata.tags) || Array.isArray(targetMetadata.tags)) {
        mergedMetadata.tags = [...new Set([...(sourceMetadata.tags || []), ...(targetMetadata.tags || [])].filter((tag: unknown) => typeof tag === 'string'))];
      }
      const filledFields: Record<string, any> = {};
      for (const field of ['description', 'summary', 'resource_kind', 'resource_type', 'file_name', 'file_path', 'file_size', 'mime_type', 'content_hash', 'use_mfl', 'mfl_file_id', 'mfl_download_url', 'homepage_url', 'source_url', 'license', 'external_url', 'renderer_status', 'renderer_error_code', 'renderer_preview_key', 'renderer_parser_version', 'renderer_metadata_json', 'category_id']) {
        if ((target[field] === null || target[field] === undefined || target[field] === '') && source[field] !== null && source[field] !== undefined && source[field] !== '') filledFields[field] = source[field];
      }
      if (target.latest_published_version_id == null && source.latest_published_version_id != null) {
        filledFields.latest_published_version_id = versionIdMap.get(Number(source.latest_published_version_id)) || null;
      }
      const ratingRows = present.has('resource_ratings')
        ? await manager.query('SELECT COUNT(*) AS count, COALESCE(SUM(rating), 0) AS total FROM resource_ratings WHERE resource_id = ?', [targetId]) : [];
      const ratingCount = Number(ratingRows?.[0]?.count ?? Number(target.rating_count || 0) + Number(source.rating_count || 0));
      const ratingSum = Number(ratingRows?.[0]?.total ?? Number(target.rating_sum || 0) + Number(source.rating_sum || 0));
      const updates = {
        ...filledFields,
        metadata_json: JSON.stringify(mergedMetadata),
        download_count: Number(target.download_count || 0) + Number(source.download_count || 0),
        view_count: Number(target.view_count || 0) + Number(source.view_count || 0),
        rating_count: ratingCount,
        rating_sum: ratingSum,
        rating_average: ratingCount ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0,
      };
      await manager.createQueryBuilder().update('resources').set(updates).where('id = :id', { id: targetId }).execute();
      if (present.has('resource_content_hash_claims')) {
        await safely('resource_content_hash_claims', 'UPDATE resource_content_hash_claims SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);
      }
      if (present.has('resource_structure_hash_claims')) {
        await safely('resource_structure_hash_claims', 'UPDATE resource_structure_hash_claims SET resource_id = ? WHERE resource_id = ?', [targetId, sourceId]);
      }
      await manager.query(`UPDATE resources SET status = 'merged', is_public = 0, visibility = 'private', merged_into_resource_id = ?, updated_at = NOW()
        WHERE id = ?`, [targetId, sourceId]);
      await manager.query(`INSERT INTO resource_merge_logs (source_resource_id, target_resource_id, admin_user_id, migrated_counts)
        VALUES (?, ?, ?, ?)`, [sourceId, targetId, adminUserId, JSON.stringify({ ...migrated, preview_counts: counts, version_collision_mappings: versionCollisionMappings })]);
      return { source_id: sourceId, target_id: targetId, status: 'merged', migrated_counts: migrated, version_collision_mappings: versionCollisionMappings };
    });
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
    const hasContentUpdate = dto.content !== undefined || dto.content_json !== undefined;
    const contentSource = hasContentUpdate
      ? resolveOptionalContentSource(dto.content, dto.content_json)
      : undefined;
    if (contentSource) dto.content = contentSource.content;

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
      if (dto.content_language !== undefined) updateData.content_language = dto.content_language.trim() || 'unknown';
      if (hasContentUpdate) {
        updateData.content = contentSource?.content ?? null;
        updateData.content_html = contentSource?.content_html ?? null;
        updateData.content_json = contentSource?.content_json || null;
        updateData.content_text = contentSource?.content_text || null;
      }
      if ((dto as any).category_id !== undefined) updateData.category_id = categoryId;
      if ((dto as any).is_public !== undefined) {
        updateData.is_public = this.toTinyInt((dto as any).is_public, resource.is_public);
      }
      if ((dto as any).metadata !== undefined) {
        updateData.metadata_json = mergeResourceMetadata(resource.metadata_json, (dto as any).metadata);
      }

      const contentChanged = ['title', 'description', 'content', 'content_json', 'external_url'].some(
        (field) => Object.prototype.hasOwnProperty.call(dto, field),
      );
      const risk = contentChanged && this.contentSafety
        ? await this.contentSafety.assess(this.resourceSafetyText({
          title: dto.title ?? resource.title,
          description: dto.description ?? resource.description,
          content: contentSource?.content ?? resource.content,
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
    if (resource.content_hash) await this.releaseContentHashClaim(resource.content_hash);
    if (resource.structure_hash) await this.releaseStructureHashClaim(resource.structure_hash);
  }

  async releaseContentHashClaim(contentHash: string): Promise<void> {
    const rows = await this.dataSource.query(`SELECT MIN(resource_id) AS id FROM (
      SELECT r.id AS resource_id FROM resources r
        WHERE r.content_hash = ? AND r.deleted_at IS NULL AND r.status IN ('pending','pending_review','approved','published')
          AND r.merged_into_resource_id IS NULL
      UNION ALL
      SELECT rv.resource_id FROM resource_versions rv INNER JOIN resources r ON r.id = rv.resource_id
        WHERE rv.content_hash = ? AND (rv.status IS NULL OR rv.status IN ('pending','pending_review','published'))
          AND r.deleted_at IS NULL AND r.status IN ('pending','pending_review','approved','published') AND r.merged_into_resource_id IS NULL
      UNION ALL
      SELECT rv.resource_id FROM resource_files rf INNER JOIN resource_versions rv ON rv.id = rf.resource_version_id
        INNER JOIN resources r ON r.id = rv.resource_id
        WHERE rf.content_hash = ? AND rf.availability_status = 'available'
          AND (rv.status IS NULL OR rv.status IN ('pending','pending_review','published'))
          AND r.deleted_at IS NULL AND r.status IN ('pending','pending_review','approved','published') AND r.merged_into_resource_id IS NULL
    ) active_hash_owners`, [contentHash, contentHash, contentHash]);
    const activeId = rows?.[0]?.id;
    if (activeId) {
      await this.dataSource.query('UPDATE resource_content_hash_claims SET resource_id = ? WHERE content_hash = ?', [Number(activeId), contentHash]);
    } else {
      await this.dataSource.query('DELETE FROM resource_content_hash_claims WHERE content_hash = ?', [contentHash]);
    }
  }

  private async releaseStructureHashClaim(structureHash: string): Promise<void> {
    const rows = await this.dataSource.query(`SELECT MIN(id) AS id FROM resources
      WHERE structure_hash = ? AND deleted_at IS NULL AND merged_into_resource_id IS NULL
        AND status IN ('pending','pending_review','approved','published')`, [structureHash]);
    const activeId = rows?.[0]?.id;
    if (activeId) {
      await this.dataSource.query('UPDATE resource_structure_hash_claims SET resource_id = ? WHERE structure_hash = ?', [Number(activeId), structureHash]);
    } else {
      await this.dataSource.query('DELETE FROM resource_structure_hash_claims WHERE structure_hash = ?', [structureHash]);
    }
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
      if (status !== RESOURCE_STATUS_REJECTED && existingResource.content_hash) {
        const conflicting = await this.resourceRepository.createQueryBuilder('resource')
          .leftJoinAndSelect('resource.category', 'category')
          .where('resource.content_hash = :contentHash', { contentHash: existingResource.content_hash })
          .andWhere('resource.id <> :id', { id })
          .andWhere('resource.status IN (:...statuses)', { statuses: RESOURCE_DUPLICATE_STATUSES })
          .andWhere('resource.deleted_at IS NULL')
          .andWhere('resource.merged_into_resource_id IS NULL')
          .orderBy('resource.id', 'ASC').getOne();
        if (conflicting) throw this.duplicateConflict({ id: conflicting.id, public_id: conflicting.public_id, title: conflicting.title, status: conflicting.status, is_public: Number(conflicting.is_public), category_visible: !conflicting.category_id || Number(conflicting.category?.is_active) === 1, url: `/resources/${conflicting.id}` });
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.update(Resource, id, updateData);
        if (status !== RESOURCE_STATUS_REJECTED && existingResource.content_hash) {
          await this.claimContentHash(manager, existingResource.content_hash, id);
        }
        if (status !== RESOURCE_STATUS_REJECTED && existingResource.structure_hash) {
          await this.claimStructureHash(manager, existingResource.structure_hash, id, existingResource.duplicate_note || '');
        }
      });
      if (status === RESOURCE_STATUS_REJECTED && existingResource.content_hash) await this.releaseContentHashClaim(existingResource.content_hash);
      if (status === RESOURCE_STATUS_REJECTED && existingResource.structure_hash) await this.releaseStructureHashClaim(existingResource.structure_hash);
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
