/**
 * 模组房同步计划的纯计算层。
 *
 * 这里不碰数据库、不读配置、不发下载授权：输入是「房主清单的服务端定级」与
 * 「客户端本地已安装清单」，输出是客户端弹窗要展示的分组与动作。把这段逻辑
 * 独立出来，是为了让 fail-closed 的判定（哪些能自动下发、哪些必须手动获取、
 * 哪些纯客户端辅助 Mod 默认保留）可以被单测逐条钉死。
 */

export type ModResolutionStatus = 'catalog_verified' | 'catalog_version_mismatch' | 'unlisted_local';

export type ModUnresolvedReason =
  | 'not_in_catalog'
  | 'sha256_missing'
  | 'catalog_file_unavailable'
  | 'catalog_version_mismatch';

/** 客户端上报的一个本地 Mod；`enabled` 缺省视为已启用。 */
export type InstalledModInput = {
  mod_id: string;
  version?: string;
  sha256?: string;
  enabled?: boolean;
  client_only?: boolean;
};

export type NormalizedInstalledMod = {
  mod_id: string;
  version: string | null;
  sha256: string | null;
  enabled: boolean;
  client_only: boolean;
};

/** 服务端保存的房主 Mod 视图（只含可公开字段）。 */
export type SessionModView = {
  mod_id: string;
  display_name: string | null;
  version: string | null;
  sha256: string | null;
  required: boolean;
  resolution_status: ModResolutionStatus;
  resource_public_id: string | null;
  resource_version_public_id: string | null;
  file_public_id: string | null;
  file_size_bytes: number | null;
  unresolved_reason: ModUnresolvedReason | null;
};

export type SessionPackSummary = {
  public_id: string;
  version_public_id: string;
  title: string;
};

export type SessionModSummary = {
  modded: boolean;
  mod_count: number;
  syncable_count: number;
  pack: SessionPackSummary | null;
  mods: Array<{
    mod_id: string;
    display_name: string | null;
    version: string | null;
    syncable: boolean;
    resolution_status: ModResolutionStatus;
  }>;
  mods_truncated: boolean;
};

export type ModDownloadPlanItem = {
  mod_id: string;
  display_name: string | null;
  version: string | null;
  sha256: string;
  size_bytes: number | null;
  resource_public_id: string | null;
  resource_version_public_id: string | null;
  file_public_id: string | null;
  /** missing：本地没有；hash_mismatch：本地有但哈希不同；unverified：本地未提供哈希。 */
  reason: 'missing' | 'hash_mismatch' | 'unverified';
};

export type ModEnablePlanItem = {
  mod_id: string;
  display_name: string | null;
  version: string | null;
  sha256: string;
  size_bytes: number | null;
  resource_public_id: string | null;
  resource_version_public_id: string | null;
  file_public_id: string | null;
};

export type ModLocalPlanItem = {
  mod_id: string;
  display_name: string | null;
  version: string | null;
  sha256: string | null;
};

export type ModUnresolvedPlanItem = {
  mod_id: string;
  display_name: string | null;
  version: string | null;
  sha256: string | null;
  reason: ModUnresolvedReason;
  resolution_status: ModResolutionStatus;
  resource_public_id: string | null;
  resource_version_public_id: string | null;
};

export type ModSyncPlan = {
  status: 'ready' | 'sync_required' | 'partial_sync_required';
  to_download: ModDownloadPlanItem[];
  to_enable: ModEnablePlanItem[];
  to_disable: ModLocalPlanItem[];
  preserved_client_mods: ModLocalPlanItem[];
  unresolved: ModUnresolvedPlanItem[];
};

/** 建房 `mods[]` 上限；与设计文档一致。 */
export const MAX_SESSION_MODS = 64;
/** 同步计划请求里本地清单上限，允许比房主清单更大以覆盖本地额外 Mod。 */
export const MAX_INSTALLED_MODS = 128;
/** 大厅列表每页最多返回的模组摘要条数；完整清单走单会话读取。 */
export const MOD_SUMMARY_LIST_LIMIT = 8;

/**
 * 内置的纯客户端辅助 Mod：即使客户端没有显式标记 `client_only`，也默认保留、
 * 不因房主清单缺少它们而被禁用。它们不参与多人内容校验，禁用只会破坏玩家的
 * 社区功能（论坛登录、联机大厅、画质/汉化等）。
 */
export const BUILTIN_CLIENT_ONLY_MOD_IDS: ReadonlySet<string> = new Set(['mdtbbsaddon', 'lanlink']);

/**
 * 由持久化字段推导「为什么不能自动同步」。保持与实体列一一对应，避免为了展示
 * 原因额外增加一列，也保证老数据不需要回填。
 */
export function deriveUnresolvedReason(input: {
  resolution_status: ModResolutionStatus;
  resource_id?: number | null;
  file_public_id?: string | null;
  sha256?: string | null;
}): ModUnresolvedReason | null {
  if (input.resolution_status === 'catalog_version_mismatch') return 'catalog_version_mismatch';
  if (input.resolution_status !== 'unlisted_local') return null;
  if (input.resource_id == null) return 'not_in_catalog';
  if (!input.file_public_id) return 'catalog_file_unavailable';
  if (!input.sha256) return 'sha256_missing';
  return 'not_in_catalog';
}

export function normalizeModId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const sha = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(sha) ? sha : null;
}

/**
 * 规范化本地清单：去空、去重（重复项单独返回给调用方决定拒绝还是忽略）。
 * `enabled` 缺省为 true，`client_only` 缺省为 false。
 */
export function normalizeInstalledMods(input: InstalledModInput[] | undefined): {
  mods: NormalizedInstalledMod[];
  duplicates: string[];
} {
  const mods: NormalizedInstalledMod[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const raw of input || []) {
    const modId = typeof raw?.mod_id === 'string' ? raw.mod_id.trim() : '';
    if (!modId) continue;
    const key = modId.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(key);
      continue;
    }
    seen.add(key);
    mods.push({
      mod_id: modId,
      version: typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim().slice(0, 64) : null,
      sha256: normalizeSha256(raw.sha256),
      enabled: raw.enabled !== false,
      client_only: raw.client_only === true,
    });
  }
  return { mods, duplicates };
}

function isClientOnly(mod: NormalizedInstalledMod): boolean {
  return mod.client_only || BUILTIN_CLIENT_ONLY_MOD_IDS.has(normalizeModId(mod.mod_id));
}

function compareModId(a: { mod_id: string }, b: { mod_id: string }): number {
  return normalizeModId(a.mod_id).localeCompare(normalizeModId(b.mod_id));
}

/**
 * 计算同步计划。
 *
 * 规则（与 D11 对齐）：
 * - 只有 `catalog_verified` 且 SHA-256 与本地一致的 Mod 才算已同步；
 * - 本地有同哈希但未启用 → `to_enable`；本地缺失或哈希不同 → `to_download`；
 * - `unlisted_local` / `catalog_version_mismatch` 永不下发下载授权，进入 `unresolved`；
 * - 本地已启用、不在房主清单内、且不是纯客户端辅助的 Mod → `to_disable`；
 * - 纯客户端辅助 Mod（内置白名单或客户端标记 `client_only`）→ 默认保留；
 * - 只要存在 `unresolved`，状态就是 `partial_sync_required`，仍允许先拉齐可同步项。
 */
export function buildModSyncPlan(
  hostMods: SessionModView[],
  installedMods: NormalizedInstalledMod[],
): ModSyncPlan {
  const local = new Map<string, NormalizedInstalledMod>();
  for (const mod of installedMods) local.set(normalizeModId(mod.mod_id), mod);
  const hostIds = new Set(hostMods.map((mod) => normalizeModId(mod.mod_id)));

  const toDownload: ModDownloadPlanItem[] = [];
  const toEnable: ModEnablePlanItem[] = [];
  const unresolved: ModUnresolvedPlanItem[] = [];

  for (const host of [...hostMods].sort(compareModId)) {
    const key = normalizeModId(host.mod_id);
    if (host.resolution_status !== 'catalog_verified' || !host.sha256) {
      // 防御性分支：verified 但缺哈希说明目录数据不一致，按不可同步处理。
      unresolved.push({
        mod_id: host.mod_id,
        display_name: host.display_name,
        version: host.version,
        sha256: host.sha256,
        reason: host.unresolved_reason
          || (host.resolution_status === 'catalog_version_mismatch' ? 'catalog_version_mismatch' : 'sha256_missing'),
        resolution_status: host.resolution_status,
        resource_public_id: host.resource_public_id,
        resource_version_public_id: host.resource_version_public_id,
      });
      continue;
    }

    const localMod = local.get(key);
    const sameHash = !!localMod?.sha256 && localMod.sha256 === host.sha256;
    if (sameHash) {
      if (!localMod!.enabled) {
        toEnable.push({
          mod_id: host.mod_id,
          display_name: host.display_name,
          version: host.version,
          sha256: host.sha256,
          size_bytes: host.file_size_bytes,
          resource_public_id: host.resource_public_id,
          resource_version_public_id: host.resource_version_public_id,
          file_public_id: host.file_public_id,
        });
      }
      continue;
    }

    toDownload.push({
      mod_id: host.mod_id,
      display_name: host.display_name,
      version: host.version,
      sha256: host.sha256,
      size_bytes: host.file_size_bytes,
      resource_public_id: host.resource_public_id,
      resource_version_public_id: host.resource_version_public_id,
      file_public_id: host.file_public_id,
      reason: !localMod ? 'missing' : localMod.sha256 ? 'hash_mismatch' : 'unverified',
    });
  }

  const toDisable: ModLocalPlanItem[] = [];
  const preserved: ModLocalPlanItem[] = [];
  for (const mod of [...installedMods].sort(compareModId)) {
    if (!mod.enabled) continue;
    const key = normalizeModId(mod.mod_id);
    if (hostIds.has(key)) continue;
    const item: ModLocalPlanItem = {
      mod_id: mod.mod_id,
      display_name: null,
      version: mod.version,
      sha256: mod.sha256,
    };
    if (isClientOnly(mod)) preserved.push(item);
    else toDisable.push(item);
  }

  const status: ModSyncPlan['status'] = unresolved.length
    ? 'partial_sync_required'
    : (toDownload.length || toEnable.length || toDisable.length)
      ? 'sync_required'
      : 'ready';

  return {
    status,
    to_download: toDownload,
    to_enable: toEnable,
    to_disable: toDisable,
    preserved_client_mods: preserved,
    unresolved,
  };
}

/** 会话大厅/详情使用的模组摘要；`limit` 为 null 时返回完整清单。 */
export function summarizeSessionMods(
  mods: SessionModView[],
  pack: SessionPackSummary | null,
  limit: number | null,
): SessionModSummary {
  const sorted = [...mods].sort(compareModId);
  const visible = limit == null ? sorted : sorted.slice(0, Math.max(0, limit));
  return {
    modded: sorted.length > 0,
    mod_count: sorted.length,
    syncable_count: sorted.filter((mod) => mod.resolution_status === 'catalog_verified' && !!mod.sha256).length,
    pack,
    mods: visible.map((mod) => ({
      mod_id: mod.mod_id,
      display_name: mod.display_name,
      version: mod.version,
      syncable: mod.resolution_status === 'catalog_verified' && !!mod.sha256,
      resolution_status: mod.resolution_status,
    })),
    mods_truncated: sorted.length > visible.length,
  };
}
