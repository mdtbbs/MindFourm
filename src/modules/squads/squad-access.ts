import { EntityManager } from 'typeorm';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { HttpStatus } from '@nestjs/common';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

/** 同时支持 DataSource / EntityManager / 事务 manager 的最小查询接口。 */
export type SquadQueryable = Pick<EntityManager, 'query'>;

export type SquadRow = {
  id: string;
  name: string;
  owner_user_id: number;
  max_members: number;
  max_slots: number;
  deleted_at: Date | null;
};

export type SquadMemberRow = {
  squad_id: string;
  user_id: number;
  role: 'owner' | 'admin' | 'member';
  status: 'invited' | 'active' | 'left' | 'kicked';
  joined_at: Date | null;
};

export type SquadSaveSlotRow = {
  id: string;
  squad_id: string;
  name: string;
  head_snapshot_id: string | null;
  active_session_id: string | null;
  lanlink_room_code: string | null;
  game_version: string | null;
  mods_json: unknown;
  created_by_user_id: number;
  deleted_at: Date | null;
};

export function squadFail(code: string, status: HttpStatus, message: string, retryable = false, details: unknown[] = []): never {
  throw new ApiV1Exception(code, status, message, retryable, details);
}

export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function normalizeSquadName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 80) {
    squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '小队名称需为 1–80 个字符。');
  }
  return name;
}

export function normalizeSlotName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 100) {
    squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '存档槽名称需为 1–100 个字符。');
  }
  return name;
}

export async function findSquad(manager: SquadQueryable, squadId: string, options: { forUpdate?: boolean } = {}): Promise<SquadRow | null> {
  const rows = await manager.query(
    `SELECT id,name,owner_user_id,max_members,max_slots,deleted_at FROM squads
      WHERE id=? AND deleted_at IS NULL LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [squadId],
  );
  return Array.isArray(rows) && rows.length ? rows[0] as SquadRow : null;
}

export async function findMember(manager: SquadQueryable, squadId: string, userId: number): Promise<SquadMemberRow | null> {
  const rows = await manager.query(
    'SELECT squad_id,user_id,role,status,joined_at FROM squad_members WHERE squad_id=? AND user_id=? LIMIT 1',
    [squadId, userId],
  );
  return Array.isArray(rows) && rows.length ? rows[0] as SquadMemberRow : null;
}

/** 读取小队并断言调用者是活跃成员；返回两者。 */
export async function requireActiveSquad(
  manager: SquadQueryable,
  squadId: string,
  userId: number,
  options: { forUpdate?: boolean } = {},
): Promise<{ squad: SquadRow; member: SquadMemberRow }> {
  const squad = await findSquad(manager, squadId, options);
  if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
  const member = await findMember(manager, squadId, userId);
  if (!member || member.status !== 'active') {
    squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有小队活跃成员可以执行此操作。');
  }
  return { squad, member };
}

export async function requireManager(
  manager: SquadQueryable,
  squadId: string,
  userId: number,
  options: { forUpdate?: boolean } = {},
): Promise<{ squad: SquadRow; member: SquadMemberRow }> {
  const context = await requireActiveSquad(manager, squadId, userId, options);
  if (!isManagerRole(context.member.role)) {
    squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有队长或管理员可以执行此操作。');
  }
  return context;
}

export async function requireSlot(
  manager: SquadQueryable,
  squadId: string,
  slotId: string,
  options: { forUpdate?: boolean } = {},
): Promise<SquadSaveSlotRow> {
  const rows = await manager.query(
    `SELECT * FROM squad_save_slots WHERE id=? AND squad_id=? AND deleted_at IS NULL LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [slotId, squadId],
  );
  if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_SLOT_NOT_FOUND', HttpStatus.NOT_FOUND, '小队存档槽不存在。');
  return rows[0] as SquadSaveSlotRow;
}

/**
 * 锁定小队行并确认 owner 仍是调用方读到的计费用户。
 *
 * 存储路径先锁计费用户、再锁小队；固定顺序与转让接受（users → squad）和
 * 销号（user → squads）一致。若窗口内发生了队长转让，返回可重试的
 * SQUAD_OWNER_CHANGED，而不是继续把字节记到旧队长名下。
 */
export async function lockSquadOwner(manager: SquadQueryable, squadId: string, expectedOwner: number): Promise<void> {
  const rows = await manager.query('SELECT owner_user_id FROM squads WHERE id=? AND deleted_at IS NULL FOR UPDATE', [squadId]);
  if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
  if (Number(rows[0].owner_user_id) !== expectedOwner) {
    squadFail('SQUAD_OWNER_CHANGED', HttpStatus.CONFLICT, '小队队长已变化，请重试本次操作。', true);
  }
}

export async function listActiveMemberIds(manager: SquadQueryable, squadId: string): Promise<number[]> {
  const rows = await manager.query(
    "SELECT user_id FROM squad_members WHERE squad_id=? AND status='active' ORDER BY user_id ASC",
    [squadId],
  );
  return (Array.isArray(rows) ? rows : []).map((row: any) => Number(row.user_id));
}

/**
 * 向小队成员的用户事件流广播。
 *
 * 事件只是“去读快照”的轻量通知；真正的权限与状态仍以 API 读取为准。
 * 该函数在所有数据库事务提交后调用，Redis 故障不能回滚存档操作。
 */
export async function broadcastSquadEvent(
  realtime: RealtimeEventsService,
  memberIds: number[],
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  for (const userId of [...new Set(memberIds)]) {
    await realtime.emitUser(userId, event, data).catch(() => null);
  }
}
