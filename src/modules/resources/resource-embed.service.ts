import { Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  extractTiptapText,
  renderTiptapDocument,
  type ResourceEmbedProjection,
} from '@common/utils/tiptap-content.util';

export const RESOURCE_EMBED_KINDS = ['schematic', 'map', 'mod', 'pack'] as const;
export const RESOURCE_EMBED_MAX_PER_DOCUMENT = 10;

export type ResourceEmbedStatus = 'available' | 'pending_review' | 'unavailable';

export type ResourceEmbedCard = {
  resource_public_id: string;
  version_public_id: string | null;
  status: ResourceEmbedStatus;
  resource_kind: (typeof RESOURCE_EMBED_KINDS)[number] | null;
  title: string | null;
  summary: string | null;
  url: string | null;
  preview_url: string | null;
  download_url: string | null;
  author: { id: number; username: string; avatar_url: string | null } | null;
  version: string | null;
  schematic: null | {
    width: number | null;
    height: number | null;
    block_count: number | null;
    top_materials: Array<{ internal_name: string; amount: number }>;
    power: null | { production: number | null; consumption: number | null; net: number | null; estimated: true };
    has_logic: boolean;
    logic_processor_count: number;
  };
  map: null | {
    width: number | null;
    height: number | null;
    game_mode: string | null;
    planet: string | null;
    wave_count: number | null;
    estimated_difficulty: number | null;
  };
  reason: string | null;
};

export type ResourceEmbedDocumentProjection = {
  content_html: string;
  content_text: string;
  embeds: ResourceEmbedCard[];
};

type Viewer = { id?: number | null; role?: string | null } | null | undefined;
type EmbedReference = { resourcePublicId: string; versionPublicId: string | null };
type ResourceRow = {
  id: number; public_id: string; title: string; summary: string | null; resource_kind: string | null;
  status: string; is_public: number; visibility: string | null; deleted_at: Date | null;
  merged_into_resource_id: number | null; user_id: number; latest_published_version_id: number | null;
  renderer_status: string | null; username: string | null; avatar_url: string | null;
};
type VersionRow = {
  id: number; public_id: string; resource_id: number; version: string | null; status: string;
  published_at: Date | null; revision: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_STATUSES = new Set(['approved', 'published']);
const OWNER_VISIBLE_STATUSES = new Set(['draft', 'pending', 'pending_review', 'upload_pending', 'approved', 'published']);

/**
 * 富文本资源卡片的批量水合。
 *
 * 约束：
 * - 一次读取所有引用资源、版本、类型元数据和文件绑定，绝不按卡片逐个查询。
 * - 私有/审核中/拒绝/删除资源只返回 `unavailable` 占位，不泄漏标题或预览。
 * - 作者与管理员可在编辑器中看到自己的 `pending_review` 预览态。
 */
@Injectable()
export class ResourceEmbedService {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  static collectReferences(document: unknown): EmbedReference[] {
    const references: EmbedReference[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const node = value as Record<string, any>;
      if (node.type === 'resourceEmbed') {
        const resourcePublicId = node.attrs?.resourcePublicId;
        if (typeof resourcePublicId === 'string' && UUID_RE.test(resourcePublicId)) {
          const versionPublicId = typeof node.attrs?.versionPublicId === 'string' && UUID_RE.test(node.attrs.versionPublicId)
            ? node.attrs.versionPublicId : null;
          if (references.length < RESOURCE_EMBED_MAX_PER_DOCUMENT * 20) references.push({ resourcePublicId, versionPublicId });
        }
      }
      for (const child of Array.isArray(node.content) ? node.content : []) visit(child);
    };
    visit(document);
    return references;
  }

  /** 读取单篇文档的卡片并生成带标题的 HTML/纯文本投影。 */
  async hydrateDocument(document: unknown, viewer?: Viewer): Promise<ResourceEmbedDocumentProjection | null> {
    if (!document || typeof document !== 'object') return null;
    const references = ResourceEmbedService.collectReferences(document);
    if (!references.length) return null;
    const cards = await this.getCards(references.map((reference) => reference.resourcePublicId), viewer, this.versionHints(references));
    const byId = new Map(cards.map((card) => [card.resource_public_id, card]));
    const projection: ResourceEmbedProjection = {};
    for (const card of cards) projection[card.resource_public_id] = { title: card.title, kind: card.resource_kind, status: card.status };
    const ordered = [...new Set(references.map((reference) => reference.resourcePublicId))]
      .map((id) => byId.get(id))
      .filter((card): card is ResourceEmbedCard => Boolean(card));
    return {
      content_html: renderTiptapDocument(document, { schemaVersion: 2, resourceEmbeds: projection }),
      content_text: extractTiptapText(document, projection),
      embeds: ordered,
    };
  }

  /** 批量水合多篇文档：跨文档只发一次卡片查询，保证回复列表零 N+1。 */
  async hydrateMany(documents: unknown[], viewer?: Viewer): Promise<Array<ResourceEmbedDocumentProjection | null>> {
    const references = documents.map((document) => ResourceEmbedService.collectReferences(document));
    if (!references.some((items) => items.length)) return documents.map(() => null);
    const cards = await this.getCards(
      references.flatMap((items) => items.map((item) => item.resourcePublicId)),
      viewer,
      this.versionHints(references.flat()),
    );
    const byId = new Map(cards.map((card) => [card.resource_public_id, card]));
    return documents.map((document, index) => {
      if (!references[index].length || !document || typeof document !== 'object') return null;
      const projection: ResourceEmbedProjection = {};
      for (const reference of references[index]) {
        const card = byId.get(reference.resourcePublicId);
        if (card) projection[card.resource_public_id] = { title: card.title, kind: card.resource_kind, status: card.status };
      }
      const embeds = [...new Set(references[index].map((reference) => reference.resourcePublicId))]
        .map((id) => byId.get(id))
        .filter((card): card is ResourceEmbedCard => Boolean(card));
      return {
        content_html: renderTiptapDocument(document, { schemaVersion: 2, resourceEmbeds: projection }),
        content_text: extractTiptapText(document, projection),
        embeds,
      };
    });
  }

  /** 文档节点里的版本提示：同一资源出现多次时以第一个非空提示为准。 */
  private versionHints(references: EmbedReference[]): Record<string, string | null> {
    const hints: Record<string, string | null> = {};
    for (const reference of references) {
      const key = reference.resourcePublicId.toLowerCase();
      if (!(key in hints) && reference.versionPublicId) hints[key] = reference.versionPublicId;
    }
    return hints;
  }

  /** 批量读取卡片；输入按 public UUID 去重，最多 50 个。 */
  async getCards(ids: string[], viewer?: Viewer, versionHints: Record<string, string | null> = {}): Promise<ResourceEmbedCard[]> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && UUID_RE.test(id)))].slice(0, 50);
    if (!unique.length) return [];
    const executor = this.dataSource;
    if (!executor) return unique.map((id) => this.unavailable(id, null, 'not_found'));
    const placeholders = unique.map(() => '?').join(',');
    const resourceRows = await executor.query(
      `SELECT r.id,r.public_id,r.title,r.summary,r.resource_kind,r.status,r.is_public,r.visibility,
              r.deleted_at,r.merged_into_resource_id,r.user_id,r.latest_published_version_id,r.renderer_status,
              u.username,u.avatar_url
       FROM resources r LEFT JOIN users u ON u.id=r.user_id
       WHERE r.public_id IN (${placeholders})`,
      unique,
    ) as ResourceRow[];
    const byPublicId = new Map(resourceRows.map((row) => [String(row.public_id).toLowerCase(), row]));

    const membershipResourceIds = await this.membershipResourceIds(resourceRows, viewer);
    const versionRows = resourceRows.length ? await executor.query(
      `SELECT id,public_id,resource_id,version,status,published_at,revision FROM resource_versions
       WHERE resource_id IN (${resourceRows.map(() => '?').join(',')}) AND public_id IS NOT NULL
       ORDER BY recommended DESC, COALESCE(published_at,created_at) DESC, revision DESC, id DESC`,
      resourceRows.map((row) => row.id),
    ) as VersionRow[] : [];
    const versionsByResource = new Map<number, VersionRow[]>();
    for (const version of versionRows) versionsByResource.set(Number(version.resource_id), [...(versionsByResource.get(Number(version.resource_id)) || []), version]);

    const cards = unique.map((id) => {
      const row = byPublicId.get(id.toLowerCase());
      if (!row) return this.unavailable(id, null, 'not_found');
      return this.buildCard(row, versionsByResource.get(Number(row.id)) || [], viewer, membershipResourceIds.has(Number(row.id)), versionHints[id.toLowerCase()] || null);
    });

    await this.enrichKindData(cards, versionsByResource);
    return cards;
  }

  private async membershipResourceIds(rows: ResourceRow[], viewer?: Viewer): Promise<Set<number>> {
    const userId = Number(viewer?.id);
    if (!Number.isSafeInteger(userId) || userId < 1 || !rows.length) return new Set();
    const resourceIds = rows.filter((row) => Number(row.user_id) !== userId).map((row) => Number(row.id));
    if (!resourceIds.length) return new Set();
    const memberships = await this.dataSource!.query(
      `SELECT resource_id FROM resource_members WHERE user_id=? AND status='active'
       AND resource_id IN (${resourceIds.map(() => '?').join(',')})`,
      [userId, ...resourceIds],
    ) as Array<{ resource_id: number }>;
    return new Set(memberships.map((row) => Number(row.resource_id)));
  }

  private buildCard(row: ResourceRow, versions: VersionRow[], viewer: Viewer, isMember: boolean, requestedVersionPublicId: string | null = null): ResourceEmbedCard {
    const kind = RESOURCE_EMBED_KINDS.includes(String(row.resource_kind) as any)
      ? String(row.resource_kind) as ResourceEmbedCard['resource_kind'] : null;
    if (!kind) return this.unavailable(String(row.public_id), null, 'unsupported_kind');
    if (row.deleted_at || row.merged_into_resource_id) return this.unavailable(String(row.public_id), null, 'deleted');

    const isPublic = PUBLIC_STATUSES.has(String(row.status)) && Number(row.is_public) === 1
      && row.visibility !== 'private';
    const userId = Number(viewer?.id);
    const role = String(viewer?.role || '').toLowerCase();
    const canPreview = Boolean((Number.isSafeInteger(userId) && userId === Number(row.user_id)) || isMember || ['admin', 'moderator'].includes(role));
    if (!isPublic && !canPreview) return this.unavailable(String(row.public_id), null, 'not_public');
    if (!isPublic && !OWNER_VISIBLE_STATUSES.has(String(row.status))) return this.unavailable(String(row.public_id), null, 'rejected');

    const published = versions.find((version) => version.status === 'published');
    const requested = requestedVersionPublicId
      ? versions.find((version) => version.public_id === requestedVersionPublicId && (!isPublic || version.status === 'published'))
      : null;
    const selected = requested || (isPublic ? published : (versions[0] || published));
    const version = selected || null;
    const versionPublicId = version && UUID_RE.test(String(version.public_id)) ? String(version.public_id) : null;
    const status: ResourceEmbedStatus = isPublic ? 'available' : 'pending_review';
    return {
      resource_public_id: String(row.public_id),
      version_public_id: versionPublicId,
      status,
      resource_kind: kind,
      title: String(row.title || '').slice(0, 300) || null,
      summary: row.summary == null ? null : String(row.summary).slice(0, 500),
      url: `/resources/${row.public_id}`,
      preview_url: isPublic && versionPublicId
        ? `/api/v1/resources/${row.public_id}/versions/${versionPublicId}/preview`
        : null,
      download_url: null,
      author: row.username == null ? null : {
        id: Number(row.user_id), username: String(row.username), avatar_url: row.avatar_url || null,
      },
      version: version?.version == null ? null : String(version.version),
      schematic: null,
      map: null,
      reason: status === 'pending_review' ? 'pending_review' : null,
    };
  }

  private unavailable(resourcePublicId: string, versionPublicId: string | null, reason: string): ResourceEmbedCard {
    return {
      resource_public_id: resourcePublicId, version_public_id: versionPublicId, status: 'unavailable',
      resource_kind: null, title: null, summary: null, url: null, preview_url: null, download_url: null,
      author: null, version: null, schematic: null, map: null, reason,
    };
  }

  /** 一次批量补齐类型元数据、材料、电力、波次与可下载文件。 */
  private async enrichKindData(cards: ResourceEmbedCard[], versionsByResource: Map<number, VersionRow[]>): Promise<void> {
    const visible = cards.filter((card) => card.status !== 'unavailable' && card.version_public_id);
    if (!visible.length || !this.dataSource) return;
    const versionIds: number[] = [];
    for (const card of visible) {
      const version = (versionsByResource.get(this.resourceIdFor(card, versionsByResource)) || [])
        .find((row) => row.public_id === card.version_public_id);
      if (version) versionIds.push(Number(version.id));
    }
    if (!versionIds.length) return;
    const placeholders = versionIds.map(() => '?').join(',');
    const hasSchematic = visible.some((card) => card.resource_kind === 'schematic');
    const hasMap = visible.some((card) => card.resource_kind === 'map');
    const none: Promise<Array<Record<string, any>>> = Promise.resolve([]);
    const [schematics, materials, analyses, logicCounts, maps, mapAnalyses, waveCounts, files] = await Promise.all([
      hasSchematic ? this.dataSource.query(`SELECT resource_version_id,width,height,block_count FROM schematic_version_metadata WHERE resource_version_id IN (${placeholders})`, versionIds) as Promise<Array<Record<string, any>>> : none,
      hasSchematic ? this.dataSource.query(`SELECT resource_version_id,internal_name,amount FROM schematic_materials WHERE resource_version_id IN (${placeholders}) ORDER BY amount DESC, internal_name ASC`, versionIds) as Promise<Array<Record<string, any>>> : none,
      hasSchematic ? this.dataSource.query(`SELECT resource_version_id,production_json FROM schematic_analyses WHERE resource_version_id IN (${placeholders})`, versionIds) as Promise<Array<Record<string, any>>> : none,
      hasSchematic ? this.dataSource.query(`SELECT resource_version_id,COUNT(*) AS count FROM schematic_logic_processors WHERE resource_version_id IN (${placeholders}) GROUP BY resource_version_id`, versionIds) as Promise<Array<Record<string, any>>> : none,
      hasMap ? this.dataSource.query(`SELECT resource_version_id,width,height,game_mode,planet FROM map_version_metadata WHERE resource_version_id IN (${placeholders})`, versionIds) as Promise<Array<Record<string, any>>> : none,
      hasMap ? this.dataSource.query(`SELECT resource_version_id,estimated_difficulty FROM map_analyses WHERE resource_version_id IN (${placeholders})`, versionIds) as Promise<Array<Record<string, any>>> : none,
      hasMap ? this.dataSource.query(`SELECT resource_version_id,COUNT(*) AS count FROM map_wave_summaries WHERE resource_version_id IN (${placeholders}) GROUP BY resource_version_id`, versionIds) as Promise<Array<Record<string, any>>> : none,
      this.dataSource.query(`SELECT resource_version_id,public_id,availability_status FROM resource_files WHERE resource_version_id IN (${placeholders}) AND public_id IS NOT NULL ORDER BY sort_order ASC,id ASC`, versionIds) as Promise<Array<Record<string, any>>>,
    ]);
    const byVersion = <T extends Record<string, any>>(rows: T[]) => new Map(rows.map((row) => [Number(row.resource_version_id), row]));
    const schematicMap = byVersion(schematics);
    const analysisMap = byVersion(analyses);
    const logicMap = byVersion(logicCounts);
    const mapMap = byVersion(maps);
    const mapAnalysisMap = byVersion(mapAnalyses);
    const waveMap = byVersion(waveCounts);
    const materialMap = new Map<number, Array<Record<string, any>>>();
    for (const row of materials) materialMap.set(Number(row.resource_version_id), [...(materialMap.get(Number(row.resource_version_id)) || []), row]);
    const fileMap = new Map<number, Array<Record<string, any>>>();
    for (const row of files) fileMap.set(Number(row.resource_version_id), [...(fileMap.get(Number(row.resource_version_id)) || []), row]);

    for (const card of visible) {
      const version = (versionsByResource.get(this.resourceIdFor(card, versionsByResource)) || [])
        .find((row) => row.public_id === card.version_public_id);
      if (!version) continue;
      const versionId = Number(version.id);
      if (card.resource_kind === 'schematic') {
        const metadata = schematicMap.get(versionId) || {};
        const production = this.parseJson(analysisMap.get(versionId)?.production_json);
        const power = production && typeof production.power === 'object' ? production.power as Record<string, unknown> : null;
        card.schematic = {
          width: this.nullableNumber(metadata.width), height: this.nullableNumber(metadata.height),
          block_count: this.nullableNumber(metadata.block_count),
          top_materials: (materialMap.get(versionId) || []).slice(0, 4).map((row) => ({
            internal_name: String(row.internal_name), amount: Number(row.amount) || 0,
          })),
          power: power ? {
            production: this.nullableNumber(power.generated), consumption: this.nullableNumber(power.consumed),
            net: this.nullableNumber(power.net), estimated: true,
          } : null,
          has_logic: Number(logicMap.get(versionId)?.count || 0) > 0,
          logic_processor_count: Number(logicMap.get(versionId)?.count || 0),
        };
      } else if (card.resource_kind === 'map') {
        const metadata = mapMap.get(versionId) || {};
        card.map = {
          width: this.nullableNumber(metadata.width), height: this.nullableNumber(metadata.height),
          game_mode: metadata.game_mode == null ? null : String(metadata.game_mode),
          planet: metadata.planet == null ? null : String(metadata.planet),
          wave_count: this.nullableNumber(waveMap.get(versionId)?.count),
          estimated_difficulty: this.nullableNumber(mapAnalysisMap.get(versionId)?.estimated_difficulty),
        };
      }
      const file = (fileMap.get(versionId) || []).find((row) => row.availability_status === 'available');
      if (file) {
        card.download_url = `/api/v1/resources/${card.resource_public_id}/versions/${card.version_public_id}/files/${file.public_id}/download`;
      }
    }
  }

  /** 版本行按资源分组，卡片只带 public UUID，所以从分组里反查资源 id。 */
  private resourceIdFor(card: ResourceEmbedCard, versionsByResource: Map<number, VersionRow[]>): number {
    for (const [resourceId, versions] of versionsByResource) {
      if (versions.some((version) => version.public_id === card.version_public_id)) return resourceId;
    }
    return 0;
  }

  private parseJson(value: unknown): Record<string, any> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
    } catch { return null; }
  }

  private nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
