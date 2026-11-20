import { EntityManager } from 'typeorm';

/**
 * 个人云存档与小隊共享存档的统一配额核算（D03）。
 *
 * 计费公式（对 `users(id = billing_user_id)` 行加 `FOR UPDATE` 后使用）：
 *
 *   UsedBytes(u) = 个人 blobs + 个人 pending
 *                + 名下小队 blobs + 名下小队 pending
 *
 * `pending` 只统计尚未被任何存活快照引用的暂存内容，避免同一份内容既被
 * 快照引用、又被上传会话重复预留。小队字节始终按 `squads.owner_user_id`
 * 归集：`billing_user_id` 只是冗余索引列，两步转让时与 owner 一起原子切换。
 */

export type SaveQuotaBreakdown = {
  /** 个人云存档中仍被快照引用的唯一 blob 字节。 */
  personal_bytes: number;
  /** 该用户名下小队中仍被快照引用的唯一 blob 字节。 */
  owned_squads_bytes: number;
  /** 个人与名下小队尚未引用、仍处于有效期内的暂存上传预留字节。 */
  pending_bytes: number;
};

export type SaveQuotaUsage = SaveQuotaBreakdown & { used_bytes: number };

export type SaveQuotaExclusion = {
  personal?: Array<{ sha256: string; size: number }>;
  /**
   * 小队暂存按 `squad_id` 隔离：不同小队即使暂存相同内容也是两份物理对象，
   * 因此排除键必须带 squad_id，不能只按内容去重。
   */
  squads?: Array<{ squad_id: string; sha256: string; size: number }>;
};

function contentKey(sha256: string, size: number | string): string {
  return `${sha256}:${Number(size)}`;
}

function sumRows(rows: Array<{ size_bytes?: unknown }>): number {
  return rows.reduce((total, row) => total + Number(row.size_bytes || 0), 0);
}

/** 锁住计费用户行；调用方必须已经开启事务。 */
export async function lockBillingUser(manager: EntityManager, userId: number): Promise<void> {
  const rows = await manager.query('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
  if (!rows.length) throw Object.assign(new Error('Billing user does not exist'), { code: 'SAVE_NOT_FOUND' });
}

/**
 * 按 id 升序锁定多个计费用户行。
 *
 * 两步队长转让会同时锁新旧队长的 `users` 行；固定顺序是避免两个小队互相
 * 转让时形成 AB/BA 死锁的唯一手段。
 */
export async function lockBillingUsers(manager: EntityManager, userIds: number[]): Promise<void> {
  const ids = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))].sort((left, right) => left - right);
  if (!ids.length) return;
  const marks = ids.map(() => '?').join(',');
  await manager.query(`SELECT id FROM users WHERE id IN (${marks}) ORDER BY id ASC FOR UPDATE`, ids);
}

export async function personalBlobBytes(manager: EntityManager, userId: number): Promise<number> {
  const rows = await manager.query(
    'SELECT COALESCE(SUM(size_bytes),0) AS size_bytes FROM game_save_blobs WHERE user_id=? AND ref_count>0',
    [userId],
  );
  return Number(rows[0]?.size_bytes || 0);
}

export async function ownedSquadBlobBytes(manager: EntityManager, userId: number): Promise<number> {
  const rows = await manager.query(
    `SELECT COALESCE(SUM(b.size_bytes),0) AS size_bytes
       FROM squad_save_blobs b JOIN squads sq ON sq.id = b.squad_id
      WHERE sq.owner_user_id = ? AND sq.deleted_at IS NULL AND b.ref_count > 0`,
    [userId],
  );
  return Number(rows[0]?.size_bytes || 0);
}

/**
 * 个人暂存上传中尚未被个人快照引用的唯一内容。
 *
 * 整包上传会话与差量 blob 会话共享同一内容键，因此以 sha256+size 去重；
 * 调用方可以传入即将提交的内容键，把它们从预留里排除，避免重复计数。
 */
export async function personalPendingRows(
  manager: EntityManager,
  userId: number,
  exclude: Array<{ sha256: string; size: number }> = [],
): Promise<Array<{ sha256: string; size_bytes: string }>> {
  const sessions = await manager.query(
    `SELECT DISTINCT s.expected_sha256 AS sha256, s.expected_size_bytes AS size_bytes
       FROM game_save_upload_sessions s
      WHERE s.user_id = ? AND s.status IN ('pending','uploaded') AND s.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM game_save_blobs b
           WHERE b.user_id = s.user_id AND b.sha256 = s.expected_sha256
             AND b.size_bytes = s.expected_size_bytes AND b.ref_count > 0
        )`,
    [userId],
  );
  const blobs = await manager.query(
    `SELECT DISTINCT u.sha256 AS sha256, u.size_bytes AS size_bytes
       FROM game_save_blob_uploads u
      WHERE u.user_id = ? AND u.status IN ('pending','ready') AND u.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM game_save_blobs b
           WHERE b.user_id = u.user_id AND b.sha256 = u.sha256
             AND b.size_bytes = u.size_bytes AND b.ref_count > 0
        )`,
    [userId],
  );
  const excluded = new Set(exclude.map((pair) => contentKey(pair.sha256, pair.size)));
  const unique = new Map<string, { sha256: string; size_bytes: string }>();
  for (const row of [...sessions, ...blobs]) {
    const key = contentKey(String(row.sha256), row.size_bytes);
    if (excluded.has(key) || unique.has(key)) continue;
    unique.set(key, { sha256: String(row.sha256), size_bytes: String(row.size_bytes) });
  }
  return [...unique.values()];
}

/** 名下小队暂存上传中尚未被该小队快照引用的唯一内容。 */
export async function ownedSquadPendingRows(
  manager: EntityManager,
  userId: number,
  exclude: Array<{ squad_id: string; sha256: string; size: number }> = [],
): Promise<Array<{ squad_id: string; sha256: string; size_bytes: string }>> {
  const rows = await manager.query(
    `SELECT DISTINCT u.squad_id AS squad_id, u.sha256 AS sha256, u.size_bytes AS size_bytes
       FROM squad_save_blob_uploads u
       JOIN squads sq ON sq.id = u.squad_id
      WHERE sq.owner_user_id = ? AND sq.deleted_at IS NULL
        AND u.status IN ('pending','ready') AND u.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM squad_save_blobs b
           WHERE b.squad_id = u.squad_id AND b.sha256 = u.sha256
             AND b.size_bytes = u.size_bytes AND b.ref_count > 0
        )`,
    [userId],
  );
  const excluded = new Set(exclude.map((pair) => `${pair.squad_id}:${contentKey(pair.sha256, pair.size)}`));
  const unique = new Map<string, { squad_id: string; sha256: string; size_bytes: string }>();
  for (const row of rows) {
    const key = `${row.squad_id}:${contentKey(String(row.sha256), row.size_bytes)}`;
    if (excluded.has(key) || unique.has(key)) continue;
    unique.set(key, { squad_id: String(row.squad_id), sha256: String(row.sha256), size_bytes: String(row.size_bytes) });
  }
  return [...unique.values()];
}

/**
 * 统计一个计费用户的完整用量。调用方应已锁住该用户行（或正处在持有
 * 相应小队 / 槽位锁的事务里），否则并发上传可能同时通过配额校验。
 */
export async function getSaveQuotaUsage(
  manager: EntityManager,
  userId: number,
  exclusion: SaveQuotaExclusion = {},
): Promise<SaveQuotaUsage> {
  // 同一个事务 manager 共享一条连接，并行 query 会让 mysql2 在协议层交错；
  // 顺序执行既避免驱动层竞争，也让单元测试的 SQL 断言保持确定顺序。
  const personalBytes = await personalBlobBytes(manager, userId);
  const squadBytes = await ownedSquadBlobBytes(manager, userId);
  const personalPending = await personalPendingRows(manager, userId, exclusion.personal);
  const squadPending = await ownedSquadPendingRows(manager, userId, exclusion.squads);
  const pendingBytes = sumRows(personalPending) + sumRows(squadPending);
  return {
    personal_bytes: personalBytes,
    owned_squads_bytes: squadBytes,
    pending_bytes: pendingBytes,
    used_bytes: personalBytes + squadBytes + pendingBytes,
  };
}
