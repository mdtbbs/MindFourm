import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourcePackItem } from '@entities/resource-pack-item.entity';
import { ModProfile, ModVersionMetadata } from '@entities/mod-resource-v2.entity';
import { MultiplayerSessionMod } from '@entities/multiplayer-session-mod.entity';
import { PUBLIC_RESOURCE_STATUSES } from '@common/utils/constants';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';
import {
  publicSelectedVersionIdSql, publicTargetVisibleSql, resolvePublicCanonicalModIds,
} from '../resources/resource-mod-dependency-filter';
import {
  MAX_SESSION_MODS, ModResolutionStatus, SessionModView, SessionPackSummary, deriveUnresolvedReason, normalizeSha256,
} from './mod-sync-plan';

/** 建房时房主可提交的单个 Mod。字段与 DTO 对齐，避免服务层依赖控制器类型。 */
export type SessionModInput = {
  mod_id: string;
  display_name?: string;
  version?: string;
  sha256?: string;
  required?: boolean;
};

/** 建房时可直接引用一个已发布的 Pack 版本。 */
export type ModPackRefInput = {
  pack_public_id: string;
  version_public_id?: string;
};

export type ResolvedSessionMod = {
  mod_id: string;
  display_name: string | null;
  version: string | null;
  sha256: string | null;
  required: boolean;
  resolution_status: ModResolutionStatus;
  resource_id: number | null;
  resource_public_id: string | null;
  resource_version_id: number | null;
  resource_version_public_id: string | null;
  file_id: number | null;
  file_public_id: string | null;
  file_size_bytes: number | null;
  /** 下载授权写入 DownloadEvent 的 backend 字段；不落 session_mods。 */
  delivery_mode: string | null;
};

export type ResolvedSessionMods = {
  pack_version_id: number | null;
  pack: SessionPackSummary | null;
  mods: ResolvedSessionMod[];
};

type CatalogRow = {
  mod_id: string;
  profile_display_name: string | null;
  resource_id: number;
  resource_public_id: string;
  resource_title: string;
  version_id: number;
  version_public_id: string;
  version_label: string;
  meta_display_name: string | null;
  meta_version: string | null;
  file_id: number;
  file_public_id: string;
  file_hash: string;
  file_size_bytes: string | number | null;
  delivery_mode: string | null;
};

const INVALID_MODS_MESSAGE = '联机模组清单无效';

/**
 * 会话模组目录解析。
 *
 * 所有解析都只读公开资源：`(is_public, status, visibility, deleted_at,
 * merged_into_resource_id, 分类启用)` 与公开资源列表完全一致。未过审、隔离、
 * 已删除、已合并或分类停用的资源不会被解析成可下载条目，更不会写入
 * `file_public_id`。定级规则：
 *
 * - `catalog_verified`：公开 Mod 的当前推荐已发布版本有可用 SHA-256 主文件，
 *   且房主上报的 SHA-256 与之完全一致；
 * - `catalog_version_mismatch`：目录命中但房主哈希不同（绝不下发目录文件）；
 * - `unlisted_local`：未收录、缺哈希、或目录缺少可用主文件。
 */
@Injectable()
export class MultiplayerModCatalogService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceVersion) private readonly versions: Repository<ResourceVersion>,
    @InjectRepository(ResourceFile) private readonly files: Repository<ResourceFile>,
    @InjectRepository(ResourcePackItem) private readonly packItems: Repository<ResourcePackItem>,
    @InjectRepository(ModProfile) private readonly profiles: Repository<ModProfile>,
    @InjectRepository(ModVersionMetadata) private readonly metadata: Repository<ModVersionMetadata>,
    @InjectRepository(MultiplayerSessionMod) private readonly sessionMods: Repository<MultiplayerSessionMod>,
  ) {}

  /** 建房入口：Pack 引用与显式 Mod 清单互斥，由调用方保证只传一个。 */
  async resolveForCreate(input: { mod_pack_ref?: ModPackRefInput; mods?: SessionModInput[] }): Promise<ResolvedSessionMods> {
    if (input.mod_pack_ref) return this.resolvePackRef(input.mod_pack_ref);
    const mods = await this.resolveModList(input.mods || []);
    return { pack_version_id: null, pack: null, mods };
  }

  /**
   * 按 `mod_id`（含公开别名）解析显式清单。别名与规范名指向同一 Mod 时只保留
   * 第一条；重复项直接拒绝，避免同一房间出现两个互相矛盾的版本。
   */
  private async resolveModList(inputs: SessionModInput[]): Promise<ResolvedSessionMod[]> {
    if (inputs.length > MAX_SESSION_MODS) invalidMods(`最多允许 ${MAX_SESSION_MODS} 个 Mod`);
    const normalized = inputs.map((input) => ({
      input,
      modId: String(input.mod_id || '').trim(),
      sha256: normalizeSha256(input.sha256),
    })).filter((entry) => entry.modId.length > 0);
    if (normalized.length !== inputs.length) invalidMods('每个 Mod 都必须提供 mod_id');

    const tokens = [...new Set(normalized.map((entry) => entry.modId.toLowerCase()))];
    const canonicalByToken = await resolvePublicCanonicalModIds(this.dataSource, tokens);
    const canonicalIds = [...new Set(canonicalByToken.values())];
    const catalog = canonicalIds.length ? await this.loadCatalogRows(canonicalIds) : new Map<string, CatalogRow>();

    const resolved = normalized.map(({ input, modId, sha256 }) => {
      const canonical = canonicalByToken.get(modId.toLowerCase());
      const row = canonical ? catalog.get(canonical.toLowerCase()) : undefined;
      return this.classify(input, modId, canonical || modId, sha256, row);
    });
    this.assertNoDuplicates(resolved);
    return resolved;
  }

  private classify(
    input: SessionModInput,
    reportedModId: string,
    modId: string,
    reportedSha256: string | null,
    row: CatalogRow | undefined,
  ): ResolvedSessionMod {
    const displayName = cleanText(input.display_name, 255)
      || row?.meta_display_name
      || row?.profile_display_name
      || row?.resource_title
      || null;
    const version = cleanText(input.version, 100) || row?.meta_version || row?.version_label || null;
    const required = input.required !== false;
    const base = {
      mod_id: modId.slice(0, 191),
      display_name: displayName,
      version,
      sha256: reportedSha256,
      required,
      resource_id: row?.resource_id ?? null,
      resource_public_id: row?.resource_public_id ?? null,
      resource_version_id: row?.version_id ?? null,
      resource_version_public_id: row?.version_public_id ?? null,
      file_id: null as number | null,
      file_public_id: null as string | null,
      file_size_bytes: null as number | null,
      delivery_mode: null as string | null,
    };

    if (!row) {
      // 未收录 / 私密 / 未过审 / 已合并：只保留房主上报信息，绝不暴露目录身份。
      return { ...base, resource_id: null, resource_public_id: null, resource_version_id: null,
        resource_version_public_id: null, sha256: reportedSha256, resolution_status: 'unlisted_local' };
    }
    if (!reportedSha256) {
      // 目录命中但房主没给哈希：无法证明房主运行的是这份文件。
      return { ...base, sha256: null, file_public_id: row.file_public_id, file_size_bytes: sizeOf(row.file_size_bytes),
        delivery_mode: row.delivery_mode, resolution_status: 'unlisted_local' };
    }
    if (reportedSha256 !== row.file_hash) {
      // 哈希不一致：保留目录身份供客户端展示，但不保存文件 ID，避免被当成可下载项。
      return { ...base, file_public_id: null, resolution_status: 'catalog_version_mismatch' };
    }
    return {
      ...base,
      sha256: row.file_hash,
      file_id: row.file_id,
      file_public_id: row.file_public_id,
      file_size_bytes: sizeOf(row.file_size_bytes),
      delivery_mode: row.delivery_mode,
      resolution_status: 'catalog_verified',
    };
  }

  /** 公开目录批量读取：每个 Mod 只取当前推荐已发布版本的第一份 SHA-256 主文件。 */
  private async loadCatalogRows(canonicalIds: string[]): Promise<Map<string, CatalogRow>> {
    const placeholders = canonicalIds.map(() => '?').join(',');
    const rows: CatalogRow[] = await this.dataSource.query(
      `SELECT profile.mod_id AS mod_id,
              profile.display_name AS profile_display_name,
              resource.id AS resource_id,
              resource.public_id AS resource_public_id,
              resource.title AS resource_title,
              version.id AS version_id,
              version.public_id AS version_public_id,
              version.version AS version_label,
              meta.display_name AS meta_display_name,
              meta.version AS meta_version,
              file.id AS file_id,
              file.public_id AS file_public_id,
              file.content_hash AS file_hash,
              file.size_bytes AS file_size_bytes,
              file.delivery_mode AS delivery_mode
         FROM mod_profiles profile
         JOIN resources resource ON resource.id = profile.resource_id
         JOIN resource_versions version ON version.id = ${publicSelectedVersionIdSql('resource')}
         LEFT JOIN mod_version_metadata meta ON meta.resource_version_id = version.id
         JOIN resource_files file ON file.id = (
           SELECT f.id FROM resource_files f
            WHERE f.resource_version_id = version.id
              AND f.role = 'primary'
              AND f.availability_status = 'available'
              AND LOWER(f.hash_algorithm) = 'sha256'
              AND f.content_hash IS NOT NULL
            ORDER BY f.sort_order ASC, f.id ASC
            LIMIT 1
         )
        WHERE profile.mod_id IN (${placeholders})
          AND resource.resource_kind = 'mod'
          AND ${publicTargetVisibleSql('resource')}
          AND (resource.file_path IS NULL OR resource.file_path NOT LIKE '%.quarantine%')
          AND (version.file_path IS NULL OR version.file_path NOT LIKE '%.quarantine%')
          AND (resource.category_id IS NULL OR EXISTS (
            SELECT 1 FROM resource_categories category
             WHERE category.id = resource.category_id AND category.is_active = 1
          ))`,
      canonicalIds,
    );
    const map = new Map<string, CatalogRow>();
    for (const row of rows) {
      const hash = String(row.file_hash || '').toLowerCase();
      // 目录里的主文件必须是完整 SHA-256；否则该 Mod 无法被校验，按未收录处理。
      if (!row.mod_id || !/^[a-f0-9]{64}$/.test(hash)) continue;
      map.set(String(row.mod_id).toLowerCase(), { ...row, file_hash: hash });
    }
    return map;
  }

  /** 解析 Pack 引用：只接受公开发布的 Pack 版本，成员逐项重新校验可见性。 */
  private async resolvePackRef(ref: ModPackRefInput): Promise<ResolvedSessionMods> {
    const packPublicId = String(ref.pack_public_id || '').trim();
    const pack = packPublicId
      ? await this.resources.findOne({ where: { public_id: packPublicId }, withDeleted: true })
      : null;
    await this.assertPublicPack(pack);

    let packVersion: ResourceVersion | null = null;
    const versionPublicId = cleanText(ref.version_public_id, 36);
    if (versionPublicId) {
      packVersion = await this.versions.findOne({
        where: { public_id: versionPublicId, resource_id: pack!.id, status: 'published' },
      });
    } else {
      const selected: Array<{ id: number }> = await this.dataSource.query(
        `SELECT ${publicSelectedVersionIdSql('resource')} AS id FROM resources resource WHERE resource.id = ?`,
        [pack!.id],
      );
      const selectedId = Number(selected?.[0]?.id);
      if (Number.isInteger(selectedId) && selectedId > 0) {
        packVersion = await this.versions.findOneBy({ id: selectedId, status: 'published' });
      }
    }
    if (!packVersion || !packVersion.public_id) invalidMods('Pack 版本不存在或尚未发布');

    const memberships = await this.packItems.find({
      where: { pack_version_id: packVersion.id },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    const memberVersionIds = [...new Set(memberships.map((item) => Number(item.member_resource_version_id)))];
    const memberVersions = memberVersionIds.length
      ? await this.versions.find({ where: { id: In(memberVersionIds), status: 'published' } })
      : [];
    const versionById = new Map(memberVersions.map((version) => [Number(version.id), version]));
    if (memberVersionIds.some((id) => !versionById.has(id))) invalidMods('Pack 清单包含不可用的固定版本');

    const resources = memberVersions.length
      ? await this.resources.find({ where: { id: In([...new Set(memberVersions.map((version) => Number(version.resource_id)))]) }, withDeleted: true })
      : [];
    const resourceById = new Map(resources.map((resource) => [Number(resource.id), resource]));
    const modMembers = memberVersions.flatMap((version) => {
      const resource = resourceById.get(Number(version.resource_id));
      if (!resource) invalidMods('Pack 清单包含不可见资源');
      return resource!.resource_kind === 'mod' ? [{ version, resource: resource! }] : [];
    });

    const modResourceIds = [...new Set(modMembers.map(({ resource }) => Number(resource.id)))];
    const profiles = modResourceIds.length
      ? await this.profiles.find({ where: { resource_id: In(modResourceIds) } })
      : [];
    const profileByResource = new Map(profiles.map((profile) => [Number(profile.resource_id), profile]));
    const modVersionIds = modMembers.map(({ version }) => Number(version.id));
    const metadataRows = modVersionIds.length
      ? await this.metadata.find({ where: { resource_version_id: In(modVersionIds) } })
      : [];
    const metadataByVersion = new Map(metadataRows.map((row) => [Number(row.resource_version_id), row]));
    const primaryFiles = modVersionIds.length
      ? await this.files.find({
          where: { resource_version_id: In(modVersionIds), role: 'primary', availability_status: 'available' },
          order: { sort_order: 'ASC', id: 'ASC' },
        })
      : [];
    const fileByVersion = new Map<number, ResourceFile>();
    for (const file of primaryFiles) {
      const hash = String(file.content_hash || '').toLowerCase();
      if (fileByVersion.has(Number(file.resource_version_id))) continue;
      if (!file.public_id || !/^[a-f0-9]{64}$/.test(hash) || (file.hash_algorithm || '').toLowerCase() !== 'sha256') continue;
      fileByVersion.set(Number(file.resource_version_id), file);
    }

    const mods: ResolvedSessionMod[] = [];
    for (const { version, resource } of modMembers) {
      if (!isPublicResource(resource)) invalidMods('Pack 包含不可见的 Mod 资源');
      const profile = profileByResource.get(Number(resource.id));
      const meta = metadataByVersion.get(Number(version.id));
      const file = fileByVersion.get(Number(version.id));
      const displayName = cleanText(meta?.display_name, 255)
        || cleanText(profile?.display_name, 255)
        || cleanText(resource.title, 255)
        || null;
      const versionLabel = cleanText(meta?.version, 100) || cleanText(version.version, 100) || null;
      if (!profile?.mod_id) {
        // Pack 里的 Mod 缺少目录身份：保留展示信息，但不可自动同步。
        mods.push({
          mod_id: (cleanText(resource.title, 191) || `pack-member-${resource.id}`).slice(0, 191),
          display_name: displayName, version: versionLabel, sha256: null, required: true,
          resolution_status: 'unlisted_local', resource_id: null, resource_public_id: null,
          resource_version_id: null, resource_version_public_id: null,
          file_id: null, file_public_id: null, file_size_bytes: null, delivery_mode: null,
        });
        continue;
      }
      const hash = file ? String(file.content_hash || '').toLowerCase() : null;
      // 未过审/隔离文件的版本路径也可能带着已发布的元数据；绝不进入可下载清单。
      if (hasQuarantinedPath(version.file_path) || hasQuarantinedPath(resource.file_path)) {
        mods.push({
          mod_id: String(profile.mod_id).slice(0, 191), display_name: displayName, version: versionLabel,
          sha256: null, required: true, resolution_status: 'unlisted_local',
          resource_id: Number(resource.id), resource_public_id: resource.public_id,
          resource_version_id: Number(version.id), resource_version_public_id: version.public_id,
          file_id: null, file_public_id: null, file_size_bytes: null, delivery_mode: null,
        });
        continue;
      }
      if (!file || !hash) {
        mods.push({
          mod_id: String(profile.mod_id).slice(0, 191), display_name: displayName, version: versionLabel,
          sha256: null, required: true, resolution_status: 'unlisted_local',
          resource_id: Number(resource.id), resource_public_id: resource.public_id,
          resource_version_id: Number(version.id), resource_version_public_id: version.public_id,
          file_id: null, file_public_id: null, file_size_bytes: null, delivery_mode: null,
        });
        continue;
      }
      mods.push({
        mod_id: String(profile.mod_id).slice(0, 191), display_name: displayName, version: versionLabel,
        sha256: hash, required: true, resolution_status: 'catalog_verified',
        resource_id: Number(resource.id), resource_public_id: resource.public_id,
        resource_version_id: Number(version.id), resource_version_public_id: version.public_id,
        file_id: Number(file.id), file_public_id: file.public_id,
        file_size_bytes: sizeOf(file.size_bytes ?? version.file_size),
        delivery_mode: file.delivery_mode || null,
      });
    }
    this.assertNoDuplicates(mods);
    return {
      pack_version_id: Number(packVersion.id),
      pack: { public_id: pack!.public_id!, version_public_id: packVersion.public_id, title: pack!.title },
      mods,
    };
  }

  private async assertPublicPack(pack: Resource | null): Promise<void> {
    if (!pack || !isPublicResource(pack) || pack.resource_kind !== 'pack') invalidMods('Pack 不存在或不可见');
    if (pack!.category_id) {
      const rows: Array<{ is_active?: unknown }> = await this.dataSource.query(
        'SELECT is_active FROM resource_categories WHERE id = ? LIMIT 1',
        [pack!.category_id],
      );
      if (!rows.length || Number(rows[0].is_active) !== 1) invalidMods('Pack 不存在或不可见');
    }
  }

  private assertNoDuplicates(mods: ResolvedSessionMod[]): void {
    const seen = new Set<string>();
    for (const mod of mods) {
      const key = mod.mod_id.toLowerCase();
      if (seen.has(key)) invalidMods(`Mod 清单包含重复项：${mod.mod_id}`);
      seen.add(key);
    }
  }

  /** 会话列表/详情批量读取；没有对应行的会话不返回任何内容。 */
  async findSessionMods(sessionIds: string[]): Promise<Map<string, MultiplayerSessionMod[]>> {
    const grouped = new Map<string, MultiplayerSessionMod[]>();
    if (!sessionIds.length) return grouped;
    const rows = await this.sessionMods.find({
      where: { session_id: In(sessionIds) },
      order: { mod_id: 'ASC', id: 'ASC' },
    });
    for (const row of rows) {
      const list = grouped.get(row.session_id) || [];
      list.push(row);
      grouped.set(row.session_id, list);
    }
    return grouped;
  }

  /** 会话创建事务内的批量写入。 */
  async saveSessionMods(manager: EntityManager, sessionId: string, mods: ResolvedSessionMod[]): Promise<void> {
    if (!mods.length) return;
    await manager.insert(MultiplayerSessionMod, mods.map((mod) => manager.create(MultiplayerSessionMod, {
      session_id: sessionId,
      mod_id: mod.mod_id,
      display_name: mod.display_name,
      version: mod.version,
      sha256: mod.sha256,
      required: mod.required,
      resolution_status: mod.resolution_status,
      resource_id: mod.resource_id,
      resource_public_id: mod.resource_public_id,
      resource_version_id: mod.resource_version_id,
      resource_version_public_id: mod.resource_version_public_id,
      file_public_id: mod.file_public_id,
      file_size_bytes: mod.file_size_bytes,
    })));
  }

  /** Pack 版本 → 公开摘要；Pack 下架或转私有时不再对外展示。 */
  async packSummaries(versionIds: Array<number | null>): Promise<Map<number, SessionPackSummary>> {
    const ids = [...new Set(versionIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0).map(Number))];
    const result = new Map<number, SessionPackSummary>();
    if (!ids.length) return result;
    const versions = await this.versions.find({ where: { id: In(ids), status: 'published' } });
    const resources = versions.length
      ? await this.resources.find({ where: { id: In([...new Set(versions.map((version) => Number(version.resource_id)))]) }, withDeleted: true })
      : [];
    const resourceById = new Map(resources.map((resource) => [Number(resource.id), resource]));
    for (const version of versions) {
      const resource = resourceById.get(Number(version.resource_id));
      if (!resource || !version.public_id || !isPublicResource(resource) || resource.resource_kind !== 'pack') continue;
      result.set(Number(version.id), {
        public_id: resource.public_id!,
        version_public_id: version.public_id,
        title: resource.title,
      });
    }
    return result;
  }

  /** 实体行 → 纯计算层视图；同时推导不可同步的具体原因。 */
  toView(row: MultiplayerSessionMod): SessionModView {
    return this.buildView({
      mod_id: row.mod_id, display_name: row.display_name, version: row.version, sha256: row.sha256,
      required: row.required === true, resolution_status: row.resolution_status,
      resource_id: row.resource_id, resource_public_id: row.resource_public_id,
      resource_version_public_id: row.resource_version_public_id, file_public_id: row.file_public_id,
      file_size_bytes: sizeOf(row.file_size_bytes),
    });
  }

  /** 建房响应直接使用解析结果，避免为了拼摘要再查一次数据库。 */
  viewOfResolved(mod: ResolvedSessionMod): SessionModView {
    return this.buildView(mod);
  }

  private buildView(input: {
    mod_id: string; display_name: string | null; version: string | null; sha256: string | null;
    required: boolean; resolution_status: ModResolutionStatus;
    resource_id?: number | null; resource_public_id: string | null;
    resource_version_public_id: string | null; file_public_id: string | null;
    file_size_bytes: number | null;
  }): SessionModView {
    return {
      mod_id: input.mod_id,
      display_name: input.display_name,
      version: input.version,
      sha256: input.sha256,
      required: input.required === true,
      resolution_status: input.resolution_status,
      resource_public_id: input.resource_public_id,
      resource_version_public_id: input.resource_version_public_id,
      file_public_id: input.file_public_id,
      file_size_bytes: input.file_size_bytes,
      unresolved_reason: deriveUnresolvedReason({
        resolution_status: input.resolution_status,
        resource_id: input.resource_id,
        file_public_id: input.file_public_id,
        sha256: input.sha256,
      }),
    };
  }

  /**
   * 下载授权需要文件的内部整数 ID 与交付方式，但会话表按设计只保存
   * `file_public_id`（公开身份）。这里按公开 ID 批量回查，避免同步计划逐项查库。
   */
  async fileGrantInfo(filePublicIds: string[]): Promise<Map<string, { fileId: number; deliveryMode: string | null }>> {
    const ids = [...new Set(filePublicIds.filter((id) => typeof id === 'string' && id.length > 0))];
    const result = new Map<string, { fileId: number; deliveryMode: string | null }>();
    if (!ids.length) return result;
    const rows = await this.files.find({ where: { public_id: In(ids) } });
    for (const file of rows) {
      result.set(file.public_id, { fileId: Number(file.id), deliveryMode: file.delivery_mode || null });
    }
    return result;
  }
}

function invalidMods(message: string): never {
  throw new ApiV1Exception('SESSION_MODS_INVALID', HttpStatus.BAD_REQUEST, message, false);
}

function isPublicResource(resource: Resource): boolean {
  return Number(resource.is_public) === 1
    && PUBLIC_RESOURCE_STATUSES.includes(resource.status as any)
    && (!resource.visibility || resource.visibility === 'public')
    && resource.merged_into_resource_id == null
    && !!resource.public_id
    && !resource.deleted_at
    && !hasQuarantinedPath(resource.file_path);
}

function hasQuarantinedPath(value: unknown): boolean {
  return typeof value === 'string' && /[\\/]\.quarantine[\\/]/.test(value);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function sizeOf(value: unknown): number | null {
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : null;
}
