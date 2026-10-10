import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Like, LessThan, In } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceDirectUploadDraft } from '@entities/resource-direct-upload-draft.entity';
import { ResourceDirectUploadSession } from '@entities/resource-direct-upload-session.entity';
import { ResourceVersionCompatibility } from '@entities/resource-version-compatibility.entity';
import {
  ResourceAnalysisRun, ResourceCompatibility, ResourceDependency, ResourceMember,
  ResourceReviewEvent,
} from '@entities/resource-center-v2.entity';
import {
  ModContent, ModIdAlias, ModLocalization, ModProfile, ModVersionMetadata,
} from '@entities/mod-resource-v2.entity';
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
import { ResourceStorageClientService } from './resource-storage-client.service';
import { ContentSafetyService, ContentRisk } from '@modules/content-safety/content-safety.service';
import { ResourceSubscriptionsService } from './resource-subscriptions.service';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { ConsumedResourcePreviewDraft, ResourcePreviewService } from './resource-preview.service';
import { ResourceDuplicateService, RESOURCE_DUPLICATE_STATUSES } from './resource-duplicate.service';
import { SiteConfigService } from '@config/site-profile';
import { CustomEmojisService } from '../custom-emojis/custom-emojis.service';
import { toPublicResource, RESOURCE_CARD_COLUMNS } from './resource-public.dto';
import {
  analyzeModArchive, applyModAuthorOverrides, MOD_ARCHIVE_LIMITS, ModArchiveAnalysis,
  ModManifest, ModUploadValidationError, validateModManifest,
} from './analyzers/mod-package-parser';
import { validateResourceVersion } from './analyzers/version-constraint.util';
import { persistRendererAnalysis } from './v2/resource-version-analysis.persistence';
import { RESOURCE_DIRECT_UPLOAD_DRAFT_TTL_MS } from './resource-direct-upload.constants';

export interface ResourceFileMeta {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
  storage_backend?: string;
  provider_object_id?: string;
  provider_binding_id?: string;
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

type PreparedModArchive = {
  analysis: ModArchiveAnalysis | null;
  effectiveManifest: ModManifest | null;
  modId: string;
  parsedModId: string | null;
  idConflict: boolean;
  findings: Array<{ code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }>;
};

const RESOURCE_STATUS_PENDING = RESOURCE_STATUS.pending;
const RESOURCE_STATUS_APPROVED = RESOURCE_STATUS.approved;
const RESOURCE_STATUS_REJECTED = RESOURCE_STATUS.rejected;

@Injectable()
export class ResourcesService {
  async resolveMflDownloadUrl(fileId: number, fallback?: string | null): Promise<string> {
    try {
      return await this.mflClientService.resolveDownloadUrl(fileId);
    } catch {
      // Historical rows may have only the old ID-based URL. Preserve that
      // link when download-site metadata is temporarily unavailable.
      return fallback || this.mflClientService.getDownloadUrl(fileId);
    }
  }

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
    @Optional() private customEmojis?: CustomEmojisService,
    @Optional() private resClient?: ResourceStorageClientService,
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

  private async saveEntityBatches(manager: EntityManager, target: unknown, values: unknown[], batchSize = 500): Promise<void> {
    for (let offset = 0; offset < values.length; offset += batchSize) {
      await manager.save(target as any, values.slice(offset, offset + batchSize) as any);
    }
  }

  private normalizeVersion(version: ResourceVersion) {
    return {
      ...Object.fromEntries(['id', 'public_id', 'resource_id', 'version', 'file_name', 'file_size', 'mime_type', 'content_hash', 'content', 'content_html', 'created_at', 'release_channel', 'status', 'release_notes_markdown', 'published_at', 'is_legacy_root_release', 'compatibility'].filter((key) => Object.prototype.hasOwnProperty.call(version, key)).map((key) => [key, (version as any)[key]])),
      ...(!['approved', 'published'].includes(version.status || '') ? { reject_reason: version.reject_reason || null } : {}),
      file_size: version.file_size || 0,
      checksum: (version as any).content_hash || null,
      release_notes: (version as any).release_notes_markdown || version.content || null,
    };
  }

  private async readResUpload(file: ResourceFileMeta, maxBytes: number): Promise<Buffer> {
    if (!this.resClient || !file.provider_object_id) throw new BadRequestException('资源存储对象缺失');
    return this.resClient.getObjectContent(file.provider_object_id, { maxBytes });
  }

  private async prepareInitialModArchive(
    kind: string,
    resourceType: string,
    dto: CreateResourceDto,
    file?: ResourceFileMeta,
    directUploadDraft = false,
  ): Promise<PreparedModArchive | null> {
    const versionMode = dto.version_mode || (kind === 'mod' ? 'semver' : 'compatibility');
    try {
      validateResourceVersion(dto.version, versionMode);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '版本号格式无效');
    }
    if (kind !== 'mod') return null;

    if (directUploadDraft && !file) return null;

    let analysis: ModArchiveAnalysis | null = null;
    if (resourceType === 'upload') {
      if (!file || (file.storage_backend !== 'res' && !this.resourceStorageService)) throw new BadRequestException('Mod 上传文件不可用');
      if (file.file_size > MOD_ARCHIVE_LIMITS.maxArchiveBytes) throw new BadRequestException('Mod JAR/ZIP 文件超过 50 MiB 安全限制');
      if (!/\.(?:jar|zip)$/i.test(file.file_name)) throw new BadRequestException('Mod 仅支持 .jar 或 .zip 文件');
      try {
        analysis = analyzeModArchive(file.storage_backend === 'res'
          ? await this.readResUpload(file, MOD_ARCHIVE_LIMITS.maxArchiveBytes)
          : await this.resourceStorageService!.readManagedFile(file.file_path, MOD_ARCHIVE_LIMITS.maxArchiveBytes));
      } catch (error) {
        if (error instanceof ModUploadValidationError) throw new BadRequestException({ code: error.code, message: error.message });
        throw error;
      }
    }

    const effectiveManifest = analysis
      ? applyModAuthorOverrides(analysis.manifest, dto.mod_author_overrides)
      : null;
    const parsedModId = effectiveManifest?.name?.trim().toLowerCase() || null;
    const requestedId = dto.mod_id?.trim().toLowerCase();
    const modId = requestedId || parsedModId || '';
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(modId)) {
      throw new BadRequestException('必须提供有效的 Mod ID，或在 mod.json/mod.hjson 中声明 name');
    }

    const findings = [
      ...(analysis?.findings || []),
      ...(effectiveManifest ? validateModManifest(effectiveManifest) : []),
    ];
    const aliases = parsedModId && parsedModId !== modId ? [parsedModId] : [];
    const identifiers = [...new Set([modId, ...aliases])];
    if (identifiers.length) {
      const rows = await this.dataSource.query(
        `SELECT resource_id FROM mod_profiles WHERE mod_id IN (${identifiers.map(() => '?').join(',')})
         UNION SELECT resource_id FROM mod_id_aliases WHERE alias IN (${identifiers.map(() => '?').join(',')}) LIMIT 1`,
        [...identifiers, ...identifiers],
      ) as Array<{ resource_id: number }>;
      if (rows.length) findings.push({
        code: 'mod_id_conflict', severity: 'ERROR',
        message: 'This Mod ID or one of its aliases already belongs to another resource and requires moderator review.',
      });
      return { analysis, effectiveManifest, modId, parsedModId, idConflict: rows.length > 0, findings };
    }
    return { analysis, effectiveManifest, modId, parsedModId, idConflict: false, findings };
  }

  private normalizeResource(resource: Resource, versions?: ResourceVersion[], card = false) {
    return { ...toPublicResource(resource, card), versions: versions?.map((version) => this.normalizeVersion(version)) };
  }

  /** One grouped query for a resource batch; never count comments per row. */
  private async normalizeResources(resources: Resource[], card = false): Promise<any[]> {
    if (resources.length === 0) return [];
    const ids = resources.map(({ id }) => id);
    const rows = await this.dataSource.query(
      `SELECT resource.id AS resource_id, COUNT(reply.id) AS comment_count
       FROM resources resource
       LEFT JOIN replies reply
         ON reply.post_id = resource.discussion_thread_id AND reply.status = 'published'
       WHERE resource.id IN (${ids.map(() => '?').join(',')})
       GROUP BY resource.id`,
      ids,
    ) as Array<{ resource_id: number | string; comment_count: number | string }>;
    const counts = new Map(rows.map((row) => [Number(row.resource_id), Number(row.comment_count)]));
    return resources.map((resource) => this.normalizeResource({ ...resource,
      comment_count: counts.get(resource.id) || 0,
    } as Resource, undefined, card));
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
    visibility?: string | null;
    category_id?: number | null;
  }): Promise<boolean> {
    const isApproved = (PUBLIC_RESOURCE_STATUSES as readonly string[]).includes(
      resource.status ?? '',
    );
    if (!isApproved || resource.is_public !== 1 || resource.visibility === 'private') {
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
      .where('resource.deleted_at IS NULL')
      .andWhere('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere("(resource.visibility IS NULL OR resource.visibility = 'public')")
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

  async createDirectUploadDraft(dto: CreateResourceDto, userId: number, idempotencyHeader: string | undefined, ipAddress?: string) {
    if (this.normalizeResourceType(dto.resource_type) !== 'upload') throw new BadRequestException('直接上传草稿必须是本站托管资源');
    if (dto.preview_draft_id || dto.schematic_code) throw new BadRequestException('直接上传草稿不能附带本地预览或蓝图代码');
    const idempotencyKey = this.validateIdempotencyKey(idempotencyHeader);
    if (!idempotencyKey) throw new BadRequestException('直接上传草稿必须提供 Idempotency-Key');
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const requestFingerprint = this.hashCanonical({ operation: 'initial-resource-direct-upload', dto });
    const expiresAt = new Date(Date.now() + RESOURCE_DIRECT_UPLOAD_DRAFT_TTL_MS);
    const resource = await this.create(dto, userId, undefined, {
      ipAddress,
      idempotencyKey,
      idempotencyPayload: dto,
      directUploadDraft: { idempotencyKeyHash, requestFingerprint, expiresAt, requestMetadata: dto as unknown as Record<string, unknown> },
    });
    const version = await this.versionRepository.findOne({ where: { resource_id: resource.id }, order: { id: 'DESC' } });
    if (!version?.public_id) throw new ConflictException('资源上传草稿版本不存在');
    const rows = await this.dataSource.query(
      `SELECT draft.id, draft.expires_at, draft.status AS draft_status, version.status AS version_status, version.revision
       FROM resource_direct_upload_drafts draft JOIN resource_versions version ON version.id=draft.resource_version_id
       WHERE draft.resource_version_id=? AND draft.user_id=? LIMIT 1`,
      [version.id, userId],
    ) as Array<{ id: string; expires_at: Date | string; draft_status: 'open' | 'completed'; version_status: 'upload_pending' | 'pending_review'; revision: number }>;
    const draft = rows[0];
    if (!draft) throw new ConflictException('资源上传草稿已失效');
    if (draft.draft_status !== 'open' || draft.version_status !== 'upload_pending' || new Date(draft.expires_at).getTime() <= Date.now()) {
      throw new ConflictException({ code: 'UPLOAD_DRAFT_EXPIRED', message: '资源上传草稿已完成或过期，请重新创建。' });
    }
    return {
      resource_public_id: resource.public_id,
      resource_id: resource.id,
      version_public_id: version.public_id,
      upload_draft_id: draft.id,
      expires_at: new Date(draft.expires_at).toISOString(),
      draft_status: draft.draft_status,
      version_status: draft.version_status,
      revision: Number(draft.revision),
    };
  }

  /** Complete an initial metadata-only draft after re-reading the verified RES bytes. */
  async completeInitialDirectUpload(
    input: { versionId: number; draftId: string; sessionId: string; objectPublicId: string; actor: { id: number; role?: string }; file: ResourceFileMeta },
  ): Promise<{ file_public_id: string; version_public_id: string }> {
    const version = await this.versionRepository.findOne({ where: { id: input.versionId } });
    if (!version?.public_id) throw new NotFoundException('资源版本不存在');
    const resource = await this.resourceRepository.findOne({ where: { id: version.resource_id } });
    if (!resource || resource.deleted_at || resource.status !== 'draft') throw new ConflictException('初始资源草稿状态已变化');
    if (resource.user_id !== input.actor.id && input.actor.role !== 'admin') throw new ForbiddenException('没有权限完成此资源上传');
    const draft = await this.dataSource.getRepository(ResourceDirectUploadDraft).findOne({ where: { id: input.draftId, user_id: input.actor.id, resource_version_id: version.id } });
    const dto = draft?.request_metadata as unknown as CreateResourceDto | null;
    if (!draft || draft.status !== 'open' || draft.expires_at.getTime() <= Date.now() || !dto) {
      throw new ConflictException('资源上传草稿不存在、已完成或已过期');
    }
    if (version.status !== 'upload_pending' || dto.version?.trim() !== version.version) throw new ConflictException('初始资源版本草稿元数据不匹配');
    const createdResBindings: Array<{ objectId: string; bindingId: string }> = [];
    let rendererDraft: ConsumedResourcePreviewDraft | undefined;
    let previewStored = false;
    try {
      const preparedMod = await this.prepareInitialModArchive(resource.resource_kind || 'other', resource.resource_type, dto, input.file, false);
      const contentSource = resolveOptionalContentSource(dto.content, dto.content_json, dto.content_schema_version);
      if (contentSource) dto.content = contentSource.content;
      if (resource.resource_kind === 'map' || resource.resource_kind === 'schematic') {
        if (!this.resourcePreviewService) throw new BadRequestException('地图或蓝图解析服务不可用');
        const preview = await this.resourcePreviewService.createDraft(input.actor.id, resource.resource_kind, input.file as any);
        rendererDraft = await this.resourcePreviewService.consumeDraft(input.actor.id, preview.id, resource.resource_kind);
        if (preview.duplicate?.exact) throw this.duplicateConflict(preview.duplicate.existing_resources[0]);
        if (preview.duplicate?.structure && !dto.duplicate_note?.trim()) {
          throw new ConflictException({ code: 'RESOURCE_STRUCTURE_DUPLICATE', message: '发现一个结构相同的蓝图。请说明用途或内容上的区别后继续提交。', existing_resources: preview.duplicate.existing_resources });
        }
      }
      const rendererMetadata = rendererDraft?.metadata || null;
      const structureHash = typeof rendererMetadata?.structure_hash === 'string' ? rendererMetadata.structure_hash : null;
      const normalizedStructureHash = typeof rendererMetadata?.normalized_structure_hash === 'string' ? rendererMetadata.normalized_structure_hash : null;
      const duplicate = this.resourceDuplicateService ? await this.resourceDuplicateService.inspect({
        contentHash: input.file.content_hash, structureHash, normalizedStructureHash,
        resourceKind: resource.resource_kind, sourceUrl: resource.source_url, title: resource.title,
      }) : null;
      if (duplicate?.exact) throw this.duplicateConflict(duplicate.existing_resources[0]);
      if (duplicate?.structure && !dto.duplicate_note?.trim()) throw new ConflictException({
        code: 'RESOURCE_STRUCTURE_DUPLICATE', message: '发现一个结构相同的蓝图。请说明用途或内容上的区别后继续提交。', existing_resources: duplicate.existing_resources,
      });

      const result = await this.dataSource.transaction(async (manager) => {
        const lockedResource = await manager.findOne(Resource, { where: { id: resource.id }, lock: { mode: 'pessimistic_write' } });
        const lockedVersion = await manager.findOne(ResourceVersion, { where: { id: version.id, resource_id: resource.id }, lock: { mode: 'pessimistic_write' } });
        const lockedDraft = await manager.findOne(ResourceDirectUploadDraft, { where: { id: input.draftId, user_id: input.actor.id, resource_version_id: version.id, status: 'open' }, lock: { mode: 'pessimistic_write' } });
        const lockedSession = await manager.findOne(ResourceDirectUploadSession, { where: { id: input.sessionId, user_id: input.actor.id, resource_version_id: version.id }, lock: { mode: 'pessimistic_write' } });
        if (!lockedResource || lockedResource.status !== 'draft' || lockedResource.deleted_at
          || !lockedVersion || lockedVersion.status !== 'upload_pending' || !lockedDraft || !lockedSession) {
          throw new ConflictException('初始资源上传草稿状态已变化');
        }
        if (lockedResource.user_id !== input.actor.id && input.actor.role !== 'admin') throw new ForbiddenException('没有权限完成此资源上传');
        if (lockedDraft.expires_at.getTime() <= Date.now() || lockedSession.expires_at.getTime() <= Date.now()
          || lockedSession.resource_file_public_id || lockedSession.role !== 'primary'
          || lockedSession.filename !== input.file.file_name || Number(lockedSession.size_bytes) !== input.file.file_size
          || lockedSession.sha256 !== input.file.content_hash.toLowerCase()
          || (lockedSession.object_public_id && lockedSession.object_public_id !== input.objectPublicId)) {
          throw new ConflictException('上传会话或草稿已过期或与资源文件不匹配');
        }
        if (await manager.exists(ResourceFile, { where: { resource_version_id: version.id, role: 'primary' } })) {
          throw new ConflictException('此版本已有主文件');
        }
        await this.claimContentHash(manager, input.file.content_hash, resource.id);
        if (structureHash) await this.claimStructureHash(manager, structureHash, resource.id, dto.duplicate_note?.trim() || '');
        Object.assign(lockedResource, {
          file_path: null,
          file_name: input.file.file_name,
          file_size: input.file.file_size,
          mime_type: input.file.mime_type,
          content_hash: input.file.content_hash,
          structure_hash: structureHash,
          normalized_structure_hash: normalizedStructureHash,
          status: RESOURCE_STATUS_PENDING,
          renderer_status: rendererDraft ? 'ready' : lockedResource.renderer_status,
          renderer_error_code: rendererDraft ? null : lockedResource.renderer_error_code,
          renderer_preview_key: rendererDraft?.previewKey || null,
          renderer_parser_version: rendererDraft?.parserVersion || null,
          renderer_metadata_json: rendererMetadata as any,
        });
        await manager.update(Resource, resource.id, {
          file_path: null as unknown as string,
          file_name: input.file.file_name,
          file_size: input.file.file_size,
          mime_type: input.file.mime_type,
          content_hash: input.file.content_hash,
          structure_hash: structureHash,
          normalized_structure_hash: normalizedStructureHash,
          status: RESOURCE_STATUS_PENDING,
          renderer_status: rendererDraft ? 'ready' : lockedResource.renderer_status,
          renderer_error_code: rendererDraft ? null : lockedResource.renderer_error_code,
          renderer_preview_key: rendererDraft?.previewKey || null,
          renderer_parser_version: rendererDraft?.parserVersion || null,
          renderer_metadata_json: rendererMetadata as any,
        });
        await this.createInitialV2Aggregate(
          manager, lockedResource, dto, input.actor.id, input.file, contentSource, preparedMod || undefined,
          createdResBindings, undefined, lockedVersion, true,
        );
        const primary = await manager.findOne(ResourceFile, { where: { resource_version_id: version.id, role: 'primary' } });
        if (!primary) throw new ConflictException('资源文件记录未创建');
        await manager.update(ResourceDirectUploadDraft, lockedDraft.id, { status: 'completed', completed_at: new Date() });
        await manager.update(ResourceDirectUploadSession, lockedSession.id, { resource_file_public_id: primary.public_id, object_public_id: input.objectPublicId });
        return { filePublicId: primary.public_id, resource: lockedResource };
      });

      if (rendererDraft?.previewKey && this.resourcePreviewService) {
        try {
          await this.resourcePreviewService.storePreviewInRes(result.resource, rendererDraft.previewKey);
          previewStored = true;
        } catch {
          await this.resourceRepository.update(resource.id, { renderer_status: 'failed', renderer_error_code: 'RES_PREVIEW_UNAVAILABLE', renderer_preview_key: null });
        }
      }
      return { file_public_id: result.filePublicId, version_public_id: version.public_id };
    } catch (error) {
      for (const binding of createdResBindings) await this.resClient?.deleteBinding(binding.objectId, binding.bindingId).catch(() => undefined);
      throw error;
    } finally {
      if (rendererDraft?.previewKey && this.resourcePreviewService && !previewStored) {
        await this.resourcePreviewService.discardConsumedDraft(rendererDraft);
      }
    }
  }

  async create(
    dto: CreateResourceDto,
    userId: number,
    file?: ResourceFileMeta,
    provenance: {
      ipAddress?: string;
      rendererDraft?: ConsumedResourcePreviewDraft;
      uploadSessionId?: string;
      idempotencyKey?: string;
      idempotencyPayload?: unknown;
      directUploadDraft?: { idempotencyKeyHash: string; requestFingerprint: string; expiresAt: Date; requestMetadata?: Record<string, unknown> };
      origin?: { site: string; resourceId: string; url: string };
    } = {},
  ): Promise<any> {
    const categoryId = this.toOptionalNumber((dto as any).category_id);
    const resourceType = this.normalizeResourceType(dto.resource_type);
    const resourceKind = dto.resource_kind || 'other';
    const idempotencyKey = this.validateIdempotencyKey(provenance.idempotencyKey);
    const payloadFingerprint = this.hashCanonical(provenance.idempotencyPayload ?? dto);
    const requestFingerprint = this.hashCanonical({ payloadFingerprint, content_hash: file?.content_hash || null });

    if (provenance.origin) {
      const existingOrigin = await this.resourceRepository.findOne({
        where: { origin_site: provenance.origin.site, origin_resource_id: provenance.origin.resourceId },
      });
      if (existingOrigin) {
        throw new ConflictException({
          code: 'RESOURCE_ORIGIN_ALREADY_IMPORTED',
          message: 'This source resource has already been imported.',
          existing_resource_id: existingOrigin.id,
        });
      }
    }

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

    if (resourceType === 'upload' && !file && !provenance.directUploadDraft) {
      throw new BadRequestException('文件类资源必须上传文件');
    }

    if (resourceType === 'external' && !dto.external_url) {
      throw new BadRequestException('外链类资源必须填写外链地址');
    }
    if (!provenance.directUploadDraft) this.assertKindFileContract(resourceKind, resourceType, file?.file_name);
    if (resourceKind === 'mod' && resourceType === 'external' && file) {
      throw new BadRequestException('外链 Mod 不能同时上传文件');
    }
    if ((resourceKind === 'map' || resourceKind === 'schematic') && dto.external_url) {
      throw new BadRequestException('地图和蓝图只能使用本站托管文件，不能设置外链地址');
    }
    const preparedMod = await this.prepareInitialModArchive(resourceKind, resourceType, dto, file, Boolean(provenance.directUploadDraft));

    const canonicalJson = dto.content_json && this.customEmojis
      ? await this.customEmojis.canonicalizeDocument(dto.content_json, dto.content_schema_version || 1, true)
      : dto.content_json;
    const contentSource = resolveOptionalContentSource(dto.content, canonicalJson, dto.content_schema_version);
    dto.content = contentSource?.content || undefined;
    const risk = this.contentSafety
      ? await this.contentSafety.assess(this.resourceSafetyText({
        title: dto.title,
        description: dto.description,
        content: contentSource?.content,
        externalUrl: dto.external_url,
        fileName: file?.file_name,
      }), { actorId: userId, surface: 'resource' })
      : this.emptyContentRisk();
    // Resource moderation and binary-version review are separate workflows. Even
    // when metadata can publish immediately, each new binary stays in review.
    const requiresModeration = Boolean(provenance.directUploadDraft) || file?.storage_backend === 'res' || risk.mustReview
      || ['mod', 'schematic', 'map'].includes(resourceKind)
      || Boolean(preparedMod?.idConflict)
      || (this.siteConfig?.isEnabled('resourcePreModeration') ?? true);

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
      file_path: file?.storage_backend === 'res' ? null : file?.file_path,
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
      origin_site: provenance.origin?.site || null,
      origin_resource_id: provenance.origin?.resourceId || null,
      origin_url: provenance.origin?.url || null,
      content: contentSource?.content || null,
      content_language: dto.content_language?.trim() || 'unknown',
      content_html: contentSource?.content_html || null,
      content_json: contentSource?.content_json || null,
      content_text: contentSource?.content_text || null,
      content_schema_version: contentSource?.content_schema_version || 2,
      category_id: categoryId,
      is_public: this.toTinyInt((dto as any).is_public, 1),
      status: provenance.directUploadDraft ? 'draft' : requiresModeration ? RESOURCE_STATUS_PENDING : RESOURCE_STATUS_APPROVED,
      // A submission that skips moderation is published on the spot; a pending
      // one is stamped later by updateStatus so the date matches the real one.
      published_at: !provenance.directUploadDraft && !requiresModeration ? new Date() : null,
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

    const createdResBindings: Array<{ objectId: string; bindingId: string }> = [];
    let replayed = false;
    let saved: Resource;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
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
      await this.createInitialV2Aggregate(manager, resource, dto, userId, file, contentSource, preparedMod || undefined, createdResBindings, provenance.directUploadDraft);
      if (idempotencyKey) {
        await manager.query('UPDATE resource_submission_idempotency SET resource_id = ? WHERE user_id = ? AND idempotency_key = ?', [resource.id, userId, idempotencyKey]);
      }
        return resource;
      });
    } catch (error: any) {
      for (const binding of createdResBindings) {
        await this.resClient?.deleteBinding(binding.objectId, binding.bindingId).catch(() => undefined);
      }
      const duplicateEntry = error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
      if (provenance.origin && duplicateEntry && String(error?.message || '').includes('uq_resources_origin_identity')) {
        throw new ConflictException({
          code: 'RESOURCE_ORIGIN_ALREADY_IMPORTED',
          message: 'This source resource has already been imported.',
        });
      }
      throw error;
    }

    if (!replayed && provenance.rendererDraft?.previewKey && this.resourcePreviewService) {
      try { await this.resourcePreviewService.storePreviewInRes(saved, provenance.rendererDraft.previewKey); }
      catch {
        // The resource transaction has committed. Keep the successful submission
        // retryable via preview regeneration instead of reporting a failed create.
        await this.resourceRepository.update(saved.id, { renderer_status: 'failed', renderer_error_code: 'RES_PREVIEW_UNAVAILABLE', renderer_preview_key: null });
      }
    }

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
    preparedMod?: PreparedModArchive,
    createdResBindings: Array<{ objectId: string; bindingId: string }> = [],
    directUploadDraft?: { idempotencyKeyHash: string; requestFingerprint: string; expiresAt: Date; requestMetadata?: Record<string, unknown> },
    existingRelease?: ResourceVersion,
    finalizingDirectDraft = false,
  ): Promise<void> {
      const versionMode = dto.version_mode || (resource.resource_kind === 'mod' ? 'semver' : 'compatibility');
      const manifest = preparedMod?.effectiveManifest || null;
      const gameVersionMin = dto.game_version_min?.trim() || manifest?.minGameVersion || null;
      const gameVersionMax = dto.game_version_max?.trim() || null;
      if (preparedMod && !preparedMod.idConflict) {
        const rows = await manager.query(
          `SELECT resource_id FROM mod_profiles WHERE mod_id = ?
           UNION SELECT resource_id FROM mod_id_aliases WHERE alias = ? LIMIT 1`,
          [preparedMod.modId, preparedMod.modId],
        ) as Array<{ resource_id: number }>;
        if (rows.length) {
          preparedMod.idConflict = true;
          preparedMod.findings.push({
            code: 'mod_id_conflict', severity: 'ERROR',
            message: 'This Mod ID already belongs to another resource and requires moderator review.',
          });
          resource.status = RESOURCE_STATUS_PENDING;
          await manager.update(Resource, resource.id, { status: RESOURCE_STATUS_PENDING });
        }
      }
      const releaseValues = {
        resource_id: resource.id,
        public_id: existingRelease?.public_id || randomUUID(),
        // This is strictly the resource's own release version. Mindustry build
        // compatibility is represented below in ResourceVersionCompatibility.
        version: dto.version.trim(),
        version_mode: versionMode,
        revision: existingRelease?.revision || 1,
        recommended: 0,
        game_version_min: gameVersionMin,
        game_version_max: gameVersionMax,
        release_channel: dto.release_channel || 'release',
        // A Resource approval does not review its binary. Initial and later
        // uploads enter the same version-scoped review queue.
        status: directUploadDraft ? 'upload_pending' : 'pending_review',
        published_at: null,
        release_notes_markdown: contentSource?.content.trim() || null,
        release_notes_html: contentSource?.content_html || null,
        created_by_user_id: submitterUserId,
        file_path: file?.storage_backend === 'res' ? null : file?.file_path || null,
        file_name: file?.file_name || null,
        file_size: file?.file_size || null,
        mime_type: file?.mime_type || null,
        content_hash: file?.content_hash || null,
      } as Partial<ResourceVersion>;
      const release = existingRelease
        ? Object.assign(existingRelease, releaseValues, { id: existingRelease.id })
        : manager.create(ResourceVersion, releaseValues);
      if (existingRelease) await manager.update(ResourceVersion, existingRelease.id, releaseValues);
      else await manager.save(ResourceVersion, release);
      const credits = [
        { role: 'submitter', subject_type: 'local_user', user_id: submitterUserId, display_name: null },
        ...this.normalizeCredits([...(dto.original_authors || []), ...(manifest?.author ? [manifest.author] : [])]).map((display_name) => ({ role: 'original_author', subject_type: 'external_person', user_id: null, display_name })),
        ...this.normalizeCredits(dto.maintainers).map((display_name) => ({ role: 'maintainer', subject_type: 'external_person', user_id: null, display_name })),
      ];
      if (!finalizingDirectDraft) await manager.save(ResourceAttribution, credits.map((credit, sort_order) => manager.create(ResourceAttribution, {
        resource_id: resource.id,
        ...credit,
        sort_order,
      })));

      const hosted = resource.resource_type === 'upload';
      const filePublicId = randomUUID();
      let resBindingId = file?.provider_binding_id || null;
      if (hosted && file?.storage_backend === 'res') {
        if (!file.provider_object_id || !this.resClient) throw new BadRequestException('资源存储对象缺失');
        const binding = await this.resClient.createBinding(file.provider_object_id, {
          namespace: 'mindforum', owner_type: 'resource_file', owner_id: filePublicId,
          visibility: 'private',
        });
        resBindingId = binding.id;
        createdResBindings.push({ objectId: file.provider_object_id, bindingId: binding.id });
      }
      if (!(hosted && directUploadDraft)) await manager.save(ResourceFile, manager.create(ResourceFile, {
        public_id: filePublicId,
        resource_version_id: release.id,
        role: 'primary',
        delivery_mode: hosted ? 'managed' : 'external',
        original_filename: hosted ? file?.file_name || null : null,
        mime_type: hosted ? file?.mime_type || null : null,
        size_bytes: hosted ? file?.file_size || null : null,
        hash_algorithm: hosted ? 'sha256' : null,
        content_hash: hosted ? file?.content_hash || null : null,
        integrity_status: hosted ? 'verified' : 'unverified_legacy',
        storage_backend: hosted ? file?.storage_backend || 'local' : null,
        storage_key: hosted ? (file?.storage_backend === 'res' ? `sha256:${file.content_hash}` : file?.file_path || null) : null,
        provider_object_id: hosted && file?.storage_backend === 'res' ? file.provider_object_id : null,
        provider_binding_id: resBindingId,
        external_url: hosted ? null : resource.external_url,
        availability_status: hosted ? (file?.storage_backend === 'res' ? 'pending' : file ? 'available' : 'unavailable') : 'available',
        sort_order: 0,
      }));

      if (directUploadDraft) {
        await manager.save(ResourceDirectUploadDraft, manager.create(ResourceDirectUploadDraft, {
          id: randomUUID(),
          resource_version_id: release.id,
          user_id: submitterUserId,
          idempotency_key_hash: directUploadDraft.idempotencyKeyHash,
          request_fingerprint: directUploadDraft.requestFingerprint,
          request_metadata: directUploadDraft.requestMetadata || null,
          status: 'open',
          expires_at: directUploadDraft.expiresAt,
          completed_at: null,
        }));
      }

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
      const compatibilityToSave = finalizingDirectDraft
        ? compatibility.filter((item) => item.provenance === 'inferred')
        : compatibility;
      if (compatibilityToSave.length) {
        await manager.save(ResourceVersionCompatibility, compatibilityToSave.map((item) => manager.create(ResourceVersionCompatibility, {
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

      if (!finalizingDirectDraft) await manager.save(ResourceMember, manager.create(ResourceMember, {
        resource_id: resource.id,
        user_id: submitterUserId,
        role: 'owner',
        status: 'active',
        invited_by_user_id: null,
        accepted_at: new Date(),
      }));
      if (!directUploadDraft) await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
        resource_id: resource.id,
        resource_version_id: release.id,
        actor_user_id: submitterUserId,
        event_type: 'submitted',
        result: 'pending_review',
        reason: null,
      }));

      const v2Compatibility = [
        ...(gameVersionMin || gameVersionMax ? [{
          source: 'author' as const,
          runtime: 'mindustry',
          platform_key: null,
          game_version: null,
          min_game_version: gameVersionMin,
          max_game_version: gameVersionMax,
          channel: dto.release_channel || 'release',
          status: 'declared',
          confidence: null,
          notes: null,
          created_by_user_id: submitterUserId,
        }] : []),
        ...(dto.compatibility || []).map((item) => ({
          source: 'author' as const,
          runtime: 'mindustry',
          platform_key: null,
          game_version: null,
          min_game_version: item.min_version_value?.trim() || null,
          max_game_version: item.max_version_value?.trim() || null,
          channel: item.channel?.trim() || dto.release_channel || 'release',
          status: 'declared',
          confidence: null,
          notes: item.notes?.trim() || null,
          created_by_user_id: submitterUserId,
        })),
      ];
      if (v2Compatibility.length && !finalizingDirectDraft) {
        await manager.save(ResourceCompatibility, v2Compatibility.map((item) => manager.create(ResourceCompatibility, {
          resource_version_id: release.id,
          ...item,
        })));
      }

      if (!directUploadDraft && (resource.resource_kind === 'schematic' || resource.resource_kind === 'map')) {
        await persistRendererAnalysis(manager, {
          resourceId: resource.id,
          versionId: release.id,
          actorId: submitterUserId,
          kind: resource.resource_kind,
          rendererMetadata: renderer,
          publisherMetadata: resource.metadata_json,
          previewKey: resource.renderer_preview_key,
        });
      }

      if (preparedMod) {
        if (!preparedMod.idConflict) {
          await manager.save(ModProfile, manager.create(ModProfile, {
            resource_id: resource.id,
            mod_id: preparedMod.modId,
            display_name: manifest?.displayName || dto.title,
            runtime_type: preparedMod.analysis?.runtime_type === 'unknown' ? null : preparedMod.analysis?.runtime_type || null,
            description: manifest?.description || dto.description || null,
            upstream_url: dto.source_url || null,
          }));
          if (preparedMod.parsedModId && preparedMod.parsedModId !== preparedMod.modId) {
            const aliasRows = await manager.query(
              `SELECT resource_id FROM mod_profiles WHERE mod_id = ?
               UNION SELECT resource_id FROM mod_id_aliases WHERE alias = ? LIMIT 1`,
              [preparedMod.parsedModId, preparedMod.parsedModId],
            ) as Array<{ resource_id: number }>;
            if (!aliasRows.length) {
              await manager.save(ModIdAlias, manager.create(ModIdAlias, {
                resource_id: resource.id,
                alias: preparedMod.parsedModId,
                created_by_user_id: submitterUserId,
              }));
            } else {
              preparedMod.idConflict = true;
              preparedMod.findings.push({ code: 'mod_id_alias_conflict', severity: 'ERROR', message: 'The previous Mod ID belongs to another resource and requires moderator review.' });
              resource.status = RESOURCE_STATUS_PENDING;
              await manager.update(Resource, resource.id, { status: RESOURCE_STATUS_PENDING });
              await manager.update(ResourceVersion, release.id, { status: 'pending_review', recommended: 0, published_at: null });
            }
          }
        }
        if (preparedMod.analysis && manifest) {
          const parsed = preparedMod.analysis;
          await manager.save(ModVersionMetadata, manager.create(ModVersionMetadata, {
            resource_version_id: release.id,
            parser_version: parsed.parser_version,
            runtime_type: parsed.runtime_type,
            manifest_name: parsed.manifest.name,
            display_name: manifest.displayName,
            author: manifest.author,
            version: manifest.version || dto.version,
            min_game_version: manifest.minGameVersion,
            description: manifest.description,
            main_class: parsed.java.entrypoint || manifest.main,
            package_name: manifest.package,
            parsed_manifest_json: parsed.manifest.raw,
            author_overrides_json: dto.mod_author_overrides || null,
            archive_files_json: parsed.files,
          }));
          if (parsed.content.length) await this.saveEntityBatches(manager, ModContent, parsed.content.map((item) => manager.create(ModContent, {
            public_id: randomUUID(),
            resource_version_id: release.id,
            content_type: item.content_type,
            internal_name: item.internal_name,
            display_name: item.display_name,
            description: item.description,
            icon_key: item.icon_key,
            properties_json: item.properties,
          })));
          if (parsed.localizations.length) await this.saveEntityBatches(manager, ModLocalization, parsed.localizations.map((item) => manager.create(ModLocalization, {
            resource_version_id: release.id,
            locale: item.locale,
            translated_count: item.translated,
            total_count: item.total,
            percentage: item.percentage,
            missing_keys_json: item.missing_keys,
          })));

          const dependencies = manifest.dependencies || [];
          let targets = new Map<string, number>();
          if (dependencies.length) {
            const ids = [...new Set(dependencies.map((dependency) => dependency.mod_id.toLowerCase()))];
            const targetRows = await manager.query(
              `SELECT LOWER(mod_id) AS mod_id, resource_id FROM mod_profiles WHERE LOWER(mod_id) IN (${ids.map(() => '?').join(',')})
               UNION SELECT LOWER(alias) AS mod_id, resource_id FROM mod_id_aliases WHERE LOWER(alias) IN (${ids.map(() => '?').join(',')})`,
              [...ids, ...ids],
            ) as Array<{ mod_id: string; resource_id: number }>;
            targets = new Map(targetRows.map((row) => [row.mod_id, Number(row.resource_id)]));
            await this.saveEntityBatches(manager, ResourceDependency, dependencies.map((dependency, sort_order) => manager.create(ResourceDependency, {
              resource_version_id: release.id,
              dependency_type: dependency.kind,
              target_resource_id: targets.get(dependency.mod_id.toLowerCase()) || null,
              external_identifier: dependency.mod_id,
              upstream_url: null,
              version_constraint: dependency.version_constraint,
              resolution_status: targets.has(dependency.mod_id.toLowerCase()) ? 'resolved' : 'unresolved',
              notes: null,
              sort_order,
            })));
          }
          await manager.save(ResourceAnalysisRun, manager.create(ResourceAnalysisRun, {
            resource_id: resource.id,
            resource_version_id: release.id,
            analyzer: 'mod-static-analysis',
            parser_version: parsed.parser_version,
            status: 'completed',
            summary_json: {
              status: parsed.status,
              runtime_type: parsed.runtime_type,
              content_count: parsed.content.length,
              localization_count: parsed.localizations.length,
              java: parsed.java,
            },
            findings_json: [...preparedMod.findings],
            started_at: new Date(),
            completed_at: new Date(),
          }));
        } else {
          await manager.save(ResourceAnalysisRun, manager.create(ResourceAnalysisRun, {
            resource_id: resource.id,
            resource_version_id: release.id,
            analyzer: 'mod-static-analysis',
            parser_version: 'mdtbbs-mod-static-1',
            status: 'partial',
            summary_json: { status: 'partial', external_source: resource.resource_type === 'external' },
            findings_json: [...preparedMod.findings],
            started_at: new Date(),
            completed_at: new Date(),
          }));
        }
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
    if (kind === 'mod') {
      if (resourceType === 'upload' && (!fileName || !/\.(?:jar|zip)$/i.test(fileName))) {
        throw new BadRequestException('Mod 仅支持上传 .jar 或 .zip 文件');
      }
      return;
    }
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
        mfl_download_url: this.mflClientService.getDownloadUrl(mflResult.id, mflResult.file_path),
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
        .select(RESOURCE_CARD_COLUMNS)
        .addSelect("LEFT(COALESCE(NULLIF(resource.summary, ''), resource.description), 360)", 'resource_card_description')
        .addSelect('resource.filter_width', 'resource_card_width')
        .addSelect('resource.filter_height', 'resource_card_height')
        .addSelect("LEFT(JSON_UNQUOTE(JSON_EXTRACT(resource.renderer_metadata_json, '$.build')), 32)", 'resource_card_build')
        .addSelect('resource.file_path', 'resource_card_file_path')
        .maxExecutionTime(2500)
        .where('resource.status IN (:...statuses)', { statuses: PUBLIC_RESOURCE_STATUSES })
        .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
        .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 });

      if (options.featuredOnly) qb.andWhere('resource.is_featured = 1');

      // Aggregate each event window once, instead of rescanning it for each card.
      const trendScore = '(COALESCE(download_trend.score, 0) + COALESCE(like_trend.score, 0) + COALESCE(favorite_trend.score, 0))';
      if (options.trendingOnly) {
        qb.leftJoin("(SELECT resource_id, COUNT(*) * 3 AS score FROM download_events WHERE event_type = 'granted' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY resource_id)", 'download_trend', 'download_trend.resource_id = resource.id')
          .leftJoin('(SELECT resource_id, COUNT(*) * 2 AS score FROM resource_likes WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY resource_id)', 'like_trend', 'like_trend.resource_id = resource.id')
          .leftJoin('(SELECT resource_id, COUNT(*) * 2 AS score FROM resource_favorites WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY resource_id)', 'favorite_trend', 'favorite_trend.resource_id = resource.id')
          .addSelect(trendScore, 'trending_score');
      }

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
        qb.andWhere('(resource.file_path IS NULL OR resource.file_path NOT LIKE :quarantineResourcePath)', { quarantineResourcePath: '%/.quarantine/%' });
        qb.andWhere(
          `resource.filter_planet = :resourcePlanet`,
          { resourcePlanet: planet.trim() },
        );
      }
      if (block?.trim()) {
        qb.andWhere('(resource.file_path IS NULL OR resource.file_path NOT LIKE :quarantineResourcePath)', { quarantineResourcePath: '%/.quarantine/%' });
        qb.andWhere(
          `JSON_SEARCH(resource.renderer_metadata_json, 'one', :resourceBlock, NULL, '$.block_types[*].name') IS NOT NULL`,
          { resourceBlock: block.trim() },
        );
      }
      if (width !== undefined) {
        qb.andWhere('(resource.file_path IS NULL OR resource.file_path NOT LIKE :quarantineResourcePath)', { quarantineResourcePath: '%/.quarantine/%' });
        qb.andWhere(
          `resource.filter_width = :resourceWidth`,
          { resourceWidth: width },
        );
      }
      if (height !== undefined) {
        qb.andWhere('(resource.file_path IS NULL OR resource.file_path NOT LIKE :quarantineResourcePath)', { quarantineResourcePath: '%/.quarantine/%' });
        qb.andWhere(
          `resource.filter_height = :resourceHeight`,
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
          `(EXISTS (SELECT 1 FROM resource_versions rv INNER JOIN resource_version_compatibilities rvc ON rvc.resource_version_id = rv.id WHERE rv.resource_id = resource.id AND rv.status = 'published' AND rvc.runtime = 'mindustry' AND (rvc.min_version_value IS NULL OR rvc.min_version_value <= :supportedVersion) AND (rvc.max_version_value IS NULL OR rvc.max_version_value >= :supportedVersion)) OR JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:supportedVersion), '$.supported_versions'))`,
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
            const cursorValue = ['created_at', 'updated_at', 'published_at'].includes(sort) ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
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

      const selected = await qb.getRawAndEntities();
      const cards = new Map(selected.raw.map((row) => [Number(row.resource_id), row]));
      const resources = selected.entities.map((entity) => {
        const row = cards.get(entity.id);
        return Object.assign(entity, {
          description: row?.resource_card_description || null,
          renderer_summary: { width: row?.resource_card_width, height: row?.resource_card_height, build: row?.resource_card_build },
          unreviewed_quarantined_binary: typeof row?.resource_card_file_path === 'string'
            && /[\\/]\.quarantine[\\/]/.test(row.resource_card_file_path),
          ...(options.trendingOnly ? { trending_score: Number(row?.trending_score) || 0 } : {}),
        });
      });

      const hasMore = resources.length > Number(limit);
      if (hasMore) {
        resources.pop();
      }

      let nextCursor: string | null = null;
      if (hasMore && resources.length > 0) {
        const lastResource = resources[resources.length - 1];
        const cursorValue = options.trendingOnly
          ? String((lastResource as Resource & { trending_score: number }).trending_score)
          : ['created_at', 'updated_at', 'published_at'].includes(sort)
            ? ((lastResource[sort] as Date | null)?.getTime().toString() ?? '')
            : String(lastResource[sort] ?? '');
        nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
      }

      return {
        data: await this.normalizeResources(resources, true),
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
          ['created_at', 'updated_at', 'published_at'].includes(sort) ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
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
        ['created_at', 'updated_at', 'published_at'].includes(sort)
          ? ((lastResource[sort] as Date | null)?.getTime().toString() ?? '')
          : String(lastResource[sort] ?? '');
      nextCursor = encodeCursor(cursorValue, lastResource.id.toString());
    }

    return {
      data: await this.normalizeResources(resources),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  /** Admin-only, version-scoped Mod analysis for the moderation review panel. */
  async getAdminModAnalysis(resourceId: number): Promise<{
    version: { public_id: string | null; version: string; status: string } | null;
    status: string;
    analysis_run_status: string | null;
    parser_version: string | null;
    runtime_type: string | null;
    manifest: Record<string, unknown> | null;
    author_overrides: Record<string, unknown> | null;
    summary: Record<string, unknown> | null;
    findings: Array<{ code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }>;
  }> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
      select: ['id', 'resource_kind'],
    });
    if (!resource) throw new NotFoundException('资源不存在');
    if (resource.resource_kind !== 'mod') throw new BadRequestException('该资源不是 Mod');

    const rows = await this.dataSource.query(
      `SELECT rv.public_id AS version_public_id, rv.version AS version_label,
              rv.status AS version_status, mod_metadata.parser_version AS metadata_parser_version,
              mod_metadata.runtime_type, mod_metadata.parsed_manifest_json, mod_metadata.author_overrides_json,
              analysis_run.status AS analysis_run_status, analysis_run.parser_version AS analysis_parser_version,
              analysis_run.summary_json, analysis_run.findings_json
       FROM resource_versions rv
       LEFT JOIN mod_version_metadata mod_metadata ON mod_metadata.resource_version_id = rv.id
       LEFT JOIN resource_analysis_runs analysis_run ON analysis_run.id = (
         SELECT latest.id FROM resource_analysis_runs latest
         WHERE latest.resource_id = rv.resource_id
           AND latest.resource_version_id = rv.id
           AND latest.analyzer = 'mod-static-analysis'
         ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
       )
       WHERE rv.resource_id = ?
       ORDER BY CASE
         WHEN rv.status = 'pending_review' THEN 0
         WHEN rv.status = 'upload_pending' THEN 1
         WHEN rv.status = 'published' THEN 2
         ELSE 3 END,
         rv.created_at DESC, rv.revision DESC, rv.id DESC
       LIMIT 1`,
      [resourceId],
    ) as Array<Record<string, unknown>>;
    const row = rows[0];
    const decodeJson = (value: unknown): unknown => {
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { return null; }
    };
    const asObject = (value: unknown): Record<string, unknown> | null => {
      const decoded = decodeJson(value);
      return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown>
        : null;
    };
    const summary = asObject(row?.summary_json);
    const rawFindings = decodeJson(row?.findings_json);
    const findings = (Array.isArray(rawFindings) ? rawFindings : []).slice(0, 200).flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const finding = item as Record<string, unknown>;
      const severity = String(finding.severity || '').toUpperCase();
      return [{
        code: String(finding.code || finding.key || 'unknown').slice(0, 128),
        severity: (severity === 'ERROR' || severity === 'WARNING' ? severity : 'INFO') as 'ERROR' | 'WARNING' | 'INFO',
        message: String(finding.message || finding.description || finding.code || 'Mod 分析发现').slice(0, 2000),
      }];
    });
    const analysisRunStatus = row?.analysis_run_status == null ? null : String(row.analysis_run_status);
    const declaredParserStatus = typeof summary?.status === 'string' ? summary.status : null;
    const status = declaredParserStatus
      || (analysisRunStatus === 'completed'
        ? 'complete'
        : analysisRunStatus || (row?.metadata_parser_version || row?.analysis_parser_version ? 'complete' : 'not_run'));
    const numericSummaryValue = (key: string): number | null => {
      if (summary?.[key] == null) return null;
      const value = Number(summary?.[key]);
      return Number.isFinite(value) ? value : null;
    };
    const runtimeType = row?.runtime_type == null
      ? (typeof summary?.runtime_type === 'string' ? summary.runtime_type : null)
      : String(row.runtime_type);

    return {
      version: row ? {
        public_id: row.version_public_id == null ? null : String(row.version_public_id),
        version: String(row.version_label || ''),
        status: String(row.version_status || ''),
      } : null,
      status,
      analysis_run_status: analysisRunStatus,
      parser_version: row?.metadata_parser_version == null
        ? (row?.analysis_parser_version == null ? null : String(row.analysis_parser_version))
        : String(row.metadata_parser_version),
      runtime_type: runtimeType,
      manifest: asObject(row?.parsed_manifest_json),
      author_overrides: asObject(row?.author_overrides_json),
      summary: summary ? {
        status,
        runtime_type: runtimeType,
        content_count: numericSummaryValue('content_count'),
        localization_count: numericSummaryValue('localization_count'),
        java: asObject(summary.java),
        external_source: summary.external_source === true,
      } : null,
      findings,
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

  /** Internal file operations need storage keys; never serialize this record as an API response. */
  async getForFileAccess(id: number, viewer?: { id: number; role: string }): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      select: ['id', 'public_id', 'user_id', 'category_id', 'status', 'is_public', 'visibility', 'resource_kind', 'resource_type',
        'file_path', 'file_name', 'file_size', 'mime_type', 'content_hash', 'use_mfl', 'mfl_download_url',
        'external_url', 'renderer_status', 'renderer_preview_key', 'renderer_preview_object_id', 'renderer_preview_binding_id', 'latest_published_version_id'],
    });
    if (!resource) throw new NotFoundException('资源不存在');
    await this.assertResourceVisible(resource, viewer);
    const publishedVersion = resource.latest_published_version_id
      ? await this.versionRepository.findOne({
        where: { id: resource.latest_published_version_id, resource_id: id, status: 'published' },
      })
      : null;
    if (publishedVersion) {
      resource.file_path = publishedVersion.file_path;
      resource.file_name = publishedVersion.file_name;
      resource.file_size = publishedVersion.file_size;
      resource.mime_type = publishedVersion.mime_type;
      resource.content_hash = publishedVersion.content_hash;
    } else {
      const initialBinaryIsQuarantined = Boolean(resource.file_path && /[\\/]\.quarantine[\\/]/.test(resource.file_path));
      if (initialBinaryIsQuarantined) {
        // Resource-level moderation does not publish a binary. Never let the
        // legacy default download path expose an initial version awaiting review.
        (resource as any).file_path = null;
      }
      if (initialBinaryIsQuarantined && !await this.canViewUnpublishedVersions(resource, viewer)) {
        // Initial map/schematic previews are derived from the submitted bytes;
        // root Resource approval must not expose them before version approval.
        resource.renderer_status = 'unavailable';
        resource.renderer_preview_key = null;
      }
    }
    return resource;
  }

  async resolveDetailId(identifier: string): Promise<number> {
    if (/^[1-9]\d*$/.test(identifier) && Number.isSafeInteger(Number(identifier))) return Number(identifier);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) throw new BadRequestException('资源编号无效');
    const resource = await this.resourceRepository.findOne({ where: { public_id: identifier }, select: ['id'] });
    if (!resource) throw new NotFoundException('资源不存在');
    return resource.id;
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

    const canViewUnpublished = await this.canViewUnpublishedVersions(resource, viewer);
    const versions = await this.versionRepository.find({
      where: { resource_id: id },
      order: { created_at: 'DESC' },
    });
    const visibleVersions = canViewUnpublished
      ? versions
      : versions.filter((version) => version.status === 'published');
    const compatibilities = visibleVersions.length ? await this.dataSource.query(
      `SELECT resource_version_id, runtime, min_version_value, max_version_value, channel, notes, provenance, confidence
       FROM resource_version_compatibilities WHERE resource_version_id IN (${visibleVersions.map(() => '?').join(',')})
       ORDER BY id ASC`, visibleVersions.map(({ id: versionId }) => versionId),
    ) : [];
    const byVersion = new Map<number, any[]>();
    for (const item of compatibilities || []) {
      const versionId = Number(item.resource_version_id);
      const rows = byVersion.get(versionId) || [];
      rows.push({ runtime: item.runtime, min_version_value: item.min_version_value, max_version_value: item.max_version_value,
        channel: item.channel, notes: item.notes, provenance: item.provenance, confidence: item.confidence });
      byVersion.set(versionId, rows);
    }
    return this.normalizeOneResource(resource, visibleVersions.map((version) => ({ ...version,
      compatibility: byVersion.get(version.id) || [],
    } as ResourceVersion)));
  }

  private async canViewUnpublishedVersions(resource: Resource, viewer?: { id: number; role: string }): Promise<boolean> {
    if (!viewer) return false;
    if (['admin', 'moderator'].includes(viewer.role) || Number(resource.user_id) === Number(viewer.id)) return true;
    const rows = await this.dataSource.query(
      `SELECT role FROM resource_members WHERE resource_id=? AND user_id=? AND status='active' LIMIT 1`,
      [resource.id, viewer.id],
    ) as Array<{ role: string }>;
    return ['owner', 'maintainer', 'publisher'].includes(String(rows[0]?.role || ''));
  }

  async getTransferExportData(id: number, viewer: { id: number; role: string }): Promise<any> {
    const resource = await this.getByIdWithVersions(id, viewer);
    const credits = await this.dataSource.query(
      `SELECT role, display_name FROM resource_attributions
       WHERE resource_id = ? AND role IN ('original_author', 'maintainer') ORDER BY sort_order ASC, id ASC`,
      [id],
    ) as Array<{ role: string; display_name: string | null }>;
    return {
      ...resource,
      original_authors: credits.filter((item) => item.role === 'original_author').map((item) => item.display_name).filter(Boolean),
      maintainers: credits.filter((item) => item.role === 'maintainer').map((item) => item.display_name).filter(Boolean),
    };
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
      'replies', 'resource_comment_reply_map', 'resource_favorites', 'resource_likes', 'resource_ratings',
      'resource_subscriptions', 'resource_attributions', 'resource_versions', 'resource_files',
      'download_events', 'resource_version_dependencies', 'content_relations',
      'knowledge_articles', 'game_content_upload_sessions', 'resource_media_links', 'resource_content_hash_claims', 'resource_structure_hash_claims',
      'resources',
    ];
    const presentRows = await query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => '?').join(',')})`, tables);
    const present = new Set<string>((presentRows || []).map((row) => String(row.table_name)));
    const counts: Record<string, number> = {};
    const count = async (name: string, sql: string, params: any[] = [resourceId], resultKey = name) => {
      if (!present.has(name)) { counts[resultKey] = 0; return; }
      const rows = await query(sql, params);
      counts[resultKey] = Number(rows?.[0]?.count || 0);
    };
    await Promise.all([
      count('replies', `SELECT COUNT(*) AS count FROM replies reply
        INNER JOIN resources resource ON resource.discussion_thread_id = reply.post_id
        WHERE resource.id = ?`, [resourceId], 'resource_comments'),
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

  private async mergePublicResourceDiscussion(
    manager: EntityManager,
    present: Set<string>,
    source: Resource,
    target: Resource,
    mergePublicDiscussion: boolean,
  ): Promise<number> {
    const sourceThreadId = Number(source.discussion_thread_id || 0);
    if (!mergePublicDiscussion || !sourceThreadId || !present.has('posts') || !present.has('replies')) return 0;

    const sourceRows = await manager.query(
      'SELECT id, post_type, source FROM posts WHERE id = ? AND deleted_at IS NULL',
      [sourceThreadId],
    );
    if (sourceRows[0]?.post_type !== 'resource_discussion' || sourceRows[0]?.source !== 'SYSTEM') return 0;

    const targetThreadId = Number(target.discussion_thread_id || 0);
    let movedReplies = 0;
    if (targetThreadId) {
      const targetRows = await manager.query(
        'SELECT id, post_type, source FROM posts WHERE id = ? AND deleted_at IS NULL',
        [targetThreadId],
      );
      if (targetRows[0]?.post_type !== 'resource_discussion' || targetRows[0]?.source !== 'SYSTEM') {
        throw new ConflictException('目标资源绑定了无效的讨论主题');
      }
      if (targetThreadId !== sourceThreadId) {
        const result = await manager.query('UPDATE replies SET post_id = ? WHERE post_id = ?', [targetThreadId, sourceThreadId]);
        movedReplies = Number(result?.affectedRows ?? result?.raw?.affectedRows ?? result?.[0]?.affectedRows ?? 0);
        await manager.query(`UPDATE posts
          SET last_activity_at = GREATEST(COALESCE(last_activity_at, created_at),
            COALESCE((SELECT MAX(created_at) FROM replies WHERE post_id = ?), last_activity_at, created_at))
          WHERE id = ?`, [targetThreadId, targetThreadId]);
        await manager.query('UPDATE posts SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [sourceThreadId]);
        await manager.query('UPDATE resources SET discussion_thread_id = NULL WHERE id = ?', [source.id]);
      }
    } else {
      const points = Array.from(String(target.title || `#${target.id}`));
      const title = `Resource discussion: ${points.length > 230 ? points.slice(0, 230).join('') : points.join('')}`;
      await manager.query('UPDATE resources SET discussion_thread_id = ? WHERE id = ?', [sourceThreadId, target.id]);
      await manager.query('UPDATE resources SET discussion_thread_id = NULL WHERE id = ?', [source.id]);
      await manager.query(`UPDATE posts
        SET title = ?, status = 'published', deleted_at = NULL, updated_at = NOW()
        WHERE id = ?`, [title, sourceThreadId]);
    }

    if (present.has('resource_comment_reply_map')) {
      await manager.query('UPDATE resource_comment_reply_map SET resource_id = ? WHERE resource_id = ?', [target.id, source.id]);
    }
    return movedReplies;
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
    let previousSource: Resource | null = null;
    let previousTarget: Resource | null = null;
    try {
    return await this.dataSource.transaction(async (manager) => {
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
      const present = new Set<string>((tableRows || []).map((row: any) => String(row.table_name)));
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
      migrated.resource_discussion_replies = await this.mergePublicResourceDiscussion(
        manager, present, source, target, sourcePublic && targetPublic,
      );
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
      previousSource = source as Resource;
      previousTarget = target as Resource;
      await this.setResourceStorageVisibility({ ...source, status: 'merged', is_public: 0, visibility: 'private' } as Resource, 'private', manager);
      await this.setResourceStorageVisibility({ ...target, ...updates } as Resource, targetPublic ? 'public' : 'private', manager);
      await manager.query(`UPDATE resources SET status = 'merged', is_public = 0, visibility = 'private', merged_into_resource_id = ?, updated_at = NOW()
        WHERE id = ?`, [targetId, sourceId]);
      await manager.query(`INSERT INTO resource_merge_logs (source_resource_id, target_resource_id, admin_user_id, migrated_counts)
        VALUES (?, ?, ?, ?)`, [sourceId, targetId, adminUserId, JSON.stringify({ ...migrated, preview_counts: counts, version_collision_mappings: versionCollisionMappings })]);
      return { source_id: sourceId, target_id: targetId, status: 'merged', migrated_counts: migrated, version_collision_mappings: versionCollisionMappings };
    });
    } catch (error) {
      for (const resource of [previousSource, previousTarget] as Array<Resource | null>) {
        if (resource) await this.setResourceStorageVisibility(resource,
          PUBLIC_RESOURCE_STATUSES.includes(resource.status as any) ? 'public' : 'private').catch(() => undefined);
      }
      throw error;
    }
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
    const canonicalJson = dto.content_json && this.customEmojis
      ? await this.customEmojis.canonicalizeDocument(dto.content_json, dto.content_schema_version || 1, true)
      : dto.content_json;
    const contentSource = hasContentUpdate
      ? resolveOptionalContentSource(dto.content, canonicalJson, dto.content_schema_version)
      : undefined;
    if (contentSource) dto.content = contentSource.content;

    let previousStorageResource: Resource | null = null;
    let updateResult: { resource: Resource; risk: ContentRisk; needsModerationNotice: boolean };
    try {
    updateResult = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM resources WHERE id=? AND deleted_at IS NULL FOR UPDATE', [id]);
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
        updateData.content_schema_version = contentSource?.content_schema_version || 2;
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

      if (updateData.status !== undefined || updateData.is_public !== undefined) {
        previousStorageResource = resource;
        const next = { ...resource, ...updateData } as Resource;
        await this.setResourceStorageVisibility(next, PUBLIC_RESOURCE_STATUSES.includes(next.status as any) ? 'public' : 'private', manager);
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

    } catch (error) {
      if (previousStorageResource) {
        const previous = previousStorageResource as Resource;
        await this.setResourceStorageVisibility(previous, PUBLIC_RESOURCE_STATUSES.includes(previous.status as any) ? 'public' : 'private').catch(() => undefined);
      }
      throw error;
    }

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
    const priorVisibility = PUBLIC_RESOURCE_STATUSES.includes(resource.status as any) && Number(resource.is_public) === 1 && resource.visibility !== 'private' ? 'public' : 'private';
    try {
      await this.setResFileVisibility(resource.id, 'private');
      await this.resourcePreviewService?.setResPreviewVisibility(resource, 'private');
      if (resource.use_mfl && resource.mfl_file_id) {
        await this.mflClientService.blockDownloads(resource.mfl_file_id, resource.id, 'the forum resource was deleted');
      }
      await this.resourceRepository.softDelete(resource.id);
    } catch (error) {
      await this.setResFileVisibility(resource.id, priorVisibility).catch(() => undefined);
      await this.resourcePreviewService?.setResPreviewVisibility(resource, priorVisibility).catch(() => undefined);
      throw error;
    }
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

  private async setResFileVisibility(resourceId: number, visibility: 'public' | 'private', manager?: EntityManager): Promise<void> {
    const files = manager ? (await manager.query(
      `SELECT file.* FROM resource_files file INNER JOIN resource_versions version ON version.id=file.resource_version_id
       WHERE version.resource_id=? AND file.storage_backend='res' FOR UPDATE`, [resourceId],
    ) as ResourceFile[]).filter((file) => file.storage_backend === 'res') : await this.resourceFileRepository.createQueryBuilder('file')
      .innerJoin(ResourceVersion, 'version', 'version.id = file.resource_version_id')
      .where('version.resource_id = :resourceId', { resourceId })
      .andWhere('file.storage_backend = :backend', { backend: 'res' })
      .getMany();
    const versions = files.length ? (manager
      ? await manager.find(ResourceVersion, { where: { resource_id: resourceId } })
      : await this.versionRepository.find({ where: { resource_id: resourceId }, order: { created_at: 'DESC', id: 'DESC' } })) : [];
    for (const file of files) {
      if (!file.provider_object_id || !this.resClient) throw new BadRequestException('资源存储对象缺失');
      const version = versions.find((item) => item.id === file.resource_version_id);
      const eligible = version?.status === 'published';
      const fileVisibility = visibility === 'public' && eligible ? 'public' : 'private';
      const binding = await this.resClient.createBinding(file.provider_object_id, {
        namespace: 'mindforum', owner_type: 'resource_file', owner_id: file.public_id, visibility: fileVisibility,
      });
      if (file.provider_binding_id !== binding.id) {
        if (manager) await manager.update(ResourceFile, file.id, { provider_binding_id: binding.id });
        else await this.resourceFileRepository.update(file.id, { provider_binding_id: binding.id });
      }
      const availability = eligible ? 'available' : 'pending';
      if (manager) await manager.update(ResourceFile, file.id, { availability_status: availability });
      else await this.resourceFileRepository.update(file.id, { availability_status: availability });
    }
  }

  async setResourceStorageVisibility(resource: Resource, visibility: 'public' | 'private', manager?: EntityManager): Promise<void> {
    if (Number(resource.is_public) !== 1 || resource.visibility === 'private') visibility = 'private';
    await this.setResFileVisibility(resource.id, visibility, manager);
    await this.resourcePreviewService?.setResPreviewVisibility(resource, visibility, manager);
  }

  async findStoredDownloadFile(resourceId: number, versionId?: number, viewer?: { id: number; role: string }): Promise<{ version: ResourceVersion; file: ResourceFile } | null> {
    const version = versionId
      ? await this.versionRepository.findOne({ where: { id: versionId, resource_id: resourceId } })
      : (await this.versionRepository.find({ where: { resource_id: resourceId, status: 'published' }, order: { published_at: 'DESC', revision: 'DESC', id: 'DESC' }, take: 1 }))[0];
    if (!version) return null;
    if (version.status !== 'published') {
      const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
      let allowed = Boolean(viewer && resource && (Number(resource.user_id) === Number(viewer.id) || ['admin', 'moderator'].includes(viewer.role)));
      if (!allowed && viewer) {
        const rows = await this.dataSource.query(
          "SELECT role FROM resource_members WHERE resource_id=? AND user_id=? AND status='active' LIMIT 1", [resourceId, viewer.id],
        ) as Array<{ role: string }>;
        allowed = ['owner', 'maintainer', 'publisher'].includes(rows[0]?.role || '');
      }
      if (!allowed) throw new NotFoundException('资源版本不存在');
    }
    const file = await this.resourceFileRepository.findOne({ where: { resource_version_id: version.id, role: 'primary' }, order: { sort_order: 'ASC', id: 'ASC' } });
    return file ? { version, file } : null;
  }

  async updateStatus(
    id: number,
    status: string,
    options: { actorUsername?: string | null; actorUserId?: number | null; rejectReason?: string | null } = {},
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
      const updateData: Partial<Resource> = { status };
      if (status === RESOURCE_STATUS_REJECTED) {
        updateData.reject_reason = options.rejectReason || null;
      } else if (status === RESOURCE_STATUS_APPROVED) {
        updateData.reject_reason = null;
        // First approval is the publication moment. Re-approving after a
        // moderation round-trip keeps the original date rather than quietly
        // re-dating an old resource.
        if (!existingResource.published_at && Number(existingResource.is_public) === 1) {
          updateData.published_at = new Date();
        }
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
      const resVisibility = status === RESOURCE_STATUS_APPROVED && Number(existingResource.is_public) === 1 && existingResource.visibility !== 'private' ? 'public' : 'private';
      try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT id FROM resources WHERE id=? AND deleted_at IS NULL FOR UPDATE', [id]);
        await this.setResFileVisibility(id, resVisibility, manager);
        await this.resourcePreviewService?.setResPreviewVisibility({ ...existingResource, ...updateData } as Resource, resVisibility, manager);
        await manager.update(Resource, id, updateData);
        if (status !== RESOURCE_STATUS_REJECTED && existingResource.content_hash) {
          await this.claimContentHash(manager, existingResource.content_hash, id);
        }
        if (status !== RESOURCE_STATUS_REJECTED && existingResource.structure_hash) {
          await this.claimStructureHash(manager, existingResource.structure_hash, id, existingResource.duplicate_note || '');
        }
        await this.syncLatestV2ReleaseStatus(manager, id, status, options.actorUserId || null, options.rejectReason || null);
      });
      } catch (error) {
        const oldVisibility = PUBLIC_RESOURCE_STATUSES.includes(existingResource.status as any) && Number(existingResource.is_public) === 1 && existingResource.visibility !== 'private' ? 'public' : 'private';
        await this.setResFileVisibility(id, oldVisibility).catch(() => undefined);
        await this.resourcePreviewService?.setResPreviewVisibility(existingResource, oldVisibility).catch(() => undefined);
        throw error;
      }
      if (status === RESOURCE_STATUS_REJECTED && existingResource.content_hash) await this.releaseContentHashClaim(existingResource.content_hash);
      if (status === RESOURCE_STATUS_REJECTED && existingResource.structure_hash) await this.releaseStructureHashClaim(existingResource.structure_hash);

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
        const latestPublishedVersion = await this.versionRepository.findOne({
          where: { resource_id: id, status: 'published' },
          order: { published_at: 'DESC', created_at: 'DESC', revision: 'DESC', id: 'DESC' },
        });
        if (latestPublishedVersion?.file_path) {
          const publishedResource = {
            ...resource,
            file_path: latestPublishedVersion.file_path,
            file_name: latestPublishedVersion.file_name,
            file_size: latestPublishedVersion.file_size,
            mime_type: latestPublishedVersion.mime_type,
            content_hash: latestPublishedVersion.content_hash,
          };
          if (publishedResource.renderer_status !== 'ready' && this.resourcePreviewService?.supports(publishedResource)) {
            void this.resourcePreviewService.enqueue(publishedResource).catch((err) =>
              console.error(`Resource preview enqueue error for ${publishedResource.id}:`, err),
            );
          }
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

  /** Resource approval is separate from reviewing any uploaded binary version. */
  private async syncLatestV2ReleaseStatus(manager: EntityManager, resourceId: number, resourceStatus: string, actorUserId: number | null, reason: string | null): Promise<void> {
    const rows = await manager.query(
      `SELECT id,release_channel FROM resource_versions WHERE resource_id = ? AND public_id IS NOT NULL
       ORDER BY created_at DESC, revision DESC, id DESC LIMIT 1 FOR UPDATE`,
      [resourceId],
    ) as Array<{ id: number; release_channel: string }>;
    const release = rows[0];
    if (resourceStatus === RESOURCE_STATUS_APPROVED || resourceStatus === RESOURCE_STATUS_REJECTED) {
      await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
        resource_id: resourceId,
        resource_version_id: release ? Number(release.id) : null,
        actor_user_id: actorUserId,
        event_type: resourceStatus === RESOURCE_STATUS_APPROVED ? 'resource_approved' : 'resource_rejected',
        result: resourceStatus,
        reason: resourceStatus === RESOURCE_STATUS_REJECTED ? reason : null,
      }));
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
