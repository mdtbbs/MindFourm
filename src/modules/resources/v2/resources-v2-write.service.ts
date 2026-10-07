import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceFileProviderService } from '../resource-file-provider.service';
import { User } from '@entities/user.entity';
import { ResourceReviewEvent } from '@entities/resource-center-v2.entity';
import { DirectVersionCompletionContext, ResourceVersionService } from '../resource-versions.service';
import { ResourcePreviewService } from '../resource-preview.service';
import { ResourceStorageService } from '../resource-storage.service';
import { ResourceFileMeta, ResourcesService } from '../resources.service';
import { parseMarkdown } from '@common/utils/markdown.util';
import { isSafeExternalUrl } from '@common/utils/safe-url.util';
import { analyzeMapMetadata } from '../analyzers/map-analyzer';
import { analyzeSchematicMetadata } from '../analyzers/schematic-analyzer';
import type { ResourceV2MapObjectOperationInput, ResourceV2SchematicConfigDtoUnion } from './resources-v2-write.dto';

type ManagedRole = 'owner' | 'maintainer' | 'publisher';

@Injectable()
export class ResourcesV2WriteService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly versions: ResourceVersionService,
    private readonly previews: ResourcePreviewService,
    @Optional() private readonly storage?: ResourceStorageService,
    @Optional() private readonly fileProvider?: ResourceFileProviderService,
    @Optional() private readonly resourceLifecycle?: ResourcesService,
  ) {}

  private assertUuid(value: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException('Resource public ID must be a UUID');
    }
  }

  private async getResource(publicId: string): Promise<Resource> {
    this.assertUuid(publicId);
    const resource = await this.resources.findOne({ where: { public_id: publicId } });
    if (!resource) throw new NotFoundException('资源不存在');
    return resource;
  }

  private async lockResource(manager: EntityManager, publicId: string): Promise<Resource> {
    this.assertUuid(publicId);
    const rows = await manager.query(
      'SELECT * FROM resources WHERE public_id=? AND deleted_at IS NULL LIMIT 1 FOR UPDATE',
      [publicId],
    ) as Resource[];
    if (!rows[0]) throw new NotFoundException('资源不存在');
    return rows[0];
  }

  private async assertRole(
    resource: Resource,
    actorId: number,
    roles: ManagedRole[],
    executor: Pick<DataSource, 'query'> | Pick<EntityManager, 'query'> = this.dataSource,
  ): Promise<ManagedRole> {
    if (Number(resource.user_id) === Number(actorId)) return 'owner';
    const lock = executor === this.dataSource ? '' : ' FOR UPDATE';
    const rows = await executor.query(
      `SELECT u.role AS account_role, rm.role AS member_role
       FROM users u
       LEFT JOIN resource_members rm ON rm.resource_id = ? AND rm.user_id = u.id AND rm.status = 'active'
       WHERE u.id = ? LIMIT 1${lock}`,
      [resource.id, actorId],
    ) as Array<{ account_role: string; member_role: ManagedRole | null }>;
    if (rows[0]?.account_role === 'admin') return 'owner';
    const role = rows[0]?.member_role;
    if (!role || !roles.includes(role)) throw new ForbiddenException('没有权限管理此资源');
    return role;
  }

  async analyzeVersion(publicId: string, file: ResourceFileMeta, input: {
    mod_author_overrides?: Record<string, unknown>;
  }, actorId: number): Promise<Record<string, unknown>> {
    const resource = await this.getResource(publicId);
    await this.assertRole(resource, actorId, ['owner', 'maintainer', 'publisher']);
    if (resource.resource_kind === 'mod') {
      const parsed = await this.versions.analyzeMod(file, input.mod_author_overrides);
      return { resource_public_id: publicId, resource_kind: 'mod', analysis: parsed };
    }
    if (resource.resource_kind !== 'map' && resource.resource_kind !== 'schematic') {
      throw new BadRequestException('此资源类型不支持版本静态解析');
    }
    const extension = resource.resource_kind === 'map' ? '.msav' : '.msch';
    if (!file.file_name.toLowerCase().endsWith(extension)) throw new BadRequestException(`仅支持 ${extension} 文件`);
    const draft = await this.previews.createDraft(actorId, resource.resource_kind, file as any);
    const consumed = await this.previews.consumeDraft(actorId, draft.id, resource.resource_kind);
    await this.previews.discardConsumedDraft(consumed);
    const structured = resource.resource_kind === 'schematic'
      ? analyzeSchematicMetadata(consumed.metadata)
      : analyzeMapMetadata(consumed.metadata);
    return {
      resource_public_id: publicId,
      resource_kind: resource.resource_kind,
      analysis: {
        parser_version: structured.parser_version || consumed.parserVersion,
        renderer_metadata: consumed.metadata,
        metadata: structured.metadata,
        findings: structured.analysis.warnings_json.map(item => ({ ...item, severity: item.severity.toUpperCase() })),
      },
    };
  }

  /** Export a transformed copy of an owner's published schematic without touching its stored release. */
  async exportSchematic(publicId: string, versionPublicId: string, input: {
    rotation_quarters: number; mirror_x: boolean; delete_positions?: Array<{ x: number; y: number }>;
    move_positions?: Array<{ from_x: number; from_y: number; to_x: number; to_y: number }>;
    add_blocks?: Array<{ x: number; y: number; block: string; rotation?: number }>;
    logic_configs?: Array<{ x: number; y: number; source: string }>;
    config_edits?: Array<{ x: number; y: number; config: ResourceV2SchematicConfigDtoUnion }>;
  }, actorId: number): Promise<{ data: Buffer; file_name: string; sha256: string }> {
    const resource = await this.getResource(publicId);
    await this.assertRole(resource, actorId, ['owner', 'maintainer']);
    if (resource.resource_kind !== 'schematic') throw new BadRequestException('只有蓝图资源支持在线编辑');
    this.assertUuid(versionPublicId);
    if (!Number.isInteger(input.rotation_quarters) || input.rotation_quarters < 0 || input.rotation_quarters > 3
      || typeof input.mirror_x !== 'boolean' || (input.delete_positions?.length || 0) > 10_000
      || (input.move_positions?.length || 0) > 5_000 || (input.add_blocks?.length || 0) > 5_000
      || (input.logic_configs?.length || 0) > 1_000 || (input.config_edits?.length || 0) > 5_000
      || (input.delete_positions?.length || 0) + (input.move_positions?.length || 0) + (input.add_blocks?.length || 0) + (input.logic_configs?.length || 0) + (input.config_edits?.length || 0) > 10_000) {
      throw new BadRequestException('蓝图编辑操作无效');
    }
    const rows = await this.dataSource.query(
      `SELECT id,public_id,status,file_path,file_name,content_hash FROM resource_versions
       WHERE resource_id = ? AND public_id = ? LIMIT 1`,
      [resource.id, versionPublicId],
    ) as Array<{ id: number; public_id: string; status: string; file_path: string | null; file_name: string | null; content_hash: string | null }>;
    const version = rows[0];
    if (!version || version.status !== 'published') throw new NotFoundException('已发布蓝图版本不存在');
    const primary = await this.dataSource.getRepository(ResourceFile).findOne({
      where: { resource_version_id: version.id, role: 'primary', availability_status: 'available' },
    });
    const filename = primary?.original_filename || version.file_name;
    if (!filename?.toLowerCase().endsWith('.msch')) throw new BadRequestException('蓝图版本文件不可用');
    let source: Buffer;
    if (primary && this.fileProvider) {
      source = await this.fileProvider.getReadableContent(primary, 20 * 1024 * 1024);
    } else {
      if (primary?.storage_backend === 'res' || !version.file_path || !this.storage) {
        throw new BadRequestException('蓝图版本文件不可用');
      }
      source = await this.storage.readManagedFile(version.file_path, 20 * 1024 * 1024);
    }
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const expectedHash = primary?.content_hash || version.content_hash;
    if (expectedHash && sourceHash !== expectedHash.toLowerCase()) {
      throw new BadRequestException('蓝图源文件校验失败，未生成编辑结果');
    }
    const transformed = await this.previews.transformSchematic(filename, source, {
      rotation_quarters: input.rotation_quarters,
      mirror_x: input.mirror_x,
      delete_positions: input.delete_positions || [],
      move_positions: input.move_positions || [],
      add_blocks: input.add_blocks || [],
      logic_configs: input.logic_configs || [],
      config_edits: input.config_edits || [],
    });
    const stem = filename.split(/[\\/]/).pop()!.replace(/\.msch$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'schematic';
    return { data: transformed.data, file_name: `${stem}-edited.msch`, sha256: transformed.sha256 };
  }

  /** Export a transformed map copy; the caller may save it as a new direct-upload version. */
  async exportMap(publicId: string, versionPublicId: string, input: {
    terrain_changes?: Array<{ x: number; y: number; floor: string; overlay: string }>;
    rule_changes?: Record<string, unknown>;
    wave_operations?: Array<{ action: 'add' | 'update' | 'delete' | 'move'; index: number; to_index?: number; fields?: Record<string, unknown> }>;
    object_operations?: ResourceV2MapObjectOperationInput[];
  }, actorId: number): Promise<{ data: Buffer; file_name: string; sha256: string }> {
    const resource = await this.getResource(publicId);
    await this.assertRole(resource, actorId, ['owner', 'maintainer']);
    if (resource.resource_kind !== 'map') throw new BadRequestException('只有地图资源支持在线编辑');
    this.assertUuid(versionPublicId);
    const terrain = input.terrain_changes || [];
    const waveOperations = input.wave_operations || [];
    if (terrain.length > 5_000 || waveOperations.length > 1_000
      || !input.rule_changes || typeof input.rule_changes !== 'object' || Array.isArray(input.rule_changes)
      || Object.keys(input.rule_changes).length > 100) throw new BadRequestException('地图编辑操作无效');
    const rows = await this.dataSource.query(
      `SELECT id,public_id,status,file_path,file_name,content_hash FROM resource_versions
       WHERE resource_id = ? AND public_id = ? LIMIT 1`,
      [resource.id, versionPublicId],
    ) as Array<{ id: number; public_id: string; status: string; file_path: string | null; file_name: string | null; content_hash: string | null }>;
    const version = rows[0];
    if (!version || version.status !== 'published') throw new NotFoundException('已发布地图版本不存在');
    const primary = await this.dataSource.getRepository(ResourceFile).findOne({
      where: { resource_version_id: version.id, role: 'primary', availability_status: 'available' },
    });
    const filename = primary?.original_filename || version.file_name;
    if (!filename?.toLowerCase().endsWith('.msav')) throw new BadRequestException('地图版本文件不可用');
    let source: Buffer;
    if (primary && this.fileProvider) {
      source = await this.fileProvider.getReadableContent(primary, 20 * 1024 * 1024);
    } else {
      if (primary?.storage_backend === 'res' || !version.file_path || !this.storage) throw new BadRequestException('地图版本文件不可用');
      source = await this.storage.readManagedFile(version.file_path, 20 * 1024 * 1024);
    }
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const expectedHash = primary?.content_hash || version.content_hash;
    if (expectedHash && sourceHash !== expectedHash.toLowerCase()) throw new BadRequestException('地图源文件校验失败，未生成编辑结果');
    const transformed = await this.previews.transformMap(filename, source, {
      terrain_changes: terrain,
      rule_changes: input.rule_changes,
      wave_operations: waveOperations,
      object_operations: input.object_operations,
    });
    const stem = filename.split(/[\\/]/).pop()!.replace(/\.msav$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'map';
    return { data: transformed.data, file_name: `${stem}-edited.msav`, sha256: transformed.sha256 };
  }

  async createVersion(publicId: string, file: ResourceFileMeta, input: {
    version: string; version_mode?: 'semver' | 'compatibility'; release_channel?: 'release' | 'beta' | 'alpha' | 'snapshot';
    game_version_min?: string; game_version_max?: string; content?: string; mod_id?: string;
    mod_author_overrides?: Record<string, unknown>;
  }, actorId: number) {
    const resource = await this.getResource(publicId);
    await this.assertRole(resource, actorId, ['owner', 'maintainer', 'publisher']);
    let rendererDraft: { metadata: Record<string, unknown> | null; parserVersion: string | null; previewKey: string | null } | undefined;
    if (resource.resource_kind === 'map' || resource.resource_kind === 'schematic') {
      const extension = resource.resource_kind === 'map' ? '.msav' : '.msch';
      if (!file.file_name.toLowerCase().endsWith(extension)) throw new BadRequestException(`仅支持 ${extension} 文件`);
      const draft = await this.previews.createDraft(actorId, resource.resource_kind, file as any);
      const consumed = await this.previews.consumeDraft(actorId, draft.id, resource.resource_kind);
      rendererDraft = { metadata: consumed.metadata, parserVersion: consumed.parserVersion, previewKey: consumed.previewKey };
    }
    let version: any;
    try {
      version = await this.versions.create({ resource_id: resource.id, ...input }, file, actorId, rendererDraft);
    } catch (error) {
      if (rendererDraft?.previewKey) await this.previews.removePreviewKey(rendererDraft.previewKey);
      throw error;
    }
    const analyzer = resource.resource_kind === 'mod' ? 'mod-static-analysis'
      : resource.resource_kind === 'schematic' ? 'schematic-static-analysis'
        : resource.resource_kind === 'map' ? 'map-static-analysis' : null;
    const findings = analyzer
      ? await this.dataSource.query(
        `SELECT ar.findings_json FROM resource_analysis_runs ar JOIN resource_versions rv ON rv.id = ar.resource_version_id
         WHERE rv.public_id = ? AND ar.analyzer = ? ORDER BY ar.created_at DESC LIMIT 1`,
        [version.public_id, analyzer],
      )
      : [];
    return {
      version: {
        public_id: version.public_id,
        version: version.version,
        version_mode: version.version_mode,
        revision: version.revision,
        release_channel: version.release_channel,
        recommended: Boolean(version.recommended),
        status: version.status,
        published_at: version.published_at || null,
      },
      revision: version.revision,
      findings: findings[0]?.findings_json || [],
    };
  }

  /** Finalize a metadata-first draft using the same server analyzers and persistence as multipart releases. */
  async completeDirectVersion(publicId: string, file: ResourceFileMeta, input: {
    version: string; version_mode?: 'semver' | 'compatibility'; release_channel?: 'release' | 'beta' | 'alpha' | 'snapshot';
    game_version_min?: string; game_version_max?: string; content?: string; mod_id?: string;
    mod_author_overrides?: Record<string, unknown>;
  }, actorId: number, context: DirectVersionCompletionContext) {
    const resource = await this.getResource(publicId);
    await this.assertRole(resource, actorId, ['owner', 'maintainer', 'publisher']);
    let rendererDraft: { metadata: Record<string, unknown> | null; parserVersion: string | null; previewKey: string | null } | undefined;
    if (resource.resource_kind === 'map' || resource.resource_kind === 'schematic') {
      const extension = resource.resource_kind === 'map' ? '.msav' : '.msch';
      if (!file.file_name.toLowerCase().endsWith(extension)) throw new BadRequestException(`仅支持 ${extension} 文件`);
      const preview = await this.previews.createDraft(actorId, resource.resource_kind, file as any);
      const consumed = await this.previews.consumeDraft(actorId, preview.id, resource.resource_kind);
      rendererDraft = { metadata: consumed.metadata, parserVersion: consumed.parserVersion, previewKey: consumed.previewKey };
    }
    try {
      const version = await this.versions.create({ resource_id: resource.id, ...input }, file, actorId, rendererDraft, context);
      const analyzer = resource.resource_kind === 'mod' ? 'mod-static-analysis'
        : resource.resource_kind === 'schematic' ? 'schematic-static-analysis'
          : resource.resource_kind === 'map' ? 'map-static-analysis' : null;
      const findings = analyzer
        ? await this.dataSource.query(
          `SELECT ar.findings_json FROM resource_analysis_runs ar JOIN resource_versions rv ON rv.id = ar.resource_version_id
           WHERE rv.public_id = ? AND ar.analyzer = ? ORDER BY ar.created_at DESC LIMIT 1`,
          [version.public_id, analyzer],
        )
        : [];
      return {
        version: {
          public_id: version.public_id,
          version: version.version,
          version_mode: version.version_mode,
          revision: version.revision,
          release_channel: version.release_channel,
          recommended: Boolean(version.recommended),
          status: version.status,
          published_at: version.published_at || null,
        },
        revision: version.revision,
        findings: findings[0]?.findings_json || [],
      };
    } catch (error) {
      if (rendererDraft?.previewKey) await this.previews.removePreviewKey(rendererDraft.previewKey);
      throw error;
    }
  }

  async updateProfile(publicId: string, input: {
    title?: string; description?: string | null; content?: string | null; source_url?: string | null; license?: string | null;
  }, actorId: number): Promise<Record<string, unknown>> {
    if (!Object.keys(input).length) throw new BadRequestException('至少需要提供一个要更新的字段');
    if (input.title !== undefined && !input.title.trim()) throw new BadRequestException('标题不能为空');
    if (input.title !== undefined && input.title.length > 255) throw new BadRequestException('标题不能超过 255 个字符');
    if (input.source_url && !isSafeExternalUrl(input.source_url)) throw new BadRequestException('来源链接必须是公开的 HTTP 或 HTTPS 地址');
    if (input.license && input.license.length > 191) throw new BadRequestException('许可证字段过长');
    if (input.content && input.content.length > 100_000) throw new BadRequestException('介绍内容过长');

    const update: Partial<Resource> = {};
    if (input.title !== undefined) update.title = input.title.trim();
    if (input.description !== undefined) {
      update.description = input.description?.trim() || '';
      update.summary = input.description?.trim() || null;
    }
    if (input.content !== undefined) {
      const content = input.content?.trim() || '';
      update.content = content || null;
      update.content_html = content ? parseMarkdown(content) : null;
    }
    if (input.source_url !== undefined) update.source_url = input.source_url?.trim() || null;
    if (input.license !== undefined) update.license = input.license?.trim() || null;

    let previousResource: Resource | null = null;
    let resourceId: number;
    try {
    resourceId = await this.dataSource.transaction(async (manager) => {
      const resource = await this.lockResource(manager, publicId);
      await this.assertRole(resource, actorId, ['owner', 'maintainer'], manager);
      const changedCritical = (input.source_url !== undefined && input.source_url !== (resource.source_url || null))
        || (input.license !== undefined && input.license !== (resource.license || null));
      if (changedCritical && ['approved', 'published'].includes(resource.status || '')) update.status = 'pending';
      if (update.status === 'pending') {
        previousResource = resource;
        if (this.resourceLifecycle) await this.resourceLifecycle.setResourceStorageVisibility(resource, 'private', manager);
      }
      await manager.update(Resource, resource.id, update);
      if (changedCritical) await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
        resource_id: resource.id,
        resource_version_id: null,
        actor_user_id: actorId,
        event_type: 'critical_profile_changed',
        result: 'pending_review',
        reason: '来源或许可证声明已变更，需要重新审核。',
      }));
      await manager.query(
        `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
         VALUES (?, 'resource.profile.update', 'resource', ?, ?, NOW())`,
        [actorId, resource.id, JSON.stringify({ fields: Object.keys(update), requires_review: changedCritical })],
      );
      return resource.id;
    });
    } catch (error) {
      if (previousResource && this.resourceLifecycle) {
        await this.resourceLifecycle.setResourceStorageVisibility(previousResource, 'public').catch(() => undefined);
      }
      throw error;
    }
    const updated = await this.resources.findOne({ where: { id: resourceId } });
    if (!updated) throw new NotFoundException('资源不存在');
    return {
      public_id: updated.public_id,
      title: updated.title,
      description: updated.description,
      content: updated.content,
      source_url: updated.source_url,
      license: updated.license,
      status: updated.status,
      updated_at: updated.updated_at,
    };
  }

  async createRelation(publicId: string, input: {
    target_resource_public_id: string; relation_type: string; relation_context?: 'opening' | 'production' | 'defense' | 'logistics' | 'general'; source_version_public_id?: string; target_version_public_id?: string;
  }, actorId: number): Promise<Record<string, unknown>> {
    const source = await this.getResource(publicId);
    const target = await this.getResource(input.target_resource_public_id);
    if (source.id === target.id) throw new BadRequestException('资源不能关联自己');
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(input.relation_type)) throw new BadRequestException('关联类型无效');
    if (!['recommended_for', 'fork_of', 'successor_of', 'related', 'requires', 'compatible_with'].includes(input.relation_type)) {
      throw new BadRequestException('关联类型无效');
    }
    const relationContext = input.relation_context || 'general';
    if (!['opening', 'production', 'defense', 'logistics', 'general'].includes(relationContext)) throw new BadRequestException('关联场景无效');
    if (input.relation_type !== 'recommended_for' && relationContext !== 'general') throw new BadRequestException('只有 recommended_for 关系支持场景标签');
    if (!target.is_public || !['approved', 'published'].includes(target.status || '')) throw new NotFoundException('目标资源不存在');
    if (input.relation_type === 'fork_of' || input.relation_type === 'successor_of') {
      if (!input.target_version_public_id) throw new BadRequestException('Fork 和继任关系必须指定目标版本');
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const lockedSource = await this.lockResource(manager, publicId);
      await this.assertRole(lockedSource, actorId, ['owner', 'maintainer'], manager);
      if ((input.relation_type === 'fork_of' || input.relation_type === 'successor_of')
        && lockedSource.resource_kind !== target.resource_kind) {
        throw new BadRequestException('Fork 和继任关系必须连接相同类型的资源');
      }
      const sourceVersion = input.source_version_public_id
        ? await this.resolveVersionPublicId(lockedSource.id, input.source_version_public_id, manager) : null;
      const targetVersion = input.target_version_public_id
        ? await this.resolveVersionPublicId(target.id, input.target_version_public_id, manager) : null;
      const inserted = await manager.query(
        `INSERT IGNORE INTO resource_relations (source_resource_id,target_resource_id,source_version_id,target_version_id,relation_type,relation_context,created_by_user_id)
         VALUES (?,?,?,?,?,?,?)`,
        [lockedSource.id, target.id, sourceVersion?.id || null, targetVersion?.id || null, input.relation_type, relationContext, actorId],
      );
      await manager.query(
        `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
         VALUES (?, 'resource.relation.create', 'resource', ?, ?, NOW())`,
        [actorId, lockedSource.id, JSON.stringify({ target_public_id: target.public_id, relation_type: input.relation_type, relation_context: relationContext })],
      );
      return Array.isArray(inserted) ? Number(inserted[0]?.affectedRows || 0) > 0 : Number((inserted as any)?.affectedRows || 0) > 0;
    });
    return { source_resource_public_id: publicId, target_resource_public_id: target.public_id, relation_type: input.relation_type, relation_context: relationContext, created };
  }

  async inviteMember(publicId: string, username: string, role: ManagedRole, actorId: number) {
    const target = await this.users.findOne({ where: { username: username.trim() } });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.id === actorId) throw new BadRequestException('不能邀请自己');
    return this.dataSource.transaction(async (manager) => {
      const resource = await this.lockResource(manager, publicId);
      const actorRole = await this.assertRole(resource, actorId, ['owner', 'maintainer'], manager);
      if (role === 'owner' || (actorRole === 'maintainer' && role !== 'publisher')) {
        throw new ForbiddenException('只有 Owner 可以邀请或授予该角色');
      }
      await manager.query(
        `INSERT INTO resource_members (resource_id,user_id,role,status,invited_by_user_id,accepted_at)
         VALUES (?,?,?,'invited',?,NULL)
         ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'invited', invited_by_user_id = VALUES(invited_by_user_id), accepted_at = NULL`,
        [resource.id, target.id, role, actorId],
      );
      await manager.query(
        `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
         VALUES (?, 'resource.member.invite', 'resource', ?, ?, NOW())`,
        [actorId, resource.id, JSON.stringify({ invitee_user_id: target.id, role })],
      );
      return { resource_public_id: publicId, username: target.username, role, status: 'invited' };
    });
  }

  async respondToInvitation(publicId: string, accept: boolean, actorId: number) {
    if (typeof accept !== 'boolean') throw new BadRequestException('accept 必须是 JSON boolean');
    const result = await this.dataSource.transaction(async (manager) => {
      const resources = await manager.query(
        `SELECT id,public_id,user_id FROM resources WHERE public_id=? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [publicId],
      ) as Array<{ id: number; public_id: string; user_id: number }>;
      const resource = resources[0];
      if (!resource) throw new NotFoundException('资源不存在');
      const rows = await manager.query(
        `SELECT role,status,invited_by_user_id FROM resource_members WHERE resource_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
        [resource.id, actorId],
      ) as Array<{ role: ManagedRole; status: string; invited_by_user_id: number | null }>;
      if (!rows.length || rows[0].status !== 'invited') throw new NotFoundException('资源邀请不存在');
      if (rows[0].role === 'owner') {
        if (!accept) {
          await manager.query(
            `UPDATE resource_members SET status='revoked' WHERE resource_id=? AND user_id=? AND role='owner' AND status='invited'`,
            [resource.id, actorId],
          );
          await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
            resource_id: resource.id, resource_version_id: null, actor_user_id: actorId,
            event_type: 'ownership_transfer_rejected', result: 'revoked', reason: '接收方拒绝所有权转让。',
          }));
          await manager.query(
            `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
             VALUES (?, 'resource.owner.transfer.reject', 'resource', ?, ?, NOW())`,
            [actorId, resource.id, JSON.stringify({ from_user_id: rows[0].invited_by_user_id, target_user_id: actorId })],
          );
          return { resource_public_id: publicId, accepted: false, role: 'owner' };
        }
        if (Number(rows[0].invited_by_user_id) !== Number(resource.user_id)) {
          await manager.query(
            `UPDATE resource_members SET status='revoked' WHERE resource_id=? AND user_id=? AND role='owner' AND status='invited'`,
            [resource.id, actorId],
          );
          await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
            resource_id: resource.id, resource_version_id: null, actor_user_id: actorId,
            event_type: 'ownership_transfer_stale', result: 'revoked', reason: '发起转让时的 Owner 已变化，旧邀请已失效。',
          }));
          await manager.query(
            `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
             VALUES (?, 'resource.owner.transfer.stale', 'resource', ?, ?, NOW())`,
            [actorId, resource.id, JSON.stringify({ invited_by_user_id: rows[0].invited_by_user_id, current_owner_user_id: resource.user_id })],
          );
          return { resource_public_id: publicId, accepted: false, role: 'owner', stale: true };
        }
        await manager.query(
          `INSERT INTO resource_members (resource_id,user_id,role,status,invited_by_user_id,accepted_at)
           VALUES (?,?,'maintainer','active',NULL,NOW())
           ON DUPLICATE KEY UPDATE role='maintainer',status='active',accepted_at=COALESCE(accepted_at,NOW())`,
          [resource.id, resource.user_id],
        );
        await manager.query(
          `UPDATE resource_members SET role='owner',status='active',accepted_at=NOW()
           WHERE resource_id=? AND user_id=? AND role='owner' AND status='invited'`,
          [resource.id, actorId],
        );
        await manager.query(
          `UPDATE resource_members SET status='revoked'
           WHERE resource_id=? AND role='owner' AND status='invited' AND user_id<>?`,
          [resource.id, actorId],
        );
        await manager.update(Resource, resource.id, { user_id: actorId });
        await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
          resource_id: resource.id, resource_version_id: null, actor_user_id: actorId,
          event_type: 'ownership_transfer_completed', result: 'accepted', reason: '接收方确认所有权转让。',
        }));
      } else {
        await manager.query(
          `UPDATE resource_members SET status = ?, accepted_at = ? WHERE resource_id = ? AND user_id = ?`,
          [accept ? 'active' : 'revoked', accept ? new Date() : null, resource.id, actorId],
        );
      }
      await manager.query(
        `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
         VALUES (?, 'resource.member.invitation.respond', 'resource', ?, ?, NOW())`,
        [actorId, resource.id, JSON.stringify({ accepted: accept, role: rows[0].role })],
      );
      return { resource_public_id: publicId, accepted: accept, role: rows[0].role };
    });
    if (result.stale) throw new ConflictException('所有权转让邀请已失效，请联系当前 Owner 重新发起');
    return result;
  }

  async beginOwnershipTransfer(publicId: string, username: string, actorId: number, isAdmin = false) {
    this.assertUuid(publicId);
    const target = await this.users.findOne({ where: { username: username.trim() } });
    if (!target) throw new NotFoundException('接收方用户不存在');
    if (target.id === actorId) throw new BadRequestException('资源当前所有者不能转让给自己');
    return this.dataSource.transaction(async (manager) => {
      const resources = await manager.query(
        `SELECT id,public_id,user_id FROM resources WHERE public_id=? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [publicId],
      ) as Array<{ id: number; public_id: string; user_id: number }>;
      const resource = resources[0];
      if (!resource) throw new NotFoundException('资源不存在');
      if (!isAdmin && Number(resource.user_id) !== actorId) throw new ForbiddenException('只有当前 Owner 可以发起所有权转让');
      if (Number(target.id) === Number(resource.user_id)) throw new BadRequestException('资源当前所有者不能转让给自己');
      await manager.query(
        `UPDATE resource_members SET status='revoked'
         WHERE resource_id=? AND role='owner' AND status='invited'`,
        [resource.id],
      );
      await manager.query(
        `INSERT INTO resource_members (resource_id,user_id,role,status,invited_by_user_id,accepted_at)
         VALUES (?,?,'owner','invited',?,NULL)
         ON DUPLICATE KEY UPDATE role = 'owner', status = 'invited', invited_by_user_id = VALUES(invited_by_user_id), accepted_at = NULL`,
        [resource.id, target.id, resource.user_id],
      );
      await manager.save(ResourceReviewEvent, manager.create(ResourceReviewEvent, {
        resource_id: resource.id, resource_version_id: null, actor_user_id: actorId,
        event_type: 'ownership_transfer_started', result: 'awaiting_acceptance', reason: `所有权转让邀请已发送给 ${target.username}。`,
      }));
      await manager.query(
        `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
         VALUES (?, 'resource.owner.transfer.start', 'resource', ?, ?, NOW())`,
        [actorId, resource.id, JSON.stringify({ target_user_id: target.id })],
      );
      return { resource_public_id: publicId, username: target.username, status: 'awaiting_acceptance' };
    });
  }

  private async resolveVersionPublicId(
    resourceId: number,
    publicId: string,
    executor: Pick<DataSource, 'query'> | Pick<EntityManager, 'query'> = this.dataSource,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(publicId)) throw new BadRequestException('Version public ID must be a UUID');
    const lock = executor === this.dataSource ? '' : ' FOR UPDATE';
    const rows = await executor.query(
      `SELECT id,public_id,status FROM resource_versions WHERE resource_id = ? AND public_id = ? LIMIT 1${lock}`,
      [resourceId, publicId],
    );
    if (!rows?.[0] || rows[0].status !== 'published') throw new NotFoundException('版本不存在');
    return rows[0];
  }
}
