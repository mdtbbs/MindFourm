import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { escapeLike } from '@common/utils/search.util';
import { ResourceReadAdapterService } from '../resource-read-adapter.service';
import { ResourcePreviewService } from '../resource-preview.service';
import {
  ResourceV2DependencyResolutionDto,
  ResourceV2DependencyResolveQueryDto,
  ResourceV2AnalysisDto,
  ResourceV2AnalysisFindingDto,
  ResourceV2CompatibilityDto,
  ResourceV2ConflictDto,
  ResourceV2DependencyDto,
  ResourceV2DiffDto,
  ResourceV2DiffQueryDto,
  ResourceV2FileDto,
  ResourceV2IssueReportDto,
  ResourceV2IssueReportPageDto,
  ResourceV2ManifestDto,
  ResourceV2ModCompatibilityReportDto,
  ResourceV2ModDetailDto,
  ResourceV2PageQueryDto,
  ResourceV2PublicResourceDto,
  ResourceV2RelationDto,
  ResourceV2ResolveModDto,
  ResourceV2StatsDto,
  ResourceV2VersionDto,
  ResourceV2VersionQueryDto,
  ResourceWorkbenchV2Dto,
} from './resources-v2.dto';
import { resolveModDependencies, type ModDependency, type ModRelease } from '../analyzers/mod-dependency-resolver';

type DbRow = Record<string, any>;
type CursorPayload = { sort_at: string; id: number };
type Page<T> = { items: T[]; pagination: { next_cursor: string | null; has_more: boolean } };

const PUBLIC_STATUSES = ['approved', 'published'];
const RELATION_CONTEXTS = ['opening', 'production', 'defense', 'logistics', 'general'] as const;
const PUBLIC_REPORT_STATUSES = ['approved', 'published', 'verified', 'confirmed', 'resolved', 'working', 'partial', 'cannot_start', 'crash', 'performance', 'multiplayer'];
const PUBLIC_CONFLICT_STATUSES = ['unverified', 'verified', 'confirmed', 'cannot_reproduce', 'fixed', 'not_mod_issue', 'resolved'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ResourcesV2Service {
  private readonly tableAvailability = new Map<string, Promise<boolean>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly resourceReadAdapter: ResourceReadAdapterService,
    private readonly resourcePreview: ResourcePreviewService,
  ) {}

  private async tableExists(table: string): Promise<boolean> {
    let pending = this.tableAvailability.get(table);
    if (!pending) {
      pending = this.dataSource.query(
        'SELECT 1 AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
        [table],
      ).then((rows: DbRow[]) => rows.length > 0);
      this.tableAvailability.set(table, pending);
    }
    return pending;
  }

  private async rows(sql: string, parameters: unknown[] = []): Promise<DbRow[]> {
    return this.dataSource.query(sql, parameters) as Promise<DbRow[]>;
  }

  private async rowsFrom(table: string, sql: string, parameters: unknown[] = []): Promise<DbRow[]> {
    if (!await this.tableExists(table)) return [];
    return this.rows(sql, parameters);
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value === 'string') {
      try { return JSON.parse(value) as T; } catch { return fallback; }
    }
    return value as T;
  }

  private objectValue(value: unknown): Record<string, unknown> | null {
    const parsed = this.parseJson<unknown>(value, null);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  }

  private arrayValue(value: unknown): unknown[] {
    const parsed = this.parseJson<unknown>(value, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  private safePublicJson<T>(value: unknown, fallback: T): T {
    const sanitize = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(sanitize);
      if (!input || typeof input !== 'object') return input;
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(input as Record<string, unknown>)) {
        const idField = /^(?:id|.*_id)$/i.test(key);
        const numericId = typeof nested === 'number'
          || (typeof nested === 'string' && /^\d{1,20}$/.test(nested));
        if (idField && numericId) continue;
        if (/(?:storage|preview|icon|asset|download)_key$/i.test(key)) continue;
        if (/^(?:file_path|absolute_path|local_path|storage_path)$/i.test(key)) continue;
        output[key] = sanitize(nested);
      }
      return output;
    };
    return sanitize(this.parseJson<unknown>(value, fallback)) as T;
  }

  private numberValue(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private nullableNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private iso(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value);
  }

  private notFound(): never {
    throw new ApiV1Exception('RESOURCE_NOT_FOUND', HttpStatus.NOT_FOUND, '资源不存在或不可见', false);
  }

  private invalidCursor(): never {
    throw new ApiV1Exception('INVALID_CURSOR', HttpStatus.BAD_REQUEST, '分页游标无效', false);
  }

  private invalidIdentifier(): never {
    throw new ApiV1Exception('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, '公开标识无效', false);
  }

  private encodeCursor(cursor: CursorPayload): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): CursorPayload | null {
    if (!cursor) return null;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>;
      if (typeof value.sort_at !== 'string' || !value.sort_at || !Number.isSafeInteger(value.id) || Number(value.id) < 1) {
        return this.invalidCursor();
      }
      return { sort_at: value.sort_at, id: Number(value.id) };
    } catch {
      return this.invalidCursor();
    }
  }

  private pageLimit(query?: ResourceV2PageQueryDto): number {
    const limit = this.numberValue(query?.limit, 20);
    return Math.max(1, Math.min(100, Math.floor(limit)));
  }

  private cursorSortValue(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    const text = String(value ?? '');
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return this.iso(text) || text;
    return text;
  }

  private pageFromRows<T>(rows: DbRow[], query: ResourceV2PageQueryDto | undefined, mapper: (row: DbRow) => T): Page<T> {
    const limit = this.pageLimit(query);
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible[visible.length - 1];
    const cursor = last && hasMore
      ? this.encodeCursor({ sort_at: this.cursorSortValue(last.v2_sort_at ?? last.created_at), id: this.numberValue(last.id) })
      : null;
    return { items: visible.map(mapper), pagination: { next_cursor: cursor, has_more: hasMore } };
  }

  private async findResourceByPublicId(publicId: string): Promise<Resource | null> {
    if (!this.isUuid(publicId)) return null;
    return this.dataSource.getRepository(Resource).findOne({ where: { public_id: publicId } });
  }

  private isResourcePublic(resource: Resource): boolean {
    return Number(resource.is_public) === 1
      && !(resource as any).deleted_at
      && PUBLIC_STATUSES.includes(String((resource as any).status || 'approved'));
  }

  private emptyMetadata(status: string): Record<string, unknown> {
    return {
      schema_version: 1,
      tags: [],
      supported_versions: [],
      compatibility: [],
      preview: { url: null, status: status || 'none' },
    };
  }

  private async toPublicResourceDto(resource: Resource): Promise<ResourceV2PublicResourceDto> {
    const legacy = resource.public_id
      ? await this.resourceReadAdapter.getResourceByPublicId(resource.public_id)
      : null;
    const fallbackMetadata = this.emptyMetadata(resource.renderer_status || 'none');
    const metadata = this.safePublicJson(
      legacy?.metadata || fallbackMetadata,
      fallbackMetadata,
    ) as Record<string, unknown>;
    const preview = this.objectValue(metadata.preview);
    const renderer: any = {
      status: resource.renderer_status || String(preview?.status || 'none'),
      parser_version: resource.renderer_parser_version || null,
      public_metadata: metadata,
      preview_url: typeof preview?.url === 'string' ? preview.url : null,
    };
    return {
      public_id: resource.public_id || '',
      resource_kind: resource.resource_kind || 'other',
      title: resource.title,
      summary: resource.summary || resource.description || null,
      description: resource.description || null,
      content: resource.content || null,
      source_url: this.publicHttpUrl(resource.source_url),
      license: resource.license || null,
      content_format: 'tiptap_json',
      content_schema_version: Number(resource.content_schema_version) || 2,
      content_json: resource.content_json || null,
      content_html: resource.content_html || null,
      content_text: resource.content_text || null,
      visibility: resource.visibility || (this.isResourcePublic(resource) ? 'public' : 'private'),
      metadata,
      renderer,
    };
  }

  private publicHttpUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
    } catch {
      return null;
    }
  }

  private async getPublicResource(publicId: string, expectedKind?: string): Promise<{ entity: Resource; dto: ResourceV2PublicResourceDto }> {
    const resource = await this.findResourceByPublicId(publicId);
    if (!resource || !this.isResourcePublic(resource)) return this.notFound();
    if (expectedKind && resource.resource_kind !== expectedKind) return this.notFound();
    return { entity: resource, dto: await this.toPublicResourceDto(resource) };
  }

  private async memberRole(resource: Resource, viewer: any): Promise<string | null> {
    const userId = Number(viewer?.id);
    if (!Number.isSafeInteger(userId) || userId < 1) return null;
    if (String(viewer?.role || '').toLowerCase() === 'admin') return 'admin';
    if (Number(resource.user_id) === userId) return 'owner';
    const rows = await this.rowsFrom(
      'resource_members',
      'SELECT role FROM resource_members WHERE resource_id = ? AND user_id = ? AND status = ? LIMIT 1',
      [resource.id, userId, 'active'],
    );
    const role = rows[0]?.role;
    return ['owner', 'maintainer', 'publisher'].includes(role) ? role : null;
  }

  private async canManage(resource: Resource, viewer: any): Promise<boolean> {
    return Boolean(await this.memberRole(resource, viewer));
  }

  private async listVersionRows(resource: Resource, query?: ResourceV2PageQueryDto, includeUnpublished = false): Promise<Page<DbRow>> {
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query?.cursor);
    const clauses = ['resource_id = ?', 'public_id IS NOT NULL'];
    const parameters: unknown[] = [resource.id];
    if (!includeUnpublished) clauses.push("status = 'published'");
    if (cursor) {
      clauses.push('(COALESCE(published_at, created_at) < ? OR (COALESCE(published_at, created_at) = ? AND id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rows(
      `SELECT *, COALESCE(published_at, created_at) AS v2_sort_at FROM resource_versions WHERE ${clauses.join(' AND ')} ORDER BY v2_sort_at DESC, id DESC LIMIT ?`,
      parameters,
    );
    return this.pageFromRows(rows.filter(row => this.isUuid(row.public_id)), query, row => row);
  }

  private async selectedVersion(resource: Resource, publicId?: string, includeUnpublished = false): Promise<DbRow | null> {
    let rows: DbRow[];
    if (publicId) {
      if (!this.isUuid(publicId)) return this.notFound();
      rows = await this.rows(
        `SELECT * FROM resource_versions WHERE resource_id = ? AND public_id = ?${includeUnpublished ? '' : " AND status = 'published'"} LIMIT 1`,
        [resource.id, publicId],
      );
    } else {
      rows = await this.rows(
        `SELECT * FROM resource_versions WHERE resource_id = ? AND public_id IS NOT NULL${includeUnpublished ? '' : " AND status = 'published'"} ORDER BY recommended DESC, COALESCE(published_at, created_at) DESC, revision DESC, id DESC LIMIT 1`,
        [resource.id],
      );
    }
    return rows[0] && this.isUuid(rows[0].public_id) ? rows[0] : null;
  }

  private async collectFiles(versionIds: number[]): Promise<Map<number, ResourceV2FileDto[]>> {
    if (!versionIds.length || !await this.tableExists('resource_files')) return new Map();
    const placeholders = versionIds.map(() => '?').join(',');
    const rows = (await this.rows(
      `SELECT * FROM resource_files WHERE resource_version_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
      versionIds,
    )).filter(row => this.isUuid(row.public_id));
    const mapped = new Map<number, ResourceV2FileDto[]>();
    for (const row of rows) {
      const versionId = this.numberValue(row.resource_version_id);
      const dto: ResourceV2FileDto = {
        public_id: String(row.public_id || ''),
        role: String(row.role || 'primary'),
        delivery_mode: String(row.delivery_mode || 'managed'),
        platform: row.platform_key || null,
        architecture: row.architecture_key || null,
        package_type: row.package_type || null,
        display_name: row.display_name || null,
        original_filename: row.original_filename || null,
        mime_type: row.mime_type || null,
        size_bytes: this.nullableNumber(row.size_bytes),
        sha256: String(row.hash_algorithm || '').toLowerCase() === 'sha256' ? row.content_hash || null : null,
        integrity_status: String(row.integrity_status || 'unverified_legacy'),
        availability_status: String(row.availability_status || 'unavailable'),
        downloadable: String(row.availability_status) === 'available',
        installable: String(row.integrity_status) === 'verified' && String(row.availability_status) === 'available' && String(row.delivery_mode) === 'managed',
        download_url: '',
      };
      // A file row does not expose its parent resource ID. The link is completed
      // by hydrateVersions below from the resource UUID and version UUID.
      const list = mapped.get(versionId) || [];
      list.push(dto);
      mapped.set(versionId, list);
    }
    return mapped;
  }

  private async collectVersionPreviewKeys(resource: Resource, versionIds: number[]): Promise<Map<number, string>> {
    if (!versionIds.length || !['map', 'schematic'].includes(resource.resource_kind || '')) return new Map();
    const table = resource.resource_kind === 'map' ? 'map_version_metadata' : 'schematic_version_metadata';
    const placeholders = versionIds.map(() => '?').join(',');
    const rows = await this.rowsFrom(table,
      `SELECT resource_version_id, preview_key FROM ${table} WHERE resource_version_id IN (${placeholders}) AND preview_key IS NOT NULL`, versionIds);
    return new Map(rows.filter(row => typeof row.preview_key === 'string' && row.preview_key.length > 0)
      .map(row => [this.numberValue(row.resource_version_id), String(row.preview_key)]));
  }

  private hasValidVersionPreviewKey(kind: string, key: unknown): boolean {
    return ['map', 'schematic'].includes(kind)
      && typeof key === 'string'
      && new RegExp(`^resources/${kind}/[a-f0-9]{2}/[a-f0-9]{64}/preview\\.png$`, 'i').test(key);
  }

  private resourcePreviewUrl(resource: Resource): string | null {
    if (!this.isResourcePublic(resource) || !this.isUuid(resource.public_id)
      || (!this.numberValue(resource.latest_published_version_id)
        && typeof (resource as any).file_path === 'string'
        && /[\\/]\.quarantine[\\/]/.test((resource as any).file_path))) return null;
    const resourceUrl = `/api/v1/resources/${resource.public_id}/preview`;
    const hasStoredPreview = String((resource as any).renderer_status || '') === 'ready'
      && (Boolean(resource.renderer_preview_object_id) || this.hasValidVersionPreviewKey(String(resource.resource_kind || ''), (resource as any).renderer_preview_key));
    return hasStoredPreview ? resourceUrl : null;
  }

  private setSelectedPreview(resource: Resource, dto: ResourceV2PublicResourceDto, versionPreviewUrl?: string | null): void {
    if (!dto.renderer) return;
    dto.renderer.preview_url = versionPreviewUrl
      || this.resourcePreviewUrl(resource);
  }

  private async collectCompatibility(versionIds: number[]): Promise<Map<number, ResourceV2CompatibilityDto[]>> {
    if (!versionIds.length) return new Map();
    const placeholders = versionIds.map(() => '?').join(',');
    const modern = await this.tableExists('resource_compatibilities');
    const rows = modern
      ? await this.rows(`SELECT * FROM resource_compatibilities WHERE resource_version_id IN (${placeholders}) ORDER BY id ASC`, versionIds)
      : await this.rowsFrom('resource_version_compatibilities', `SELECT * FROM resource_version_compatibilities WHERE resource_version_id IN (${placeholders}) ORDER BY id ASC`, versionIds);
    const map = new Map<number, ResourceV2CompatibilityDto[]>();
    for (const row of rows) {
      const versionId = this.numberValue(row.resource_version_id);
      const dto: ResourceV2CompatibilityDto = {
        runtime: String(row.runtime || 'mindustry'),
        game_version: row.game_version || row.game_series || null,
        min_game_version: row.min_game_version || row.min_version_value || null,
        max_game_version: row.max_game_version || row.max_version_value || null,
        platform: row.platform_key || null,
        status: row.status || null,
        source: row.source || row.provenance || null,
        confidence: row.confidence || null,
        channel: row.channel || null,
        notes: row.notes || null,
      };
      const list = map.get(versionId) || [];
      list.push(dto);
      map.set(versionId, list);
    }
    return map;
  }

  private async collectDependencies(versionIds: number[]): Promise<Map<number, ResourceV2DependencyDto[]>> {
    if (!versionIds.length) return new Map();
    const placeholders = versionIds.map(() => '?').join(',');
    const modern = await this.tableExists('resource_dependencies');
    const rows = modern
      ? await this.rows(
        `SELECT d.*, CASE WHEN target.is_public = 1 AND target.deleted_at IS NULL AND target.status IN ('approved','published') THEN target.public_id ELSE NULL END AS target_public_id FROM resource_dependencies d LEFT JOIN resources target ON target.id = d.target_resource_id WHERE d.resource_version_id IN (${placeholders}) ORDER BY d.sort_order ASC, d.id ASC`,
        versionIds,
      )
      : await this.rowsFrom(
        'resource_version_dependencies',
        `SELECT d.*, CASE WHEN target.is_public = 1 AND target.deleted_at IS NULL AND target.status IN ('approved','published') THEN target.public_id ELSE NULL END AS target_public_id FROM resource_version_dependencies d LEFT JOIN resources target ON target.id = d.target_resource_id WHERE d.resource_version_id IN (${placeholders}) ORDER BY d.sort_order ASC, d.id ASC`,
        versionIds,
      );
    const map = new Map<number, ResourceV2DependencyDto[]>();
    for (const row of rows) {
      const versionId = this.numberValue(row.resource_version_id);
      const dto: ResourceV2DependencyDto = {
        dependency_type: String(row.dependency_type || 'required'),
        resource_public_id: this.isUuid(row.target_public_id) ? String(row.target_public_id) : null,
        external_identifier: row.external_identifier || null,
        upstream_url: row.upstream_url || null,
        version_constraint: row.version_constraint || null,
        resolution_status: row.resolution_status || null,
        sort_order: this.numberValue(row.sort_order),
      };
      const list = map.get(versionId) || [];
      list.push(dto);
      map.set(versionId, list);
    }
    return map;
  }

  private async hydrateVersions(resource: Resource, versionRows: DbRow[]): Promise<ResourceV2VersionDto[]> {
    const valid = versionRows.filter(row => this.isUuid(row.public_id));
    const ids = valid.map(row => this.numberValue(row.id));
    const [files, compatibilities, dependencies, previewKeys] = await Promise.all([
      this.collectFiles(ids),
      this.collectCompatibility(ids),
      this.collectDependencies(ids),
      this.collectVersionPreviewKeys(resource, ids),
    ]);
    const publicIds = new Map(valid.map(row => [this.numberValue(row.id), String(row.public_id)]));
    return Promise.all(valid.map(async row => {
      const id = this.numberValue(row.id);
      const versionPublicId = String(row.public_id);
      const versionFiles = files.get(id) || [];
      for (const file of versionFiles) {
        file.download_url = `/api/v1/resources/${resource.public_id}/versions/${versionPublicId}/files/${file.public_id}/download`;
      }
      const hasOwnPreview = this.hasValidVersionPreviewKey(String(resource.resource_kind || ''), previewKeys.get(id));
      const resPreviewUrl = row.renderer_preview_object_id
        ? await this.resourcePreview.getVersionResPreviewUrl(resource, row as ResourceVersion) : null;
      const previewUrl = resPreviewUrl || (this.isResourcePublic(resource) && row.status === 'published'
        ? (hasOwnPreview ? `/api/v1/resources/${resource.public_id}/versions/${versionPublicId}/preview` : this.resourcePreviewUrl(resource))
        : null);
      return {
        public_id: versionPublicId,
        version: String(row.version || ''),
        display_version: String(row.display_version || row.version || ''),
        version_mode: String(row.version_mode || 'compatibility'),
        revision: Math.max(1, this.numberValue(row.revision, 1)),
        release_channel: String(row.release_channel || 'stable'),
        recommended: Number(row.recommended) === 1 || row.recommended === true,
        game_version_min: row.game_version_min || null,
        game_version_max: row.game_version_max || null,
        status: String(row.status || 'published'),
        published_at: this.iso(row.published_at),
        preview_url: previewUrl,
        compatibility: compatibilities.get(id) || [],
        dependencies: dependencies.get(id) || [],
        files: versionFiles,
      };
    }));
  }

  private emptyPage<T>(query?: ResourceV2PageQueryDto): Page<T> {
    this.pageLimit(query);
    if (query?.cursor) this.decodeCursor(query.cursor);
    return { items: [], pagination: { next_cursor: null, has_more: false } };
  }

  private async statsFor(resource: Resource): Promise<ResourceV2StatsDto> {
    const count = async (table: string) => {
      if (!await this.tableExists(table)) return 0;
      const rows = await this.rows(`SELECT COUNT(*) AS total FROM ${table} WHERE resource_id = ?`, [resource.id]);
      return this.numberValue(rows[0]?.total);
    };
    const [likes, favorites] = await Promise.all([count('resource_likes'), count('resource_favorites')]);
    return {
      views: this.numberValue(resource.view_count),
      downloads: this.numberValue(resource.download_count),
      likes,
      favorites,
      rating_count: this.numberValue(resource.rating_count),
      rating_average: this.numberValue(resource.rating_average),
    };
  }

  private async relationPage(resource: Resource, query?: ResourceV2PageQueryDto): Promise<Page<ResourceV2RelationDto>> {
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query?.cursor);
    const clauses = [
      '(rr.source_resource_id = ? OR rr.target_resource_id = ?)',
      'peer.is_public = 1',
      'peer.deleted_at IS NULL',
      "peer.status IN ('approved','published')",
      'peer.public_id IS NOT NULL',
    ];
    // The JOIN parameters occur before the WHERE parameters in SQL text.
    const parameters: unknown[] = [resource.id, resource.id, resource.id, resource.id];
    if (cursor) {
      clauses.push('(rr.created_at < ? OR (rr.created_at = ? AND rr.id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom(
      'resource_relations',
      `SELECT rr.id, rr.relation_type, rr.relation_context, rr.created_at,
       CASE WHEN rr.source_resource_id = ? THEN 'outgoing' ELSE 'incoming' END AS relation_direction,
       peer.public_id AS peer_public_id, peer.title AS peer_title, peer.resource_kind AS peer_kind,
       CASE WHEN version.status = 'published' THEN version.public_id ELSE NULL END AS peer_version_public_id,
       CASE WHEN version.status = 'published' THEN version.version ELSE NULL END AS peer_version
       FROM resource_relations rr
       JOIN resources peer ON peer.id = CASE WHEN rr.source_resource_id = ? THEN rr.target_resource_id ELSE rr.source_resource_id END
       LEFT JOIN resource_versions version ON version.id = CASE WHEN rr.source_resource_id = ? THEN rr.target_version_id ELSE rr.source_version_id END
       WHERE ${clauses.join(' AND ')} ORDER BY rr.created_at DESC, rr.id DESC LIMIT ?`,
      [resource.id, ...parameters],
    );
    const safeRows = rows.filter(row => this.isUuid(row.peer_public_id));
    const hasMore = safeRows.length > limit;
    const visible = safeRows.slice(0, limit);
    const last = visible[visible.length - 1];
    return {
      items: visible.map(row => ({
        relation_type: String(row.relation_type || 'related'),
        relation_direction: row.relation_direction === 'incoming' ? 'incoming' : 'outgoing',
        relation_context: RELATION_CONTEXTS.includes(row.relation_context) ? row.relation_context : 'general',
        resource: {
          public_id: this.isUuid(row.peer_public_id) ? String(row.peer_public_id) : '',
          title: String(row.peer_title || ''),
          resource_kind: String(row.peer_kind || 'other'),
        },
        version_public_id: this.isUuid(row.peer_version_public_id) ? String(row.peer_version_public_id) : null,
        version: typeof row.peer_version === 'string' && row.peer_version.length ? String(row.peer_version) : null,
      })),
      pagination: {
        next_cursor: hasMore && last ? this.encodeCursor({ sort_at: this.iso(last.created_at) || '', id: this.numberValue(last.id) }) : null,
        has_more: hasMore,
      },
    };
  }

  async getVersions(publicId: string, query?: ResourceV2PageQueryDto) {
    const { entity } = await this.getPublicResource(publicId);
    const page = await this.listVersionRows(entity, query);
    return { ...page, items: await this.hydrateVersions(entity, page.items) };
  }

  async getRelations(publicId: string, query?: ResourceV2PageQueryDto, kind?: string) {
    const { entity } = await this.getPublicResource(publicId, kind);
    return this.relationPage(entity, query);
  }

  async getStats(publicId: string) {
    const { entity } = await this.getPublicResource(publicId);
    return this.statsFor(entity);
  }

  async getVersionPreviewUrl(publicId: string, versionPublicId: string): Promise<string | null> {
    const { entity } = await this.getPublicResource(publicId);
    const version = await this.selectedVersion(entity, versionPublicId);
    if (!version) return this.notFound();
    if (version.renderer_preview_object_id) return this.resourcePreview.getVersionResPreviewUrl(entity, version as ResourceVersion);
    return this.resourcePreview.getResPreviewUrl(entity);
  }

  async readVersionPreview(publicId: string, versionPublicId: string): Promise<Buffer> {
    const { entity } = await this.getPublicResource(publicId);
    const version = await this.selectedVersion(entity, versionPublicId);
    if (!version) return this.notFound();
    const previewKeys = await this.collectVersionPreviewKeys(entity, [this.numberValue(version.id)]);
    const key = previewKeys.get(this.numberValue(version.id));
    if (this.hasValidVersionPreviewKey(String(entity.resource_kind || ''), key)) {
      return this.resourcePreview.readPreviewKey(key as string);
    }
    if (!this.numberValue(entity.latest_published_version_id)
      && typeof (entity as any).file_path === 'string'
      && /[\\/]\.quarantine[\\/]/.test((entity as any).file_path)) return this.notFound();
    const resourcePreview = await this.resourcePreview.readPreview(entity);
    if (!resourcePreview) return this.notFound();
    return resourcePreview;
  }

  async getTypeVersions(publicId: string, kind: string, query?: ResourceV2PageQueryDto) {
    const { entity } = await this.getPublicResource(publicId, kind);
    const page = await this.listVersionRows(entity, query);
    return { ...page, items: await this.hydrateVersions(entity, page.items) };
  }

  async getManifest(publicId: string, kind: string): Promise<ResourceV2ManifestDto> {
    const { entity, dto } = await this.getPublicResource(publicId, kind);
    const page = await this.listVersionRows(entity, { limit: 100 });
    const versions = await this.hydrateVersions(entity, page.items);
    const recommended = versions.find(version => version.recommended) || versions[0] || null;
    this.setSelectedPreview(entity, dto, recommended?.preview_url);
    const relations = await this.relationPage(entity, { limit: 20 });
    const stats = await this.statsFor(entity);
    let kindSummary: Record<string, unknown> | null = null;
    if (kind === 'mod') {
      const profile = await this.modProfile(entity);
      const contentCount = await this.rowsFrom('mod_contents',
        "SELECT COUNT(*) AS total FROM mod_contents c JOIN resource_versions v ON v.id = c.resource_version_id WHERE v.resource_id = ? AND v.status = 'published'",
        [entity.id]);
      kindSummary = { profile, content_count: this.numberValue(contentCount[0]?.total) };
    } else if (kind === 'schematic') {
      kindSummary = await this.schematicSummary(entity, recommended?.public_id);
    } else {
      kindSummary = await this.mapSummary(entity, recommended?.public_id);
    }
    return {
      schema_version: 2,
      resource: dto,
      recommended_version: recommended,
      versions,
      relations: relations.items,
      stats,
      kind_summary: kindSummary,
    };
  }

  async getWorkbench(publicId: string, viewer: any): Promise<ResourceWorkbenchV2Dto> {
    if (!this.isUuid(publicId)) return this.notFound();
    const resource = await this.findResourceByPublicId(publicId);
    if (!resource) return this.notFound();
    const memberRole = await this.memberRole(resource, viewer);
    const viewerRole = String(viewer?.role || '').toLowerCase();
    const staffRole = ['admin', 'moderator'].includes(viewerRole) ? viewerRole : null;
    const role = memberRole || staffRole;
    if (!this.isResourcePublic(resource) && !role) return this.notFound();
    const resourceDto = await this.toPublicResourceDto(resource);
    const versionPage = await this.listVersionRows(resource, { limit: 100 }, Boolean(role));
    const versions = await this.hydrateVersions(resource, versionPage.items);
    const selected = await this.selectedVersion(resource, undefined, Boolean(role));
    const selectedDto = selected ? versions.find(version => version.public_id === selected.public_id) : null;
    this.setSelectedPreview(resource, resourceDto, selectedDto?.preview_url);
    const analysis = selected ? await this.analysisFor(resource, selected, resource.resource_kind || 'other') : null;
    const relations = this.isResourcePublic(resource) ? await this.relationPage(resource, { limit: 100 }) : this.emptyPage<ResourceV2RelationDto>();
    return {
      resource: resourceDto,
      permissions: {
        role: role || (this.isResourcePublic(resource) ? 'viewer' : null),
        can_manage: Boolean(memberRole),
      },
      versions,
      analysis,
      relations: relations.items,
      stats: await this.statsFor(resource),
    };
  }

  async getTypeDetail(publicId: string, kind: 'mod' | 'schematic' | 'map', query?: ResourceV2VersionQueryDto) {
    const { entity, dto } = await this.getPublicResource(publicId, kind);
    const version = await this.selectedVersion(entity, query?.version_public_id);
    const stats = await this.statsFor(entity);
    if (kind === 'mod') {
      return { resource: dto, profile: await this.modProfile(entity), stats } satisfies ResourceV2ModDetailDto;
    }
    const versionDto = version ? (await this.hydrateVersions(entity, [version]))[0] : null;
    this.setSelectedPreview(entity, dto, versionDto?.preview_url);
    if (kind === 'schematic') {
      const row = version && (await this.rowsFrom('schematic_version_metadata',
        'SELECT * FROM schematic_version_metadata WHERE resource_version_id = ? LIMIT 1', [version.id]))[0];
      return {
        resource: dto,
        version_public_id: version?.public_id || null,
        schematic: {
          width: this.nullableNumber(row?.width),
          height: this.nullableNumber(row?.height),
          block_count: this.nullableNumber(row?.block_count),
          min_supported_build: this.nullableNumber(row?.min_supported_build),
          schematic_format_version: this.nullableNumber(row?.schematic_format_version),
          parser_version: row?.parser_version || null,
          dependencies: this.stringList(row?.dependencies_json),
        },
        stats,
      };
    }
    const row = version && (await this.rowsFrom('map_version_metadata',
      'SELECT * FROM map_version_metadata WHERE resource_version_id = ? LIMIT 1', [version.id]))[0];
    const cores = version ? await this.mapCores(this.numberValue(version.id)) : [];
    return {
      resource: dto,
      version_public_id: version?.public_id || null,
      map: {
        width: this.nullableNumber(row?.width),
        height: this.nullableNumber(row?.height),
        game_mode: row?.game_mode || null,
        game_modes: this.stringList(row?.game_modes_json),
        planet: row?.planet || null,
        player_count: this.nullableNumber(row?.player_count),
        playtime_seconds: this.nullableNumber(row?.playtime_seconds),
        game_version_min: row?.game_version_min || null,
        game_version_max: row?.game_version_max || null,
        parser_version: row?.parser_version || null,
        cores,
      },
      stats,
    };
  }

  private stringList(value: unknown): string[] {
    return this.arrayValue(value).filter((item): item is string => typeof item === 'string');
  }

  private async modProfile(resource: Resource) {
    const rows = await this.rowsFrom('mod_profiles', 'SELECT mod_id, display_name, runtime_type, description FROM mod_profiles WHERE resource_id = ? LIMIT 1', [resource.id]);
    const aliases = await this.rowsFrom('mod_id_aliases', 'SELECT alias FROM mod_id_aliases WHERE resource_id = ? ORDER BY alias ASC', [resource.id]);
    return {
      mod_id: rows[0]?.mod_id || null,
      display_name: rows[0]?.display_name || null,
      runtime_type: this.runtimeLabel(rows[0]?.runtime_type),
      description: rows[0]?.description || null,
      aliases: aliases.map(row => String(row.alias)),
    };
  }

  private async schematicSummary(resource: Resource, versionPublicId?: string | null): Promise<Record<string, unknown> | null> {
    const version = await this.selectedVersion(resource, versionPublicId || undefined);
    if (!version) return null;
    const rows = await this.rowsFrom('schematic_version_metadata',
      'SELECT width, height, block_count, min_supported_build, parser_version FROM schematic_version_metadata WHERE resource_version_id = ? LIMIT 1', [version.id]);
    const analyses = await this.rowsFrom('schematic_analyses',
      'SELECT complete, available, production_json, bottlenecks_json, warnings_json FROM schematic_analyses WHERE resource_version_id = ? LIMIT 1', [version.id]);
    return {
      version_public_id: version.public_id,
      metadata: rows[0] ? {
        width: this.nullableNumber(rows[0].width), height: this.nullableNumber(rows[0].height),
        block_count: this.nullableNumber(rows[0].block_count), min_supported_build: this.nullableNumber(rows[0].min_supported_build),
        parser_version: rows[0].parser_version || null,
      } : null,
      analysis: analyses[0] ? this.safePublicJson({
        complete: Number(analyses[0].complete) === 1,
        available: Number(analyses[0].available) === 1,
        production: this.objectValue(analyses[0].production_json),
        bottlenecks: this.arrayValue(analyses[0].bottlenecks_json),
        warnings: this.arrayValue(analyses[0].warnings_json),
      }, null) : null,
    };
  }

  private async mapSummary(resource: Resource, versionPublicId?: string | null): Promise<Record<string, unknown> | null> {
    const version = await this.selectedVersion(resource, versionPublicId || undefined);
    if (!version) return null;
    const metadataRows = await this.rowsFrom('map_version_metadata', 'SELECT * FROM map_version_metadata WHERE resource_version_id = ? LIMIT 1', [version.id]);
    const waves = await this.rowsFrom('map_wave_summaries', 'SELECT wave_start, wave_end, enemy_count, estimated_health, air_ratio, boss_count, strength, is_spike FROM map_wave_summaries WHERE resource_version_id = ? ORDER BY wave_start ASC, id ASC', [version.id]);
    const entries = await this.rowsFrom('map_resource_entries', 'SELECT resource_type, internal_name, amount, distribution_json FROM map_resource_entries WHERE resource_version_id = ? ORDER BY resource_type, internal_name', [version.id]);
    const metadata = metadataRows[0];
    return {
      version_public_id: version.public_id,
      size: metadata ? { width: this.nullableNumber(metadata.width), height: this.nullableNumber(metadata.height) } : null,
      mode: metadata?.game_mode || null,
      rules: this.safePublicJson(this.objectValue(metadata?.rules_json), null),
      resources: entries.map(item => ({ resource_type: item.resource_type, internal_name: item.internal_name, amount: this.nullableNumber(item.amount), distribution: this.safePublicJson(this.objectValue(item.distribution_json), null) })),
      waves: waves.map(wave => ({
        wave_start: this.numberValue(wave.wave_start), wave_end: this.numberValue(wave.wave_end),
        enemy_count: this.nullableNumber(wave.enemy_count), estimated_health: this.nullableNumber(wave.estimated_health),
        air_ratio: this.nullableNumber(wave.air_ratio), boss_count: this.numberValue(wave.boss_count),
        strength: this.nullableNumber(wave.strength), is_spike: Number(wave.is_spike) === 1,
      })),
    };
  }

  private async mapCores(versionId: number): Promise<Array<Record<string, unknown>>> {
    const rows = await this.rowsFrom('map_cores', 'SELECT core_type, team, x, y FROM map_cores WHERE resource_version_id = ? ORDER BY team, id', [versionId]);
    return rows.map(row => ({ core_type: row.core_type || null, team: row.team || null, x: this.nullableNumber(row.x), y: this.nullableNumber(row.y) }));
  }

  private runtimeLabel(value: unknown): string | null {
    const normalized = String(value || '').toLowerCase();
    const labels: Record<string, string> = { java: 'Java', js: 'JS', hybrid: 'Hybrid', content: 'Content' };
    return labels[normalized] || null;
  }

  async getModContents(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'mod');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version || !await this.tableExists('mod_contents')) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['c.resource_version_id = ?', 'c.public_id IS NOT NULL'];
    const parameters: unknown[] = [version.id];
    if (cursor) {
      clauses.push('(c.created_at < ? OR (c.created_at = ? AND c.id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rows(
      `SELECT c.*, c.created_at AS v2_sort_at FROM mod_contents c WHERE ${clauses.join(' AND ')} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
      parameters,
    );
    const contentRows = rows
      .filter(row => this.isUuid(row.public_id))
      .map(row => ({ ...row, resource_public_id: entity.public_id, resource_title: entity.title, resource_kind: entity.resource_kind || 'mod', version_public_id: version.public_id }));
    return this.pageFromRows(contentRows, query, row => this.contentDto(row));
  }

  async getLocalizations(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'mod');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version || !await this.tableExists('mod_localizations')) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) {
      clauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rows(
      `SELECT *, created_at AS v2_sort_at FROM mod_localizations WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`,
      parameters,
    );
    return this.pageFromRows(rows, query, row => ({
      locale: String(row.locale || ''),
      translated_count: this.numberValue(row.translated_count),
      total_count: this.numberValue(row.total_count),
      percentage: this.numberValue(row.percentage),
      missing_keys: this.stringList(row.missing_keys_json),
    }));
  }

  private contentDto(row: DbRow) {
    return {
      public_id: String(row.public_id || ''),
      content_type: String(row.content_type || ''),
      internal_name: String(row.internal_name || ''),
      display_name: row.display_name || null,
      description: row.description || null,
      // icon_key is an internal asset key; only a future verified asset route
      // can turn it into a public URL.
      icon_url: null,
      properties: this.safePublicJson(row.properties_json, {}) || {},
      resource: {
        public_id: this.isUuid(row.resource_public_id) ? String(row.resource_public_id) : '',
        title: String(row.resource_title || ''),
        resource_kind: String(row.resource_kind || 'mod'),
      },
      version_public_id: this.isUuid(row.version_public_id) ? String(row.version_public_id) : '',
    };
  }

  async searchModContent(query: ResourceV2PageQueryDto & { q: string; type?: string }) {
    const term = String(query.q || '').trim();
    if (!term) this.invalidIdentifier();
    if (!await this.tableExists('mod_contents')) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const escaped = `%${escapeLike(term)}%`;
    const clauses = [
      'r.is_public = 1', 'r.deleted_at IS NULL', "r.status IN ('approved','published')",
      "r.resource_kind = 'mod'", "v.status = 'published'", 'c.public_id IS NOT NULL',
      '(c.internal_name LIKE ? OR c.display_name LIKE ? OR c.description LIKE ?)',
    ];
    const parameters: unknown[] = [escaped, escaped, escaped];
    if (query.type?.trim()) {
      clauses.push('c.content_type = ?');
      parameters.push(query.type.trim().slice(0, 50));
    }
    if (cursor) {
      clauses.push('(c.created_at < ? OR (c.created_at = ? AND c.id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rows(
      `SELECT c.*, c.created_at AS v2_sort_at, r.public_id AS resource_public_id, r.title AS resource_title, r.resource_kind AS resource_kind, v.public_id AS version_public_id FROM mod_contents c JOIN resource_versions v ON v.id = c.resource_version_id JOIN resources r ON r.id = v.resource_id WHERE ${clauses.join(' AND ')} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
      parameters,
    );
    return this.pageFromRows(rows.filter(row => this.isUuid(row.public_id)
      && this.isUuid(row.resource_public_id) && this.isUuid(row.version_public_id)), query, row => this.contentDto(row));
  }

  async findContentByPublicId(contentPublicId: string) {
    if (!this.isUuid(contentPublicId)) return this.notFound();
    const rows = await this.rowsFrom(
      'mod_contents',
      `SELECT c.*, r.public_id AS resource_public_id, r.title AS resource_title, r.resource_kind AS resource_kind, v.public_id AS version_public_id FROM mod_contents c JOIN resource_versions v ON v.id = c.resource_version_id JOIN resources r ON r.id = v.resource_id WHERE c.public_id = ? AND r.is_public = 1 AND r.deleted_at IS NULL AND r.status IN ('approved','published') AND r.resource_kind = 'mod' AND v.status = 'published' LIMIT 1`,
      [contentPublicId],
    );
    if (!rows[0] || !this.isUuid(rows[0].resource_public_id) || !this.isUuid(rows[0].version_public_id)) return this.notFound();
    return this.contentDto(rows[0]);
  }

  async findContentByName(type: string, internalName: string, query: ResourceV2PageQueryDto) {
    const normalizedType = String(type || '').trim().toLowerCase();
    const normalizedName = String(internalName || '').trim();
    if (!normalizedType || normalizedType.length > 50 || !normalizedName || normalizedName.length > 191) this.invalidIdentifier();
    if (!await this.tableExists('mod_contents')) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = [
      'c.content_type = ?', 'r.is_public = 1', 'r.deleted_at IS NULL', "r.status IN ('approved','published')",
      "r.resource_kind = 'mod'", "v.status = 'published'", 'c.public_id IS NOT NULL', 'r.public_id IS NOT NULL', 'v.public_id IS NOT NULL',
      '(c.internal_name = ? OR EXISTS (SELECT 1 FROM mod_content_aliases a WHERE a.resource_id = r.id AND a.content_type = c.content_type AND a.old_internal_name = ? AND a.new_internal_name = c.internal_name))',
    ];
    const parameters: unknown[] = [normalizedType, normalizedName, normalizedName];
    if (cursor) {
      clauses.push('(c.created_at < ? OR (c.created_at = ? AND c.id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rows(
      `SELECT c.*, c.created_at AS v2_sort_at, r.public_id AS resource_public_id, r.title AS resource_title, r.resource_kind AS resource_kind, v.public_id AS version_public_id FROM mod_contents c JOIN resource_versions v ON v.id = c.resource_version_id JOIN resources r ON r.id = v.resource_id WHERE ${clauses.join(' AND ')} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
      parameters,
    );
    return this.pageFromRows(rows.filter(row => this.isUuid(row.public_id)
      && this.isUuid(row.resource_public_id) && this.isUuid(row.version_public_id)), query, row => this.contentDto(row));
  }

  async resolveMod(identifier: string): Promise<ResourceV2ResolveModDto> {
    const value = String(identifier || '').trim();
    if (!value || value.length > 191) this.invalidIdentifier();
    let resource: Resource | null = null;
    if (this.isUuid(value)) {
      resource = await this.findResourceByPublicId(value);
    } else {
      const direct = await this.rowsFrom(
        'mod_profiles',
        'SELECT r.public_id FROM mod_profiles m JOIN resources r ON r.id = m.resource_id WHERE m.mod_id = ? LIMIT 1',
        [value],
      );
      const alias = direct[0] ? [] : await this.rowsFrom(
        'mod_id_aliases',
        'SELECT r.public_id FROM mod_id_aliases a JOIN resources r ON r.id = a.resource_id WHERE a.alias = ? LIMIT 1',
        [value],
      );
      const resolvedId = direct[0]?.public_id || alias[0]?.public_id;
      if (resolvedId) resource = await this.findResourceByPublicId(String(resolvedId));
    }
    if (!resource || resource.resource_kind !== 'mod' || !this.isResourcePublic(resource)) return this.notFound();
    const profile = await this.modProfile(resource);
    if (!profile.mod_id) return this.notFound();
    return {
      requested_mod_id: value,
      canonical_mod_id: profile.mod_id,
      resource: await this.toPublicResourceDto(resource),
      aliases: profile.aliases,
    };
  }

  async getDependencies(publicId: string, kind: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, kind);
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const params: unknown[] = [version.id];
    const clauses = ['d.resource_version_id = ?'];
    if (cursor) {
      clauses.push('(d.created_at < ? OR (d.created_at = ? AND d.id < ?))');
      params.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    params.push(limit + 1);
    const modern = await this.tableExists('resource_dependencies');
    const table = modern ? 'resource_dependencies' : 'resource_version_dependencies';
    const rows = await this.rowsFrom(table,
      `SELECT d.*, d.created_at AS v2_sort_at, CASE WHEN target.is_public = 1 AND target.deleted_at IS NULL AND target.status IN ('approved','published') THEN target.public_id ELSE NULL END AS target_public_id FROM ${table} d LEFT JOIN resources target ON target.id = d.target_resource_id WHERE ${clauses.join(' AND ')} ORDER BY d.sort_order ASC, d.created_at DESC, d.id DESC LIMIT ?`, params);
    return this.pageFromRows(rows, query, row => ({
      dependency_type: String(row.dependency_type || 'required'),
      resource_public_id: this.isUuid(row.target_public_id) ? String(row.target_public_id) : null,
      external_identifier: row.external_identifier || null,
      upstream_url: row.upstream_url || null,
      version_constraint: row.version_constraint || null,
      resolution_status: row.resolution_status || null,
      sort_order: this.numberValue(row.sort_order),
    } satisfies ResourceV2DependencyDto));
  }

  async resolveDependencies(publicId: string, query: ResourceV2DependencyResolveQueryDto): Promise<ResourceV2DependencyResolutionDto> {
    const { entity } = await this.getPublicResource(publicId, 'mod');
    const rootVersion = await this.selectedVersion(entity, query.version_public_id);
    if (!rootVersion) return this.notFound();
    const profileRows = await this.rowsFrom(
      'mod_profiles',
      'SELECT mod_id FROM mod_profiles WHERE resource_id = ? LIMIT 1',
      [entity.id],
    );
    const rootModId = String(profileRows[0]?.mod_id || '');
    if (!rootModId) return this.notFound();

    const maxDepth = Math.min(12, Math.max(1, this.numberValue(query.max_depth, 12)));
    const maxNodes = Math.min(200, Math.max(1, this.numberValue(query.max_nodes, 200)));
    const dependencyTable = await this.tableExists('resource_dependencies')
      ? 'resource_dependencies'
      : 'resource_version_dependencies';
    const rootDependencies = await this.loadModDependencies([this.numberValue(rootVersion.id)], dependencyTable);
    const root: ModRelease = {
      mod_id: rootModId,
      title: String(entity.title || rootModId),
      version: String(rootVersion.version || rootVersion.version_name || ''),
      dependencies: rootDependencies.get(this.numberValue(rootVersion.id)) || [],
    };
    const catalog = new Map<string, ModRelease>();
    const aliases = new Map<string, string>();
    let frontier = [...new Set(root.dependencies.map(dependency => dependency.mod_id))];
    let nodesLoaded = 0;
    let dependencyRowsTruncated = Boolean((rootDependencies as Map<number, ModDependency[]> & { truncated?: boolean }).truncated);
    let truncated = dependencyRowsTruncated;
    const visitedIdentifiers = new Set<string>([rootModId]);

    for (let depth = 1; frontier.length && depth < maxDepth; depth += 1) {
      const unique = frontier.filter(identifier => !visitedIdentifiers.has(identifier));
      if (!unique.length) break;
      const batch = unique.slice(0, Math.max(0, maxNodes - nodesLoaded));
      if (batch.length < unique.length) truncated = true;
      if (!batch.length) { truncated = true; break; }
      batch.forEach(identifier => visitedIdentifiers.add(identifier));
      nodesLoaded += batch.length;

      const matched = await this.findPublicModsByIdentifiers(batch);
      for (const item of matched) {
        if (item.requested_identifier) aliases.set(item.requested_identifier, item.mod_id);
      }
      const resourceIds = [...new Set(matched.map(item => this.numberValue(item.resource_id)))];
      if (!resourceIds.length) { frontier = []; continue; }
      const versions = await this.latestPublicModVersions(resourceIds);
      const versionIds = versions.map(item => this.numberValue(item.id));
      const dependencyMap = await this.loadModDependencies(versionIds, dependencyTable);
      if ((dependencyMap as Map<number, ModDependency[]> & { truncated?: boolean }).truncated) {
        dependencyRowsTruncated = true;
        truncated = true;
      }
      const byResource = new Map(versions.map(item => [this.numberValue(item.resource_id), item]));
      for (const item of matched) {
        const version = byResource.get(this.numberValue(item.resource_id));
        if (!version) continue;
        const modId = String(item.mod_id);
        const release: ModRelease = {
          mod_id: modId,
          title: String(item.title || modId),
          version: String(version.version || version.version_name || ''),
          dependencies: dependencyMap.get(this.numberValue(version.id)) || [],
        };
        catalog.set(modId, release);
        catalog.set(String(item.requested_identifier || modId), release);
      }
      frontier = [...new Set(matched.flatMap(item => {
        const version = byResource.get(this.numberValue(item.resource_id));
        return version ? (dependencyMap.get(this.numberValue(version.id)) || []).map(dependency => dependency.mod_id) : [];
      }))];
    }

    const normalize = (release: ModRelease): ModRelease => ({
      ...release,
      dependencies: release.dependencies.map(dependency => ({
        ...dependency,
        mod_id: aliases.get(dependency.mod_id) || dependency.mod_id,
      })),
    });
    const normalizedRoot = normalize(root);
    const normalizedCatalog = new Map<string, ModRelease>();
    for (const [key, release] of catalog) normalizedCatalog.set(aliases.get(key) || key, normalize(release));
    const resolution = resolveModDependencies(normalizedRoot, normalizedCatalog, { max_depth: maxDepth, max_nodes: maxNodes });
    if (dependencyRowsTruncated && !resolution.warnings.includes('dependency_count_limit_reached')) resolution.warnings.push('dependency_count_limit_reached');
    if (truncated && !resolution.warnings.includes('resolver_limit_reached')) resolution.warnings.push('resolver_limit_reached');
    resolution.truncated = resolution.truncated || truncated;
    return resolution;
  }

  private async findPublicModsByIdentifiers(identifiers: string[]): Promise<Array<DbRow & { requested_identifier: string; mod_id: string }>> {
    if (!identifiers.length) return [];
    const placeholders = identifiers.map(() => '?').join(',');
    const rows = await this.rowsFrom(
      'mod_profiles',
      `SELECT r.id AS resource_id, r.public_id, r.title, m.mod_id, COALESCE(a.alias, m.mod_id) AS requested_identifier
       FROM mod_profiles m JOIN resources r ON r.id = m.resource_id
       LEFT JOIN mod_id_aliases a ON a.resource_id = r.id AND a.alias IN (${placeholders})
       WHERE r.is_public = 1 AND r.deleted_at IS NULL AND r.status IN ('approved','published')
       AND (m.mod_id IN (${placeholders}) OR a.alias IS NOT NULL)`,
      [...identifiers, ...identifiers],
    );
    return rows.filter(row => this.isUuid(row.public_id)).map(row => ({
      ...row,
      resource_id: this.numberValue(row.resource_id),
      mod_id: String(row.mod_id),
      requested_identifier: String(row.requested_identifier || row.mod_id),
    }));
  }

  private async latestPublicModVersions(resourceIds: number[]): Promise<DbRow[]> {
    if (!resourceIds.length) return [];
    const placeholders = resourceIds.map(() => '?').join(',');
    const rows = await this.rows(
      `SELECT v.* FROM resource_versions v JOIN resources r ON r.id = v.resource_id
       WHERE v.resource_id IN (${placeholders}) AND v.status = 'published' AND v.public_id IS NOT NULL
       AND r.is_public = 1 AND r.deleted_at IS NULL AND r.status IN ('approved','published')
       ORDER BY v.resource_id ASC, v.recommended DESC, COALESCE(v.published_at, v.created_at) DESC, v.revision DESC, v.id DESC`,
      resourceIds,
    );
    const selected = new Map<number, DbRow>();
    for (const row of rows) {
      const resourceId = this.numberValue(row.resource_id);
      if (!selected.has(resourceId) && this.isUuid(row.public_id)) selected.set(resourceId, row);
    }
    return [...selected.values()];
  }

  private async loadModDependencies(versionIds: number[], table: string): Promise<Map<number, ModDependency[]> & { truncated?: boolean }> {
    if (!versionIds.length || !await this.tableExists(table)) return new Map();
    const placeholders = versionIds.map(() => '?').join(',');
    const upstreamUrl = table === 'resource_dependencies' ? 'd.upstream_url' : 'NULL AS upstream_url';
    const rows = await this.rows(
      `SELECT d.resource_version_id, d.dependency_type, d.external_identifier, ${upstreamUrl}, d.version_constraint,
              m.mod_id AS target_mod_id
       FROM ${table} d
       LEFT JOIN resources r ON r.id = d.target_resource_id AND r.is_public = 1 AND r.deleted_at IS NULL AND r.status IN ('approved','published')
       LEFT JOIN mod_profiles m ON m.resource_id = r.id
       WHERE d.resource_version_id IN (${placeholders}) ORDER BY d.sort_order ASC, d.id ASC LIMIT 5000`,
      versionIds,
    );
    const mapped = new Map<number, ModDependency[]>();
    (mapped as Map<number, ModDependency[]> & { truncated?: boolean }).truncated = rows.length >= 5000;
    for (const row of rows) {
      const versionId = this.numberValue(row.resource_version_id);
      const dependency: ModDependency = {
        mod_id: String(row.target_mod_id || row.external_identifier || ''),
        kind: ['required', 'optional', 'incompatible', 'embedded'].includes(String(row.dependency_type))
          ? row.dependency_type
          : 'required',
        version_constraint: row.version_constraint || null,
        upstream_url: row.upstream_url || null,
      };
      if (!dependency.mod_id) continue;
      const list = mapped.get(versionId) || [];
      list.push(dependency);
      mapped.set(versionId, list);
    }
    return mapped;
  }

  async getCompatibility(publicId: string, kind: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, kind);
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return { items: [], reports: [] };
    const compatibilities = await this.collectCompatibility([this.numberValue(version.id)]);
    if (kind !== 'mod') return { items: compatibilities.get(this.numberValue(version.id)) || [], reports: [] };
    const reportRows = await this.rowsFrom(
      'mod_compatibility_reports',
      `SELECT public_id, status, game_version, platform_key, runtime, body, author_response, resource_version_id FROM mod_compatibility_reports WHERE resource_id = ? AND resource_version_id = ? AND status IN (${PUBLIC_REPORT_STATUSES.map(() => '?').join(',')}) ORDER BY created_at DESC, id DESC LIMIT 100`,
      [entity.id, version.id, ...PUBLIC_REPORT_STATUSES],
    );
    const versionIds = reportRows.map(row => this.numberValue(row.resource_version_id));
    const versionRows = versionIds.length ? await this.rows(
      `SELECT id, public_id FROM resource_versions WHERE id IN (${versionIds.map(() => '?').join(',')})`, versionIds,
    ) : [];
    const versionPublicIds = new Map(versionRows.map(row => [this.numberValue(row.id), this.isUuid(row.public_id) ? String(row.public_id) : null]));
    return {
      items: compatibilities.get(this.numberValue(version.id)) || [],
      reports: reportRows.filter(row => this.isUuid(row.public_id)).map((row): ResourceV2ModCompatibilityReportDto => ({
        public_id: String(row.public_id),
        status: String(row.status || 'unknown'),
        version_public_id: versionPublicIds.get(this.numberValue(row.resource_version_id)) || null,
        game_version: row.game_version || null,
        platform: row.platform_key || null,
        runtime: row.runtime || null,
        body: row.body || null,
        author_response: row.author_response || null,
      })),
    };
  }

  async getConflicts(publicId: string, query: ResourceV2PageQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'mod');
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['member.resource_id = ?', `report.status IN (${PUBLIC_CONFLICT_STATUSES.map(() => '?').join(',')})`, 'report.public_id IS NOT NULL'];
    const parameters: unknown[] = [entity.id, ...PUBLIC_CONFLICT_STATUSES];
    if (cursor) {
      clauses.push('(report.created_at < ? OR (report.created_at = ? AND report.id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom(
      'mod_conflict_reports',
      `SELECT DISTINCT report.id, report.public_id, report.status, report.title, report.body, report.author_response, report.created_at AS v2_sort_at FROM mod_conflict_reports report JOIN mod_conflict_members member ON member.conflict_report_id = report.id WHERE ${clauses.join(' AND ')} ORDER BY report.created_at DESC, report.id DESC LIMIT ?`,
      parameters,
    );
    const page = this.pageFromRows(rows.filter(row => this.isUuid(row.public_id)), query, row => row);
    const items = await Promise.all(page.items.map(async (row): Promise<ResourceV2ConflictDto> => {
      const members = await this.rowsFrom(
        'mod_conflict_members',
        `SELECT r.public_id, r.title, r.resource_kind FROM mod_conflict_members member JOIN resources r ON r.id = member.resource_id WHERE member.conflict_report_id = ? AND r.is_public = 1 AND r.deleted_at IS NULL AND r.status IN ('approved','published') AND r.public_id IS NOT NULL ORDER BY member.id ASC`,
        [row.id],
      );
      return {
        public_id: String(row.public_id),
        status: String(row.status || 'unverified'),
        title: row.title || null,
        body: row.body || null,
        members: members.map(member => ({
          public_id: this.isUuid(member.public_id) ? String(member.public_id) : '',
          title: String(member.title || ''),
          resource_kind: String(member.resource_kind || 'other'),
        })),
        author_response: row.author_response || null,
      };
    }));
    return { ...page, items };
  }

  async getIssueReports(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'mod');
    let versionId: number | null = null;
    if (query.version_public_id) {
      const version = await this.selectedVersion(entity, query.version_public_id);
      if (!version) return this.emptyPage(query);
      versionId = this.numberValue(version.id);
    }
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['report.resource_id = ?', 'report.public_id IS NOT NULL', "report.status NOT IN ('hidden','deleted','removed')", "version.status = 'published'", 'version.public_id IS NOT NULL'];
    const parameters: unknown[] = [entity.id];
    if (versionId !== null) { clauses.push('report.resource_version_id = ?'); parameters.push(versionId); }
    if (cursor) {
      clauses.push('(report.created_at < ? OR (report.created_at = ? AND report.id < ?))');
      parameters.push(cursor.sort_at, cursor.sort_at, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom(
      'mod_issue_reports',
      `SELECT report.id, report.public_id, report.status, report.title, report.body,
              report.author_response_status, report.author_response, report.created_at AS v2_sort_at,
              version.public_id AS version_public_id, fixed.public_id AS fixed_version_public_id
       FROM mod_issue_reports report
       JOIN resource_versions version ON version.id = report.resource_version_id
       LEFT JOIN resource_versions fixed ON fixed.id = report.fixed_resource_version_id
       WHERE ${clauses.join(' AND ')} ORDER BY report.created_at DESC, report.id DESC LIMIT ?`,
      parameters,
    );
    return this.pageFromRows(rows.filter(row => this.isUuid(row.public_id) && this.isUuid(row.version_public_id)), query, (row): ResourceV2IssueReportDto => ({
      public_id: String(row.public_id),
      version_public_id: String(row.version_public_id),
      status: String(row.status || 'open'),
      title: String(row.title || ''),
      body: String(row.body || ''),
      author_response_status: row.author_response_status || null,
      author_response: row.author_response || null,
      fixed_version_public_id: this.isUuid(row.fixed_version_public_id) ? String(row.fixed_version_public_id) : null,
      created_at: this.iso(row.v2_sort_at) || new Date(0).toISOString(),
    }));
  }

  private async analysisData(versionId: number, kind: string): Promise<Record<string, unknown> | null> {
    if (kind === 'mod') {
      const [metadata, contents, localizations] = await Promise.all([
        this.rowsFrom('mod_version_metadata', 'SELECT parsed_manifest_json, author_overrides_json FROM mod_version_metadata WHERE resource_version_id = ? LIMIT 1', [versionId]),
        this.rowsFrom('mod_contents', 'SELECT COUNT(*) AS total FROM mod_contents WHERE resource_version_id = ?', [versionId]),
        this.rowsFrom('mod_localizations', 'SELECT COUNT(*) AS total FROM mod_localizations WHERE resource_version_id = ?', [versionId]),
      ]);
      if (!metadata[0] && !contents.length && !localizations.length) return null;
      return {
        manifest: this.safePublicJson(metadata[0]?.parsed_manifest_json, null),
        author_overrides: this.safePublicJson(metadata[0]?.author_overrides_json, null),
        indexed_content_count: this.numberValue(contents[0]?.total),
        localization_count: this.numberValue(localizations[0]?.total),
      };
    }
    if (kind === 'schematic') {
      const rows = await this.rowsFrom('schematic_analyses', 'SELECT complete, available, estimated, production_json, bottlenecks_json, warnings_json FROM schematic_analyses WHERE resource_version_id = ? LIMIT 1', [versionId]);
      const row = rows[0];
      return row ? {
        complete: Number(row.complete) === 1, available: Number(row.available) === 1,
        estimated: Number(row.estimated) !== 0,
        production: this.safePublicJson(row.production_json, null),
        bottlenecks: this.safePublicJson(row.bottlenecks_json, []),
        warnings: this.safePublicJson(row.warnings_json, []),
      } : null;
    }
    if (kind === 'map') {
      const [rows, waveRows] = await Promise.all([
        this.rowsFrom('map_analyses', 'SELECT difficulty_confidence, estimated_difficulty, resource_balance_json, path_analysis_json, warnings_json FROM map_analyses WHERE resource_version_id = ? LIMIT 1', [versionId]),
        this.rowsFrom('map_wave_summaries', 'SELECT wave_start, wave_end, enemy_count, estimated_health, air_ratio, boss_count, strength, is_spike FROM map_wave_summaries WHERE resource_version_id = ? ORDER BY wave_start ASC, id ASC LIMIT 500', [versionId]),
      ]);
      const row = rows[0];
      if (!row && waveRows.length === 0) return null;
      return {
        estimated: true, difficulty_confidence: row?.difficulty_confidence || 'estimated',
        estimated_difficulty: this.nullableNumber(row?.estimated_difficulty),
        resource_balance: this.safePublicJson(row?.resource_balance_json, null),
        path_analysis: this.safePublicJson(row?.path_analysis_json, null),
        warnings: this.safePublicJson(row?.warnings_json, []),
        waves: waveRows.map(wave => ({
          wave_start: this.numberValue(wave.wave_start), wave_end: this.numberValue(wave.wave_end),
          enemy_count: this.nullableNumber(wave.enemy_count), estimated_health: this.nullableNumber(wave.estimated_health),
          air_ratio: this.nullableNumber(wave.air_ratio), boss_count: this.numberValue(wave.boss_count),
          strength: this.nullableNumber(wave.strength), is_spike: Number(wave.is_spike) === 1,
        })),
      };
    }
    return null;
  }

  private severity(value: unknown): 'ERROR' | 'WARNING' | 'INFO' {
    const normalized = String(value || '').toUpperCase();
    return normalized === 'ERROR' || normalized === 'WARNING' ? normalized : 'INFO';
  }

  private async analysisFor(resource: Resource, version: DbRow, kind: string): Promise<ResourceV2AnalysisDto | null> {
    const rows = await this.rowsFrom('resource_analysis_runs',
      'SELECT * FROM resource_analysis_runs WHERE resource_id = ? AND resource_version_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [resource.id, version.id]);
    const row = rows[0];
    const data = await this.analysisData(this.numberValue(version.id), kind);
    if (!row && data == null) return null;
    const rawFindings = this.arrayValue(row?.findings_json);
    const keys = rawFindings.map((finding: any, index) => String(finding?.key || finding?.finding_key || finding?.code || `finding-${index + 1}`));
    const overrides = row && keys.length ? await this.rowsFrom('resource_analysis_overrides',
      `SELECT o.finding_key, o.reason, o.created_at, u.username AS actor FROM resource_analysis_overrides o LEFT JOIN users u ON u.id = o.actor_user_id WHERE o.analysis_run_id = ? AND o.finding_key IN (${keys.map(() => '?').join(',')})`,
      [row.id, ...keys]) : [];
    const byKey = new Map(overrides.map(item => [String(item.finding_key), item]));
    const findings: ResourceV2AnalysisFindingDto[] = rawFindings.map((finding: any, index): ResourceV2AnalysisFindingDto => {
      const key = keys[index];
      const override = byKey.get(key);
      return {
        key, severity: this.severity(finding?.severity),
        message: String(finding?.message || finding?.description || finding?.code || key),
        field_path: typeof finding?.field_path === 'string' ? finding.field_path : typeof finding?.path === 'string' ? finding.path : null,
        ignored: Boolean(override), ignore_reason: override?.reason || null,
        actor: override?.actor || null, timestamp: this.iso(override?.created_at),
      };
    });
    return {
      kind: ['mod', 'schematic', 'map'].includes(kind) ? kind : 'mod',
      status: String(row?.status || 'completed'), parser_version: row?.parser_version || null,
      started_at: this.iso(row?.started_at), completed_at: this.iso(row?.completed_at),
      summary: this.safePublicJson(row?.summary_json, null), findings, data,
    };
  }

  async getAnalysis(publicId: string, kind: 'mod' | 'schematic' | 'map', query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, kind);
    const version = await this.selectedVersion(entity, query.version_public_id);
    return { analysis: version ? await this.analysisFor(entity, version, kind) : null };
  }

  async getSchematicBlocks(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'schematic');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) { clauses.push('(created_at < ? OR (created_at = ? AND id < ?))'); parameters.push(cursor.sort_at, cursor.sort_at, cursor.id); }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom('schematic_blocks', `SELECT *, created_at AS v2_sort_at FROM schematic_blocks WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, parameters);
    return this.pageFromRows(rows, query, row => {
      const positions = this.safePublicJson(this.arrayValue(row.positions_json), []);
      const first = positions[0] as any;
      return {
        internal_name: String(row.internal_name || ''), display_name: row.display_name || null,
        count: this.numberValue(row.count), x: this.nullableNumber(first?.x), y: this.nullableNumber(first?.y),
        rotation: this.nullableNumber(first?.rotation), team: this.nullableNumber(first?.team), positions,
        properties: this.safePublicJson(row.properties_json, {}) || {},
      };
    });
  }

  async getSchematicMaterials(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'schematic');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) { clauses.push('(created_at < ? OR (created_at = ? AND id < ?))'); parameters.push(cursor.sort_at, cursor.sort_at, cursor.id); }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom('schematic_materials', `SELECT *, created_at AS v2_sort_at FROM schematic_materials WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, parameters);
    return this.pageFromRows(rows, query, row => ({ internal_name: String(row.internal_name || ''), amount: this.numberValue(row.amount), display_name: null }));
  }

  async getSchematicLogic(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'schematic');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) { clauses.push('(created_at < ? OR (created_at = ? AND id < ?))'); parameters.push(cursor.sort_at, cursor.sort_at, cursor.id); }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom('schematic_logic_processors', `SELECT *, created_at AS v2_sort_at FROM schematic_logic_processors WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, parameters);
    const metadataRows = await this.rowsFrom('schematic_version_metadata', 'SELECT source_renderer_metadata_json FROM schematic_version_metadata WHERE resource_version_id = ? LIMIT 1', [version.id]);
    const renderer = this.objectValue(metadataRows[0]?.source_renderer_metadata_json) || {};
    const inertConfigByPosition = new Map<string, { source: string | null; source_available: boolean; links: unknown[] }>();
    for (const raw of this.arrayValue(renderer.block_positions)) {
      const position = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const x = this.nullableNumber(position.x);
      const y = this.nullableNumber(position.y);
      const config = this.objectValue(position.config);
      if (x === null || y === null || !config) continue;
      const source = config.format_version === 1 && typeof config.source === 'string' && config.source.length <= 32_768 && !config.source.includes('\0')
        ? config.source : null;
      inertConfigByPosition.set(`${x}:${y}`, {
        source,
        source_available: source !== null && position.logic_source_available === true,
        links: this.safePublicJson(this.arrayValue(config.links), []),
      });
    }
    return this.pageFromRows(rows, query, row => {
      const x = this.nullableNumber(row.position_x);
      const y = this.nullableNumber(row.position_y);
      const config = x === null || y === null ? undefined : inertConfigByPosition.get(`${x}:${y}`);
      return {
        x, y, processor_type: row.processor_type || 'unknown',
        links: config?.links ?? this.safePublicJson(this.arrayValue(row.links_json), []),
        logic_source: config?.source ?? null,
        logic_source_available: config?.source_available ?? false,
        variables: Object.entries(this.safePublicJson(this.objectValue(row.variables_json) || {}, {})).map(([name, value]) => ({ name, value })),
      };
    });
  }

  async getSchematicProduction(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'schematic');
    const version = await this.selectedVersion(entity, query.version_public_id);
    const rows = version ? await this.rowsFrom('schematic_analyses', 'SELECT available, estimated, production_json, bottlenecks_json, warnings_json FROM schematic_analyses WHERE resource_version_id = ? LIMIT 1', [version.id]) : [];
    const row = rows[0];
    return {
      available: Boolean(row && Number(row.available) === 1),
      production: row ? {
        ...this.safePublicJson(this.objectValue(row.production_json) || {}, {}),
        estimated: Number(row.estimated) !== 0,
        bottlenecks: this.safePublicJson(this.arrayValue(row.bottlenecks_json), []),
        warnings: this.safePublicJson(this.arrayValue(row.warnings_json), []),
      } : null,
    };
  }

  async getMapRules(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'map');
    const version = await this.selectedVersion(entity, query.version_public_id);
    const rows = version ? await this.rowsFrom(
      'map_version_metadata',
      'SELECT width,height,rules_json,source_renderer_metadata_json FROM map_version_metadata WHERE resource_version_id = ? LIMIT 1',
      [version.id],
    ) : [];
    const row = rows[0];
    const renderer = this.objectValue(row?.source_renderer_metadata_json) || {};
    return {
      version_public_id: version?.public_id || null,
      width: this.nullableNumber(row?.width),
      height: this.nullableNumber(row?.height),
      rules: this.safePublicJson(this.objectValue(row?.rules_json), null),
      tile_layers: this.safePublicJson(this.objectValue(renderer.tile_layers), {}),
      tile_layers_truncated: renderer.tile_layers_truncated === true,
    };
  }

  async getMapResources(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'map');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) { clauses.push('(created_at < ? OR (created_at = ? AND id < ?))'); parameters.push(cursor.sort_at, cursor.sort_at, cursor.id); }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom('map_resource_entries', `SELECT *, created_at AS v2_sort_at FROM map_resource_entries WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, parameters);
    return this.pageFromRows(rows, query, row => ({
      resource_type: String(row.resource_type || ''), internal_name: String(row.internal_name || ''),
      amount: this.nullableNumber(row.amount) || 0,
      distribution: this.safePublicJson(this.objectValue(row.distribution_json), null),
    }));
  }

  async getMapWaves(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'map');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) {
      const waveStart = Number(cursor.sort_at);
      if (!Number.isSafeInteger(waveStart)) return this.invalidCursor();
      clauses.push('(wave_start > ? OR (wave_start = ? AND id > ?))');
      parameters.push(waveStart, waveStart, cursor.id);
    }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom('map_wave_summaries', `SELECT *, wave_start AS v2_sort_at FROM map_wave_summaries WHERE ${clauses.join(' AND ')} ORDER BY wave_start ASC, id ASC LIMIT ?`, parameters);
    return this.pageFromRows(rows, query, row => ({
      wave_start: this.numberValue(row.wave_start), wave_end: this.numberValue(row.wave_end),
      enemy_count: this.nullableNumber(row.enemy_count), estimated_health: this.nullableNumber(row.estimated_health),
      air_ratio: this.nullableNumber(row.air_ratio), boss_count: this.numberValue(row.boss_count),
      strength: this.nullableNumber(row.strength), is_spike: Number(row.is_spike) === 1,
    }));
  }

  async getMapSpawns(publicId: string, query: ResourceV2VersionQueryDto) {
    const { entity } = await this.getPublicResource(publicId, 'map');
    const version = await this.selectedVersion(entity, query.version_public_id);
    if (!version) return this.emptyPage(query);
    const limit = this.pageLimit(query);
    const cursor = this.decodeCursor(query.cursor);
    const clauses = ['resource_version_id = ?'];
    const parameters: unknown[] = [version.id];
    if (cursor) { clauses.push('(created_at < ? OR (created_at = ? AND id < ?))'); parameters.push(cursor.sort_at, cursor.sort_at, cursor.id); }
    parameters.push(limit + 1);
    const rows = await this.rowsFrom('map_spawns', `SELECT *, created_at AS v2_sort_at FROM map_spawns WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, parameters);
    return this.pageFromRows(rows, query, row => ({
      spawn_type: String(row.spawn_type || 'player'), team: row.team == null ? null : String(row.team),
      x: this.numberValue(row.x), y: this.numberValue(row.y), wave: this.nullableNumber(row.wave),
    }));
  }

  async getDiff(publicId: string, kind: 'mod' | 'schematic' | 'map', query: ResourceV2DiffQueryDto): Promise<ResourceV2DiffDto> {
    const { entity } = await this.getPublicResource(publicId, kind);
    const toVersion = await this.selectedVersion(entity, query.to_version_public_id);
    if (!toVersion) return { from_version_public_id: null, to_version_public_id: null, status: 'unavailable', parser_version: null, diff: null };
    let fromVersion: DbRow | null = null;
    if (query.from_version_public_id) fromVersion = await this.selectedVersion(entity, query.from_version_public_id);
    else {
      const timestamp = this.iso(toVersion.published_at || toVersion.created_at) || '';
      const previous = await this.rows(
        "SELECT * FROM resource_versions WHERE resource_id = ? AND status = 'published' AND public_id IS NOT NULL AND (COALESCE(published_at, created_at) < ? OR (COALESCE(published_at, created_at) = ? AND id < ?)) ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 1",
        [entity.id, timestamp, timestamp, toVersion.id],
      );
        fromVersion = previous[0] && this.isUuid(previous[0].public_id) ? previous[0] : null;
    }
    if (!fromVersion || this.numberValue(fromVersion.id) === this.numberValue(toVersion.id)) {
      return { from_version_public_id: fromVersion?.public_id || null, to_version_public_id: String(toVersion.public_id), status: 'unavailable', parser_version: null, diff: null };
    }
    const rows = await this.rowsFrom(
      'resource_version_diffs',
      'SELECT diff_json, parser_version, status FROM resource_version_diffs WHERE resource_id = ? AND from_version_id = ? AND to_version_id = ? LIMIT 1',
      [entity.id, fromVersion.id, toVersion.id],
    );
    const row = rows[0];
    return {
      from_version_public_id: String(fromVersion.public_id), to_version_public_id: String(toVersion.public_id),
      status: String(row?.status || 'unavailable'), parser_version: row?.parser_version || null,
      diff: row ? this.safePublicJson(this.objectValue(row.diff_json), null) : null,
    };
  }
}
