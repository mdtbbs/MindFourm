import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, HttpStatus, GoneException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceLike } from '@entities/resource-like.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { User } from '@entities/user.entity';
import { ResourcesService } from '../resources/resources.service';
import { ResourceLikesService } from '../resources/resource-likes.service';
import { ResourceFavoritesService } from '../resources/resource-favorites.service';
import { ResourcePreviewService } from '../resources/resource-preview.service';
import { ResourceStorageService, StoredResourceFile } from '../resources/resource-storage.service';
import { ResourceFileProviderService } from '../resources/resource-file-provider.service';
import { ResourceStorageClientService } from '../resources/resource-storage-client.service';
import { CreateResourceDto } from '../resources/dto/create-resource.dto';
import { GameContentBlueprintDetailDto, GameContentListItemDto, GameContentMapDetailDto, GameContentUploadStatusDto } from './dto/game-content.dto';
import { DownloadPolicyService } from '../downloads/download-policy.service';
import { DownloadGrantService } from '../downloads/download-grant.service';
import { DownloadEventsService } from '../downloads/download-events.service';
import { assertSafeRedirectUrl } from '@common/utils/safe-url.util';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@database/redis.service';
import { GameContentUploadSessionService } from './game-content-upload-session.service';
import { GameContentUploadSession } from '@entities/game-content-upload-session.entity';

export type GameResourceType = 'blueprint' | 'map';
type Viewer = Pick<User, 'id' | 'role'> | null;

@Injectable()
export class GameContentService {
  private readonly logger = new Logger(GameContentService.name);
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceLike) private readonly likes: Repository<ResourceLike>,
    @InjectRepository(ResourceFavorite) private readonly favorites: Repository<ResourceFavorite>,
    @InjectRepository(ResourceVersion) private readonly versions: Repository<ResourceVersion>,
    @InjectRepository(ResourceFile) private readonly files: Repository<ResourceFile>,
    private readonly domain: ResourcesService,
    private readonly likeService: ResourceLikesService,
    private readonly favoriteService: ResourceFavoritesService,
    private readonly previews: ResourcePreviewService,
    private readonly storage: ResourceStorageService,
    private readonly downloadPolicy: DownloadPolicyService,
    private readonly downloadGrant: DownloadGrantService,
    private readonly downloadEvents: DownloadEventsService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly uploadSessions: GameContentUploadSessionService,
    @Optional() private readonly fileProvider?: ResourceFileProviderService,
    @Optional() private readonly resClient?: ResourceStorageClientService,
  ) {}

  /** Keep the legacy game-content request contract while making RES the durable byte store. */
  private async uploadGameContentToRes(file: StoredResourceFile) {
    if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
    const object = await this.resClient.uploadServerGeneratedObject({
      body: createReadStream(file.file_path), sizeBytes: file.file_size, sha256: file.content_hash,
      mimeType: file.mime_type || 'application/octet-stream', filename: file.file_name, purpose: 'resource_version',
    });
    if (object.state !== 'verified' || object.sha256 !== file.content_hash || object.size_bytes !== file.file_size) {
      throw new ServiceUnavailableException('资源存储服务校验失败，请稍后重试');
    }
    return {
      ...file, storage_backend: 'res' as const, provider_object_id: object.public_id,
      mime_type: object.mime_type, file_size: object.size_bytes, content_hash: object.sha256,
    };
  }

  private kind(type: GameResourceType): string { return type === 'blueprint' ? 'schematic' : 'map'; }
  private publicId(resource: Resource): string { return `${resource.resource_kind === 'map' ? 'map' : 'bp'}_${resource.public_id}`; }
  private internalId(value: string): string {
    const match = value.match(/^(?:bp|map)_([0-9a-f-]{36})$/i);
    if (!match) throw new NotFoundException('资源不存在');
    return match[1];
  }
  private parseObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return {}; } }
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }
  private asList(value: unknown): string[] { return Array.isArray(value) ? value.filter((x) => typeof x === 'string').slice(0, 30) : []; }
  private localizeProduction(production: any, labels: any): any {
    if (!production || typeof production !== 'object' || Array.isArray(production)) return null;
    const localizeFlow = (flow: any, catalog: any) => ({
      inputs: (Array.isArray(flow?.inputs) ? flow.inputs : []).map((entry: any) => ({ ...entry, name: catalog[entry.id]?.name || entry.name || entry.id, icon: catalog[entry.id]?.icon || null })),
      outputs: (Array.isArray(flow?.outputs) ? flow.outputs : []).map((entry: any) => ({ ...entry, name: catalog[entry.id]?.name || entry.name || entry.id, icon: catalog[entry.id]?.icon || null })),
      internal: (Array.isArray(flow?.internal) ? flow.internal : []).map((entry: any) => ({ ...entry, name: catalog[entry.id]?.name || entry.name || entry.id, icon: catalog[entry.id]?.icon || null })),
    });
    return {
      ...production,
      items: localizeFlow(production.items, labels.items || {}),
      liquids: localizeFlow(production.liquids, labels.liquids || {}),
      warnings: (Array.isArray(production.warnings) ? production.warnings : []).map((warning: any) => ({
        ...warning,
        blockName: labels.blocks?.[warning.blockId]?.name || warning.blockName || warning.blockId,
      })),
    };
  }

  async list(type: GameResourceType, query: { q?: string; sort?: string; order?: string; tags?: string; gameVersion?: string; author?: string; cursor?: string; limit?: string; featuredOnly?: boolean }) {
    const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit || '20', 10) || 20));
    const trendingOnly = query.sort === 'trending';
    const sort = 'created_at';
    const result = await this.domain.getList({
      limit, cursor: query.cursor, search: query.q, sort, order: query.order,
      tags: query.tags, author: query.author, supported_version: query.gameVersion,
      resource_kind: this.kind(type),
    } as any, { scope: 'public', featuredOnly: query.featuredOnly, trendingOnly });
    const items = await this.toListDtos(result.data as Resource[], type);
    return { data: items, pagination: { nextCursor: result.next_cursor, hasMore: result.has_more } };
  }

  private async toListDtos(rows: Resource[], type?: GameResourceType): Promise<GameContentListItemDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [likeRows, favoriteRows] = await Promise.all([
      this.likes.createQueryBuilder('l').select('l.resource_id', 'id').addSelect('COUNT(*)', 'count').where('l.resource_id IN (:...ids)', { ids }).groupBy('l.resource_id').getRawMany(),
      this.favorites.createQueryBuilder('f').select('f.resource_id', 'id').addSelect('COUNT(*)', 'count').where('f.resource_id IN (:...ids)', { ids }).groupBy('f.resource_id').getRawMany(),
    ]);
    const likeCounts = new Map(likeRows.map((r) => [Number(r.id), Number(r.count)]));
    const favoriteCounts = new Map(favoriteRows.map((r) => [Number(r.id), Number(r.count)]));
    return Promise.all(rows.map(async (r) => {
      const unreviewedQuarantinedBinary = this.isQuarantinedPath(r.file_path);
      const parsed = unreviewedQuarantinedBinary
        ? {}
        : this.parseObject((r as any).renderer_summary || r.renderer_metadata_json);
      const metadata = this.parseObject((r as any).metadata || r.metadata_json);
      const resourceType = type || (r.resource_kind === 'map' ? 'map' : 'blueprint');
      const resPreviewUrl = unreviewedQuarantinedBinary ? null : await this.previews.getResPreviewUrl?.(r) || null;
      return {
        id: this.publicId(r), resourceId: r.id, type: resourceType, title: r.title, summary: r.summary || r.description || '',
        author: r.user ? { id: r.user.id, username: r.user.username, avatar: r.user.avatar_url || null } : null,
        preview: { thumbnail: resPreviewUrl || (parsed.width || parsed.height ? `/api/v1/game-content/${resourceType === 'map' ? 'maps' : 'blueprints'}/${this.publicId(r)}/preview` : null), width: parsed.width ?? null, height: parsed.height ?? null },
      game: { version: null, minBuild: parsed.build ?? null },
        tags: this.asList(metadata.tags), stats: { downloads: r.download_count || 0, likes: likeCounts.get(r.id) || 0, favorites: favoriteCounts.get(r.id) || 0, views: Number(r.view_count) || 0 },
        featured: Number(r.is_featured) === 1,
        createdAt: r.created_at, updatedAt: r.updated_at,
      };
    }));
  }

  async detail(type: GameResourceType, value: string, viewer: Viewer, clientIp = ''): Promise<GameContentBlueprintDetailDto | GameContentMapDetailDto> {
    const id = this.internalId(value);
    const resource = await this.resources.findOne({ where: { public_id: id }, relations: ['user', 'category'] });
    if (!resource || resource.resource_kind !== this.kind(type)) throw new NotFoundException('资源不存在');
    if (!(await this.domain.isResourcePubliclyAccessible(resource))) throw new NotFoundException('资源不存在');
    await this.domain.getById(resource.id, viewer || undefined);
    const unreviewedQuarantinedBinary = this.isQuarantinedPath(resource.file_path);
    const renderer = unreviewedQuarantinedBinary ? {} : this.parseObject(resource.renderer_metadata_json);
    if (!unreviewedQuarantinedBinary && type === 'blueprint' && (!renderer.production || typeof renderer.production !== 'object')) this.previews.ensureProduction(resource);
    const resPreviewUrl = unreviewedQuarantinedBinary ? null : await this.previews.getResPreviewUrl?.(resource) || null;
    const metadata = this.parseObject(resource.metadata_json);
    const [likeCount, favoriteCount, viewerLike, viewerFavorite] = await Promise.all([
      this.likes.count({ where: { resource_id: resource.id } }), this.favorites.count({ where: { resource_id: resource.id } }),
      viewer ? this.likes.findOne({ where: { resource_id: resource.id, user_id: viewer.id } }) : Promise.resolve(null),
      viewer ? this.favorites.findOne({ where: { resource_id: resource.id, user_id: viewer.id } }) : Promise.resolve(null),
    ]);
    const base: any = {
      id: this.publicId(resource), resourceId: resource.id, type, title: resource.title, description: resource.description || '',
      author: resource.user ? { id: resource.user.id, username: resource.user.username, avatar: resource.user.avatar_url || null } : null,
      preview: { image: resPreviewUrl || (renderer.width || renderer.height ? `/api/v1/game-content/${type === 'map' ? 'maps' : 'blueprints'}/${this.publicId(resource)}/preview` : null), width: renderer.width ?? null, height: renderer.height ?? null },
      game: { version: null, minBuild: renderer.build ?? null }, tags: this.asList(metadata.tags),
      stats: { downloads: resource.download_count || 0, likes: likeCount, favorites: favoriteCount, views: Number(resource.view_count) || 0 },
      featured: Number(resource.is_featured) === 1,
      viewer: viewer ? { liked: !!viewerLike, favorited: !!viewerFavorite, canEdit: viewer.id === resource.user_id } : null,
      createdAt: resource.created_at, updatedAt: resource.updated_at,
    };
    if (type === 'blueprint') {
      const requirements = Array.isArray(renderer.requirements) ? renderer.requirements : [];
      const blocks = Array.isArray(renderer.block_types) ? renderer.block_types : [];
      const production = renderer.production;
      const ids = requirements.map((x) => x?.item || x?.name).filter((x): x is string => typeof x === 'string');
      const blockIds = blocks.map((x) => x?.name).filter((x): x is string => typeof x === 'string');
      const labels = { items: {}, blocks: {}, liquids: {} } as any;
      const getFlowIds = (flow: 'items' | 'liquids') => ['inputs', 'outputs', 'internal'].flatMap((part) =>
        Array.isArray(production?.[flow]?.[part]) ? production[flow][part].map((entry: any) => entry?.id).filter((id: unknown): id is string => typeof id === 'string') : []);
      const productionItemIds = getFlowIds('items');
      const productionLiquidIds = getFlowIds('liquids');
      const warningBlockIds = Array.isArray(production?.warnings) ? production.warnings.map((warning: any) => warning?.blockId).filter((id: unknown): id is string => typeof id === 'string') : [];
      const allItemIds = [...new Set([...ids, ...productionItemIds])];
      const allBlockIds = [...new Set([...blockIds, ...warningBlockIds])];
      if (allItemIds.length || allBlockIds.length || productionLiquidIds.length) {
        try { Object.assign(labels, await this.previews.resolveContentMetadata(allItemIds, allBlockIds, productionLiquidIds)); } catch { /* internal ids remain useful if renderer metadata is offline */ }
      }
      base.materials = requirements.map((x) => { const itemId = x.item || x.name; return { id: itemId, name: labels.items[itemId]?.name || itemId, amount: x.amount, icon: labels.items[itemId]?.icon || null }; });
      base.blocks = blocks.map((x) => ({ id: x.name, name: labels.blocks[x.name]?.name || x.name, count: x.count, icon: labels.blocks[x.name]?.icon || null }));
      base.production = this.localizeProduction(production, labels);
      base.links = { web: `/resources/${resource.id}`, code: `/api/v1/game-content/blueprints/${this.publicId(resource)}/code` };
      await this.countDetailView(resource.id, viewer?.id ?? null, clientIp);
      const updated = await this.resources.findOne({ where: { id: resource.id }, select: ['id', 'view_count'] });
      base.stats.views = Number(updated?.view_count ?? resource.view_count) || 0;
      return base;
    }
    base.map = {
      mode: renderer.game_modes ?? null, players: Number.isFinite(Number(renderer.spawns)) ? Number(renderer.spawns) : null,
      planet: typeof renderer.planet === 'string' && renderer.planet.trim() ? renderer.planet : null, resources: renderer.resources ?? null, cores: renderer.cores ?? null,
      waves: renderer.waves ?? renderer.wave_groups ?? null,
    };
    base.file = { size: resource.file_size ?? null, sha256: resource.content_hash ?? null };
    base.links = { web: `/resources/${resource.id}`, download: `/api/v1/game-content/maps/${this.publicId(resource)}/download` };
    await this.countDetailView(resource.id, viewer?.id ?? null, clientIp);
    const updated = await this.resources.findOne({ where: { id: resource.id }, select: ['id', 'view_count'] });
    base.stats.views = Number(updated?.view_count ?? resource.view_count) || 0;
    return base;
  }

  private async countDetailView(resourceId: number, userId: number | null, clientIp: string): Promise<void> {
    const secret = this.config.get<string>('mobileAuth.refreshHmacSecret') || 'development-only-game-content-view-secret';
    const actorKey = userId !== null
      ? `user:${userId}`
      : `anon:${createHmac('sha256', secret).update(clientIp.trim() || 'unknown').digest('hex')}`;
    const firstInWindow = await this.redis.setIfNotExists(`resource:view:${resourceId}:actor:${actorKey}`, '1', 60);
    if (firstInWindow) await this.resources.increment({ id: resourceId }, 'view_count', 1);
  }

  async blueprintCode(value: string, viewer: Viewer): Promise<{ id: string; code: string }> {
    const id = this.internalId(value);
    const resource = await this.resources.findOne({ where: { public_id: id }, relations: ['category'] });
    if (!resource || resource.resource_kind !== 'schematic') throw new NotFoundException('资源不存在');
    if (!(await this.domain.isResourcePubliclyAccessible(resource))) throw new NotFoundException('资源不存在');
    await this.domain.getById(resource.id, viewer || undefined);
    const version = await this.latestPublishedVersion(resource);
    const resourceFile = version ? await this.files.findOne({ where: { resource_version_id: version.id, role: 'primary', availability_status: 'available' } }) : null;
    let content: Buffer;
    if (resourceFile && this.fileProvider) {
      content = await this.fileProvider.getReadableContent(resourceFile, 20 * 1024 * 1024);
    } else {
      const filePath = version?.file_path || (this.isQuarantinedPath(resource.file_path) ? null : resource.file_path);
      if (!filePath) throw new NotFoundException('蓝图文件不存在');
      const managed = await this.storage.readManagedFile(filePath, 20 * 1024 * 1024).catch(() => null);
      if (!managed) throw new NotFoundException('蓝图文件暂不可用');
      content = managed;
    }
    if (content.subarray(0, 4).toString('ascii') !== 'msch') throw new NotFoundException('蓝图文件暂不可用');
    return { id: value, code: content.toString('base64') };
  }

  async downloadInfo(value: string, userId: number | null = null) {
    const id = this.internalId(value);
    const resource = await this.resources.findOne({ where: { public_id: id }, relations: ['category'] });
    if (!resource || resource.resource_kind !== 'map') throw new NotFoundException('资源不存在');
    await this.downloadPolicy.assertDownloadAuthentication('map', userId ? { id: userId } : null);
    await this.domain.getById(resource.id);
    const version = await this.latestPublishedVersion(resource);
    if (!version && this.isQuarantinedPath(resource.file_path)) throw new NotFoundException('地图文件暂不可用');
    const file = version ? await this.files.findOne({ where: { resource_version_id: version.id, role: 'primary', availability_status: 'available' } }) : null;
    return { url: `/api/v1/game-content/maps/${value}/download/file`, filename: file?.original_filename || version?.file_name || resource.file_name || null, size: file?.size_bytes || version?.file_size || resource.file_size || null, sha256: file?.content_hash || version?.content_hash || resource.content_hash || null, expiresAt: null };
  }

  async prepareMapDownload(value: string, userId: number | null, clientType: string, clientIp = '', clientVersion: string | null = null, platform: string | null = null) {
    const id = this.internalId(value);
    const resource = await this.resources.findOne({ where: { public_id: id, resource_kind: 'map' }, relations: ['category'] });
    if (!resource) throw new NotFoundException('资源不存在');
    await this.downloadPolicy.assertDownloadAuthentication('map', userId ? { id: userId } : null);
    await this.domain.getById(resource.id);
    const version = await this.latestPublishedVersion(resource);
    if (!version && this.isQuarantinedPath(resource.file_path)) throw new NotFoundException('地图文件暂不可用');
    const file = version ? await this.files.findOne({ where: { resource_version_id: version.id, role: 'primary', availability_status: 'available' } }) : null;
    if (file && version) {
      const eligibility = await this.downloadPolicy.checkEligibility(file.id);
      if (!eligibility.eligible) throw new NotFoundException('文件不存在或暂不可下载');
      const providerTarget = this.fileProvider ? await this.fileProvider.getDownloadTarget(file) : null;
      const externalUrl = providerTarget?.kind === 'redirect' ? providerTarget.url : file.external_url || (file.storage_key?.startsWith('http') ? file.storage_key : null);
      const location = providerTarget?.kind === 'managed' ? { path: providerTarget.path, size: providerTarget.size } : externalUrl ? null : await this.storage.statManagedFile(file.storage_key || version.file_path || '');
      if (externalUrl) assertSafeRedirectUrl(externalUrl);
      const now = new Date();
      const granted = await this.downloadGrant.recordGrant({ resourceId: resource.id, versionId: version.id, fileId: file.id, grantedAt: now, userId, clientType, clientVersion, platform, backend: file.storage_backend }, this.downloadActorKey(userId, clientIp));
      return { resource, version, file, path: location?.path || null, size: location?.size || file.size_bytes || null, externalUrl, counted: granted };
    }
    if (version?.file_path) {
      const location = await this.storage.statManagedFile(version.file_path);
      const granted = await this.downloadGrant.recordGrant({ resourceId: resource.id, versionId: version.id, fileId: null, grantedAt: new Date(), userId, clientType, clientVersion, platform, backend: 'local' }, this.downloadActorKey(userId, clientIp));
      return { resource, version, file: null, path: location.path, size: location.size, counted: granted };
    }
    if (resource.file_path) {
      if (this.isQuarantinedPath(resource.file_path)) throw new NotFoundException('地图文件暂不可用');
      const location = await this.storage.statManagedFile(resource.file_path);
      const granted = await this.downloadGrant.recordGrant({ resourceId: resource.id, versionId: null, fileId: null, grantedAt: new Date(), userId, clientType, clientVersion, platform, backend: 'local' }, this.downloadActorKey(userId, clientIp));
      return { resource, version: null, file: null, path: location.path, size: location.size, counted: granted };
    }
    throw new NotFoundException('地图文件暂不可用');
  }

  private downloadActorKey(userId: number | null, clientIp: string): string {
    if (userId !== null) return `user:${userId}`;
    const secret = this.config.get<string>('mobileAuth.refreshHmacSecret') || 'development-only-game-content-view-secret';
    return `anon:${createHmac('sha256', secret).update(clientIp.trim() || 'unknown').digest('hex')}`;
  }

  async recordDownloadLifecycle(target: { resource: Resource; version: ResourceVersion | null; file: ResourceFile | null }, eventType: 'started' | 'completed' | 'failed', userId: number | null, clientType: string, platform: string | null, clientVersion: string | null): Promise<void> {
    await this.downloadEvents.recordEvent({
      event_type: eventType, resource_id: target.resource.id, version_id: target.version?.id ?? null,
      file_id: target.file?.id ?? null, user_id: userId, client_type: clientType,
      client_version: clientVersion, platform, backend: target.file?.storage_backend || 'local', created_at: new Date(),
    });
  }

  async recordDownloadFailure(value: string, userId: number | null, clientType: string, platform: string | null, clientVersion: string | null): Promise<void> {
    const id = this.internalId(value);
    const resource = await this.resources.findOne({ where: { public_id: id, resource_kind: 'map' }, withDeleted: true, select: ['id'] });
    if (!resource) return;
    await this.downloadEvents.recordEvent({
      event_type: 'failed', resource_id: resource.id, version_id: null, file_id: null,
      user_id: userId, client_type: clientType, client_version: clientVersion,
      platform, backend: null, created_at: new Date(),
    });
  }

  async preview(type: GameResourceType, value: string) {
    const id = this.internalId(value);
    const resource = await this.resources.findOne({ where: { public_id: id }, relations: ['category'] });
    if (!resource || resource.resource_kind !== this.kind(type)) throw new NotFoundException('资源不存在');
    if (!(await this.domain.isResourcePubliclyAccessible(resource))) throw new NotFoundException('资源不存在');
    await this.domain.getById(resource.id);
    if (this.isQuarantinedPath(resource.file_path)) return null;
    const resUrl = await this.previews.getResPreviewUrl?.(resource);
    if (resUrl) return { redirectUrl: resUrl };
    return this.previews.readPreview(resource);
  }

  private isQuarantinedPath(filePath: unknown): boolean {
    return typeof filePath === 'string' && /[\\/]\.quarantine[\\/]/.test(filePath);
  }

  private async latestPublishedVersion(resource: Resource): Promise<ResourceVersion | null> {
    if (resource.latest_published_version_id) {
      const pointed = await this.versions.findOne({
        where: { id: resource.latest_published_version_id, resource_id: resource.id, status: 'published' },
      });
      if (pointed) return pointed;
    }
    return this.versions.findOne({
      where: { resource_id: resource.id, status: 'published' },
      order: { published_at: 'DESC', created_at: 'DESC', revision: 'DESC', id: 'DESC' },
    });
  }

  async beginBlueprintUpload(userId: number, code: string) {
    let file: StoredResourceFile;
    try { file = await this.storage.storePastedSchematic(code); }
    catch (error) {
      if (error instanceof BadRequestException) throw new ApiV1Exception('INVALID_BLUEPRINT', HttpStatus.UNPROCESSABLE_ENTITY, '蓝图代码无效或超出大小限制');
      throw error;
    }
    try {
      await this.assertUniqueHash(file.content_hash);
      return await this.previews.createDraft(userId, 'schematic', file);
    } catch (error) {
      await this.storage.removeManaged(file.file_path).catch(() => undefined);
      if (error instanceof BadRequestException) throw new ApiV1Exception('INVALID_BLUEPRINT', HttpStatus.UNPROCESSABLE_ENTITY, '蓝图无法解析为有效的 Mindustry 蓝图');
      throw error;
    }
  }

  async beginMapUpload(userId: number, file: StoredResourceFile, expectedHash?: string) {
    if (!expectedHash || expectedHash.toLowerCase() !== file.content_hash.toLowerCase()) {
      await this.storage.removeManaged(file.file_path).catch(() => undefined);
      throw new BadRequestException({ code: 'HASH_MISMATCH', message: '文件 SHA256 校验失败' });
    }
    let draft: Awaited<ReturnType<ResourcePreviewService['createDraft']>> | undefined;
    let renderedDraft: Awaited<ReturnType<ResourcePreviewService['consumeDraft']>> | undefined;
    try {
      await this.assertUniqueHash(file.content_hash);
      draft = await this.previews.createDraft(userId, 'map', file);
      renderedDraft = await this.previews.consumeDraft(userId, draft.id, 'map');
      const session = await this.uploadSessions.create({
        user_id: userId, filename: file.file_name, mime_type: file.mime_type,
        actual_size: file.file_size, expected_sha256: expectedHash.toLowerCase(), actual_sha256: file.content_hash,
        storage_key: file.file_path, preview_key: renderedDraft.previewKey, parser_version: renderedDraft.parserVersion,
        renderer_metadata: renderedDraft.metadata,
      });
      return { id: session.id, preview_url: `/api/v1/game-content/maps/uploads/${session.id}/preview`, expires_at: session.expires_at.toISOString(), status: session.status };
    } catch (error) {
      if (renderedDraft) await this.previews.discardConsumedDraft(renderedDraft);
      else if (draft) {
        const unconsumed = await this.previews.consumeDraft(userId, draft.id, 'map').catch(() => null);
        if (unconsumed) await this.previews.discardConsumedDraft(unconsumed);
      }
      await this.storage.removeManaged(file.file_path).catch(() => undefined);
      if (error instanceof BadRequestException) throw new ApiV1Exception('INVALID_MAP', HttpStatus.UNPROCESSABLE_ENTITY, '地图文件无法解析或超出服务端限制');
      throw error;
    }
  }

  async completeUpload(userId: number, type: GameResourceType, uploadId: string, input: { title: string; description?: string; tags?: string[] }, ipAddress?: string) {
    if (!input.title?.trim()) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '标题不能为空' });
    if (type === 'map') return this.completeMapUpload(userId, uploadId, input, ipAddress);
    const kind = this.kind(type);
    let draft: Awaited<ReturnType<ResourcePreviewService['consumeDraft']>> | undefined;
    try {
      draft = await this.previews.consumeDraft(userId, uploadId, kind);
      await this.assertUniqueHash(draft.file.content_hash);
      const dto: CreateResourceDto = {
        title: input.title.trim(), description: input.description?.trim(), resource_type: 'upload',
        resource_kind: kind, version: '1.0.0', metadata: { tags: this.normalizeTags(input.tags) },
      };
      const resFile = await this.uploadGameContentToRes(draft.file);
      const resource = await this.domain.create(dto, userId, resFile, { ipAddress, rendererDraft: draft });
      await this.storage.removeManaged(draft.file.file_path).catch(() => undefined);
      return { id: `bp_${resource.public_id}`, resourceId: resource.id, type, status: resource.status, message: '已提交，等待审核' };
    } catch (error) {
      if (draft?.file.file_path) await this.storage.removeManaged(draft.file.file_path).catch(() => undefined);
      if (draft) await this.previews.discardConsumedDraft(draft);
      throw error;
    }
  }

  private async completeMapUpload(userId: number, uploadId: string, input: { title: string; description?: string; tags?: string[] }, ipAddress?: string) {
    const session = await this.uploadSessions.getOwned(uploadId, userId);
    if (session.status === 'expired' || session.expires_at <= new Date()) throw new GoneException({ code: 'UPLOAD_EXPIRED', message: '上传会话已过期' });
    if (session.status === 'completed' && session.resource_id) return this.mapUploadResult(session.resource_id, uploadId);
    const previouslyCreated = await this.findUploadResource(uploadId);
    if (previouslyCreated) {
      await this.uploadSessions.setCompleted(uploadId, previouslyCreated.id);
      return this.mapUploadResult(previouslyCreated.id, uploadId, previouslyCreated);
    }

    const claimed = await this.uploadSessions.claim(uploadId, userId);
    if (!claimed) {
      const linked = await this.findUploadResource(uploadId);
      if (linked) {
        await this.uploadSessions.setCompleted(uploadId, linked.id);
        return this.mapUploadResult(linked.id, uploadId, linked);
      }
      const latest = await this.uploadSessions.getOwned(uploadId, userId);
      if (latest.status === 'completed' && latest.resource_id) return this.mapUploadResult(latest.resource_id, uploadId);
      if (latest.status === 'expired') throw new GoneException({ code: 'UPLOAD_EXPIRED', message: '上传会话已过期' });
      throw new ConflictException({ code: 'UPLOAD_PROCESSING', message: '上传正在处理中，请查询会话状态后重试' });
    }

    const rendererDraft = {
      file: {
        file_name: session.filename, file_path: session.storage_key, file_size: Number(session.actual_size),
        mime_type: session.mime_type || 'application/octet-stream', content_hash: session.actual_sha256,
      },
      previewKey: session.preview_key || '', metadata: session.renderer_metadata,
      parserVersion: session.parser_version,
    };
    try {
      if (session.expected_sha256 !== session.actual_sha256) throw new BadRequestException({ code: 'HASH_MISMATCH', message: '文件 SHA256 校验失败' });
      await this.assertUniqueHash(session.actual_sha256);
      const dto: CreateResourceDto = {
        title: input.title.trim(), description: input.description?.trim(), resource_type: 'upload',
        resource_kind: 'map', version: '1.0.0', metadata: { tags: this.normalizeTags(input.tags) },
      };
      const resFile = await this.uploadGameContentToRes(rendererDraft.file);
      const resource = await this.domain.create(dto, userId, resFile, { ipAddress, rendererDraft, uploadSessionId: uploadId });
      await this.uploadSessions.setCompleted(uploadId, resource.id);
      await this.storage.removeManaged(rendererDraft.file.file_path).catch(() => undefined);
      return { id: `map_${resource.public_id}`, resourceId: resource.id, type: 'map', status: resource.status, message: '已提交，等待审核' };
    } catch (error) {
      await this.uploadSessions.setUploaded(uploadId).catch(() => undefined);
      throw error;
    }
  }

  private async findUploadResource(uploadId: string): Promise<Resource | null> {
    return this.resources.createQueryBuilder('resource')
      .addSelect('resource.game_content_upload_session_id')
      .withDeleted()
      .where('resource.game_content_upload_session_id = :uploadId', { uploadId })
      .getOne();
  }

  private async mapUploadResult(resourceId: number, uploadId: string, knownResource?: Resource | null) {
    const resource = knownResource || await this.resources.findOne({ where: { id: resourceId }, withDeleted: true });
    return {
      id: resource?.public_id ? `map_${resource.public_id}` : `map-upload_${uploadId}`,
      resourceId, type: 'map', status: resource?.status || 'completed', message: '已提交，等待审核',
    };
  }

  async uploadSessionStatus(userId: number, uploadId: string): Promise<GameContentUploadStatusDto> {
    const session = await this.uploadSessions.getOwned(uploadId, userId);
    return { uploadId: session.id, status: session.status, expiresAt: session.expires_at.toISOString(), resourceId: session.resource_id };
  }

  async uploadSessionPreview(userId: number, uploadId: string): Promise<Buffer> {
    return this.uploadSessions.getPreview(userId, uploadId);
  }

  private normalizeTags(tags?: string[]): string[] {
    return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 30).map((tag) => tag.slice(0, 80));
  }

  private async assertUniqueHash(hash: string) {
    const existing = await this.resources.findOne({ where: { content_hash: hash }, select: ['id'] });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: '相同文件已存在' });
  }

  async me(user: User) {
    return { id: user.id, username: user.username, avatar: user.avatar_url || null, role: user.role, phoneVerified: !!user.phone_verified };
  }

  async toggleLike(type: GameResourceType, value: string, userId: number, active: boolean) {
    const resource = await this.requireType(type, value);
    return active ? this.likeService.add(resource.id, userId) : this.likeService.remove(resource.id, userId);
  }
  async toggleFavorite(type: GameResourceType, value: string, userId: number, active: boolean) {
    const resource = await this.requireType(type, value);
    return active ? this.favoriteService.add(resource.id, userId) : this.favoriteService.remove(resource.id, userId);
  }
  private async requireType(type: GameResourceType, value: string) {
    const resource = await this.resources.findOne({ where: { public_id: this.internalId(value) } });
    if (!resource || resource.resource_kind !== this.kind(type)) throw new NotFoundException('资源不存在');
    return resource;
  }

  async favoritesFor(userId: number, limit = 20) {
    const rows = await this.favorites.createQueryBuilder('f').innerJoinAndSelect('f.resource', 'r')
      .leftJoinAndSelect('r.user', 'u').leftJoin('r.category', 'c')
      .where('f.user_id = :userId', { userId }).andWhere('r.deleted_at IS NULL')
      .andWhere('r.resource_kind IN (:...kinds)', { kinds: ['map', 'schematic'] })
      .andWhere('r.status IN (:...statuses)', { statuses: ['approved', 'published'] })
      .andWhere('r.is_public = 1').andWhere('(c.id IS NULL OR c.is_active = 1)')
      .orderBy('f.created_at', 'DESC').take(Math.max(1, Math.min(50, limit))).getMany();
    const resources = rows.map((row) => row.resource);
    return this.toListDtos(resources);
  }
  async myResources(userId: number, limit = 20) {
    const rows = await this.resources.find({ where: { user_id: userId, resource_kind: In(['map', 'schematic']) }, relations: ['user'], order: { created_at: 'DESC', id: 'DESC' }, take: Math.max(1, Math.min(50, limit)) });
    return rows.map((r) => ({ id: this.publicId(r), resourceId: r.id, type: r.resource_kind === 'map' ? 'map' : 'blueprint', title: r.title, status: r.status, rejectReason: r.status === 'rejected' ? r.reject_reason || null : null, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async tags() {
    const rows = await this.resources.find({ where: { resource_kind: In(['map', 'schematic']), status: In(['approved', 'published']), is_public: 1 }, select: ['id', 'metadata_json'] });
    const counts = new Map<string, number>();
    for (const resource of rows) for (const name of this.asList(this.parseObject(resource.metadata_json).tags)) counts.set(name, (counts.get(name) || 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || name, name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 100);
  }
}
