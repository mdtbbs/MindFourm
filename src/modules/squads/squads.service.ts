import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { FriendsService } from '../friends/friends.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { getSaveQuotaUsage, lockBillingUsers } from '../game-saves/save-quota';
import {
  broadcastSquadEvent, findMember, findSquad, isManagerRole, listActiveMemberIds, normalizeSlotName,
  normalizeSquadName, requireActiveSquad, requireManager, squadFail,
} from './squad-access';

export type SquadActor = {
  clientId?: string;
  deviceId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const OWNED_SQUAD_LIMIT = 10;
const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SquadsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly friends: FriendsService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  /** 小队共享存档依赖个人云存档：两个开关都打开且存储就绪时才可用。 */
  isEnabled(): boolean {
    return this.settings.getCached('squad_saves_enabled') === 'true'
      && this.settings.getCached('cloud_saves_enabled') === 'true';
  }

  assertEnabled(): void {
    if (this.settings.getCached('squad_saves_enabled') !== 'true') {
      squadFail('SQUADS_DISABLED', HttpStatus.FORBIDDEN, '小队共享存档功能尚未启用。');
    }
    if (this.settings.getCached('cloud_saves_enabled') !== 'true') {
      squadFail('CLOUD_SAVES_DISABLED', HttpStatus.FORBIDDEN, '云存档功能尚未启用。');
    }
  }

  get quotaLimitBytes(): number {
    const value = Number(this.settings.getCached('cloud_saves_user_quota_bytes'));
    return Number.isSafeInteger(value) && value > 0 ? value : 524288000;
  }

  async listSquads(userId: number) {
    this.assertEnabled();
    const rows = await this.dataSource.query(
      `SELECT sq.id, sq.name, sq.owner_user_id, sq.max_members, sq.max_slots, sq.created_at, sq.updated_at,
              m.role AS my_role,
              (SELECT COUNT(*) FROM squad_members mm WHERE mm.squad_id = sq.id AND mm.status='active') AS member_count,
              (SELECT COUNT(*) FROM squad_save_slots ss WHERE ss.squad_id = sq.id AND ss.deleted_at IS NULL) AS slot_count
         FROM squads sq JOIN squad_members m ON m.squad_id = sq.id
        WHERE m.user_id = ? AND m.status = 'active' AND sq.deleted_at IS NULL
        ORDER BY sq.updated_at DESC, sq.id DESC`,
      [userId],
    );
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: row.id,
      name: row.name,
      owner_user_id: Number(row.owner_user_id),
      my_role: row.my_role,
      max_members: Number(row.max_members),
      max_slots: Number(row.max_slots),
      member_count: Number(row.member_count || 0),
      slot_count: Number(row.slot_count || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async listInvitations(userId: number) {
    this.assertEnabled();
    const rows = await this.dataSource.query(
      `SELECT m.squad_id, m.role, m.status, m.created_at, sq.name AS squad_name, sq.owner_user_id, u.username AS invited_by_username
         FROM squad_members m
         JOIN squads sq ON sq.id = m.squad_id AND sq.deleted_at IS NULL
         LEFT JOIN users u ON u.id = m.invited_by_user_id
        WHERE m.user_id = ? AND m.status = 'invited'
        ORDER BY m.created_at DESC`,
      [userId],
    );
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      squad_id: row.squad_id,
      squad_name: row.squad_name,
      owner_user_id: Number(row.owner_user_id),
      role: row.role,
      invited_by_username: row.invited_by_username ?? null,
      created_at: row.created_at,
    }));
  }

  async getSquad(userId: number, squadId: string) {
    this.assertEnabled();
    const { squad, member } = await requireActiveSquad(this.dataSource, squadId, userId);
    const [memberRows, slotRows, leaseRows, transferRows] = [
      await this.dataSource.query(
        `SELECT m.user_id, m.role, m.status, m.joined_at, u.username, u.avatar_url
           FROM squad_members m LEFT JOIN users u ON u.id = m.user_id
          WHERE m.squad_id = ? AND m.status IN ('active','invited')
          ORDER BY FIELD(m.role, 'owner', 'admin', 'member'), m.created_at ASC`,
        [squadId],
      ),
      await this.dataSource.query(
        `SELECT id,name,head_snapshot_id,active_session_id,lanlink_room_code,game_version,created_by_user_id,updated_at
           FROM squad_save_slots WHERE squad_id=? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC`,
        [squadId],
      ),
      await this.dataSource.query(
        `SELECT l.slot_id, l.holder_user_id, l.fencing_token, l.status, l.expires_at, u.username AS holder_username
           FROM squad_save_leases l
           JOIN squad_save_slots s ON s.id = l.slot_id AND s.deleted_at IS NULL
           LEFT JOIN users u ON u.id = l.holder_user_id
          WHERE s.squad_id = ?`,
        [squadId],
      ),
      await this.dataSource.query(
        `SELECT id, from_user_id, to_user_id, status, expires_at, created_at
           FROM squad_ownership_transfers
          WHERE squad_id = ? AND status = 'pending' AND expires_at > NOW()
          ORDER BY created_at DESC LIMIT 1`,
        [squadId],
      ),
    ];
    const leases = new Map((Array.isArray(leaseRows) ? leaseRows : []).map((row: any) => [String(row.slot_id), row]));
    return {
      id: squad.id,
      name: squad.name,
      owner_user_id: Number(squad.owner_user_id),
      my_role: member.role,
      max_members: Number(squad.max_members),
      max_slots: Number(squad.max_slots),
      members: (Array.isArray(memberRows) ? memberRows : []).map((row: any) => ({
        user_id: Number(row.user_id),
        username: row.username ?? null,
        avatar_url: row.avatar_url ?? null,
        role: row.role,
        status: row.status,
        joined_at: row.joined_at,
      })),
      slots: (Array.isArray(slotRows) ? slotRows : []).map((row: any) => {
        const lease = leases.get(String(row.id));
        const leaseActive = Boolean(lease && lease.status === 'active' && new Date(lease.expires_at).getTime() > Date.now());
        return {
          id: row.id,
          name: row.name,
          head_snapshot_id: row.head_snapshot_id ?? null,
          // 没有有效租约时，房间指针属于已经结束的会话，不应再展示给成员。
          active_session_id: leaseActive ? row.active_session_id ?? null : null,
          lanlink_room_code: leaseActive ? row.lanlink_room_code ?? null : null,
          game_version: row.game_version ?? null,
          created_by_user_id: Number(row.created_by_user_id),
          updated_at: row.updated_at,
          lease: leaseActive ? {
            holder_user_id: Number(lease.holder_user_id),
            holder_username: lease.holder_username ?? null,
            fencing_token: Number(lease.fencing_token),
            expires_at: lease.expires_at,
          } : null,
        };
      }),
      ownership_transfer: Array.isArray(transferRows) && transferRows.length ? {
        id: transferRows[0].id,
        from_user_id: Number(transferRows[0].from_user_id),
        to_user_id: Number(transferRows[0].to_user_id),
        expires_at: transferRows[0].expires_at,
      } : null,
    };
  }

  async createSquad(userId: number, body: any, actor: SquadActor) {
    this.assertEnabled();
    const name = normalizeSquadName(body?.name);
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
      const [{ count }] = await manager.query('SELECT COUNT(*) AS count FROM squads WHERE owner_user_id=? AND deleted_at IS NULL', [userId]);
      if (Number(count) >= OWNED_SQUAD_LIMIT) {
        squadFail('SQUAD_LIMIT_EXCEEDED', HttpStatus.CONFLICT, '已达到可创建的小队数量上限。');
      }
      const id = randomUUID();
      await manager.query('INSERT INTO squads (id,name,owner_user_id) VALUES (?,?,?)', [id, name, userId]);
      await manager.query("INSERT INTO squad_members (squad_id,user_id,role,status,joined_at) VALUES (?,?,'owner','active',NOW())", [id, userId]);
      await this.audit(manager, userId, 'squad.create', { squad_id: id }, actor);
      return { id, name, owner_user_id: userId, my_role: 'owner', max_members: 8, max_slots: 5, member_count: 1, slot_count: 0 };
    });
  }

  async renameSquad(userId: number, squadId: string, body: any, actor: SquadActor) {
    this.assertEnabled();
    const name = normalizeSquadName(body?.name);
    return this.dataSource.transaction(async manager => {
      await requireManager(manager, squadId, userId, { forUpdate: true });
      await manager.query('UPDATE squads SET name=?, updated_at=NOW() WHERE id=?', [name, squadId]);
      await this.audit(manager, userId, 'squad.rename', { squad_id: squadId }, actor);
      return { id: squadId, name };
    });
  }

  /**
   * 删除小队：只有队长可以执行。
   *
   * 与个人销号一致，删除会软删槽位与快照、释放小队 blob 引用并吊销租约；
   * 物理对象留给维护任务的宽限期 GC。
   */
  async deleteSquad(userId: number, squadId: string, actor: SquadActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      const squad = await findSquad(manager, squadId, { forUpdate: true });
      if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
      if (Number(squad.owner_user_id) !== userId) {
        squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有队长可以删除小队。');
      }
      const slots = await manager.query('SELECT id FROM squad_save_slots WHERE squad_id=? AND deleted_at IS NULL FOR UPDATE', [squadId]);
      const slotIds = (Array.isArray(slots) ? slots : []).map((row: any) => String(row.id));
      if (slotIds.length) {
        const marks = slotIds.map(() => '?').join(',');
        const references = await manager.query(
          `SELECT s.id AS snapshot_id, f.blob_id AS blob_id
             FROM squad_save_snapshots s JOIN squad_save_snapshot_files f ON f.snapshot_id = s.id
            WHERE s.slot_id IN (${marks}) AND s.deleted_at IS NULL`,
          slotIds,
        );
        const bySnapshot = new Map<string, Set<string>>();
        for (const row of Array.isArray(references) ? references : []) {
          const set = bySnapshot.get(String(row.snapshot_id)) || new Set<string>();
          set.add(String(row.blob_id));
          bySnapshot.set(String(row.snapshot_id), set);
        }
        const counts = new Map<string, number>();
        for (const set of bySnapshot.values()) for (const blobId of set) counts.set(blobId, (counts.get(blobId) || 0) + 1);
        for (const [blobId, count] of counts) await this.releaseBlob(manager, blobId, count);
        for (const snapshotId of bySnapshot.keys()) await manager.query('DELETE FROM squad_save_snapshot_files WHERE snapshot_id=?', [snapshotId]);
        await manager.query(`UPDATE squad_save_snapshots SET deleted_at=NOW() WHERE slot_id IN (${marks}) AND deleted_at IS NULL`, slotIds);
        await manager.query(
          `UPDATE squad_save_slots SET head_snapshot_id=NULL, active_session_id=NULL, deleted_at=NOW(), updated_at=NOW() WHERE id IN (${marks})`,
          slotIds,
        );
        await manager.query("UPDATE squad_save_leases SET status='expired', expires_at=LEAST(expires_at,NOW()), multiplayer_session_id=NULL WHERE slot_id IN (" + marks + ')', slotIds);
      }
      await manager.query("UPDATE squad_save_blob_uploads SET status='expired' WHERE squad_id=? AND status IN ('pending','ready')", [squadId]);
      await manager.query('UPDATE squads SET deleted_at=NOW(), updated_at=NOW() WHERE id=?', [squadId]);
      await manager.query("UPDATE squad_members SET status='left' WHERE squad_id=? AND status IN ('active','invited')", [squadId]);
      await manager.query("UPDATE squad_ownership_transfers SET status='cancelled', resolved_at=NOW() WHERE squad_id=? AND status='pending'", [squadId]);
      await this.audit(manager, userId, 'squad.delete', { squad_id: squadId }, actor);
      return { id: squadId, deleted: true };
    });
  }

  async inviteMember(userId: number, squadId: string, body: any, actor: SquadActor) {
    this.assertEnabled();
    const targetId = Number(body?.user_id);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '目标用户 ID 无效。');
    }
    if (targetId === userId) squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '不能邀请自己。');
    // 先确认调用者有邀请权限，再查询好友关系：避免非成员借错误码差异探测他人好友关系。
    await requireManager(this.dataSource, squadId, userId);
    const isFriend = await this.friends.areFriends(userId, targetId);
    if (!isFriend) squadFail('SQUAD_FRIEND_REQUIRED', HttpStatus.FORBIDDEN, '只能邀请已经是好友的账号。');
    return this.dataSource.transaction(async manager => {
      const { squad } = await requireManager(manager, squadId, userId, { forUpdate: true });
      const targetUser = await manager.query('SELECT id FROM users WHERE id=? LIMIT 1', [targetId]);
      if (!Array.isArray(targetUser) || !targetUser.length) squadFail('SQUAD_MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND, '目标用户不存在。');
      const existing = await findMember(manager, squadId, targetId);
      if (existing?.status === 'active') squadFail('SQUAD_MEMBER_ALREADY_EXISTS', HttpStatus.CONFLICT, '该用户已经是小队成员。');
      if (existing?.status === 'invited') {
        return { squad_id: squadId, user_id: targetId, status: 'invited', already_invited: true };
      }
      if (existing) {
        await manager.query(
          "UPDATE squad_members SET status='invited', role='member', invited_by_user_id=?, joined_at=NULL, updated_at=NOW() WHERE squad_id=? AND user_id=?",
          [userId, squadId, targetId],
        );
      } else {
        await manager.query(
          "INSERT INTO squad_members (squad_id,user_id,role,status,invited_by_user_id) VALUES (?,?,'member','invited',?)",
          [squadId, targetId, userId],
        );
      }
      await this.audit(manager, userId, 'squad.member.invite', { squad_id: squadId, target_user_id: targetId }, actor);
      return { squad_id: squadId, user_id: targetId, status: 'invited', already_invited: false, squad: { id: squad.id, name: squad.name } };
    });
  }

  async acceptInvitation(userId: number, squadId: string, actor: SquadActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      const squad = await findSquad(manager, squadId, { forUpdate: true });
      if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
      const member = await findMember(manager, squadId, userId);
      if (!member || member.status !== 'invited') squadFail('SQUAD_INVITE_NOT_FOUND', HttpStatus.NOT_FOUND, '没有待接受的小队邀请。');
      const [{ count }] = await manager.query("SELECT COUNT(*) AS count FROM squad_members WHERE squad_id=? AND status='active'", [squadId]);
      if (Number(count) >= Number(squad.max_members)) {
        squadFail('SQUAD_MEMBER_LIMIT_EXCEEDED', HttpStatus.CONFLICT, '小队成员数量已达上限。');
      }
      await manager.query("UPDATE squad_members SET status='active', joined_at=NOW(), updated_at=NOW() WHERE squad_id=? AND user_id=?", [squadId, userId]);
      await this.audit(manager, userId, 'squad.member.accept', { squad_id: squadId }, actor);
      return { squad_id: squadId, status: 'active', role: member.role };
    });
  }

  async declineInvitation(userId: number, squadId: string, actor: SquadActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      const member = await findMember(manager, squadId, userId);
      if (!member || member.status !== 'invited') squadFail('SQUAD_INVITE_NOT_FOUND', HttpStatus.NOT_FOUND, '没有待接受的小队邀请。');
      await manager.query("UPDATE squad_members SET status='left', updated_at=NOW() WHERE squad_id=? AND user_id=?", [squadId, userId]);
      await this.audit(manager, userId, 'squad.member.decline', { squad_id: squadId }, actor);
      return { squad_id: squadId, status: 'declined' };
    });
  }

  async setMemberRole(userId: number, squadId: string, targetUserId: number, body: any, actor: SquadActor) {
    this.assertEnabled();
    const role = body?.role;
    if (role !== 'admin' && role !== 'member') squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '成员角色无效。');
    return this.dataSource.transaction(async manager => {
      const { squad } = await requireActiveSquad(manager, squadId, userId, { forUpdate: true });
      if (Number(squad.owner_user_id) !== userId) squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有队长可以调整成员角色。');
      const target = await findMember(manager, squadId, targetUserId);
      if (!target || target.status !== 'active') squadFail('SQUAD_MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND, '小队成员不存在。');
      if (target.role === 'owner') squadFail('SQUAD_OWNER_ROLE_IMMUTABLE', HttpStatus.CONFLICT, '队长角色只能通过两步转让切换。');
      await manager.query('UPDATE squad_members SET role=?, updated_at=NOW() WHERE squad_id=? AND user_id=?', [role, squadId, targetUserId]);
      await this.audit(manager, userId, 'squad.member.role', { squad_id: squadId, target_user_id: targetUserId, role }, actor);
      return { squad_id: squadId, user_id: targetUserId, role };
    });
  }

  async removeMember(userId: number, squadId: string, targetUserId: number, actor: SquadActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      const squad = await findSquad(manager, squadId, { forUpdate: true });
      if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
      const actorMember = await findMember(manager, squadId, userId);
      if (!actorMember || actorMember.status !== 'active') {
        squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有小队活跃成员可以执行此操作。');
      }
      const target = await findMember(manager, squadId, targetUserId);
      if (!target || target.status !== 'active') squadFail('SQUAD_MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND, '小队成员不存在。');
      if (target.role === 'owner') squadFail('SQUAD_OWNER_MUST_TRANSFER', HttpStatus.CONFLICT, '队长需先完成转让才能退出小队。');
      const self = targetUserId === userId;
      if (!self) {
        if (!isManagerRole(actorMember.role)) squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有队长或管理员可以移除成员。');
        if (actorMember.role === 'admin' && target.role !== 'member') {
          squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '管理员只能移除普通成员。');
        }
      }
      await manager.query(
        'UPDATE squad_members SET status=?, updated_at=NOW() WHERE squad_id=? AND user_id=?',
        [self ? 'left' : 'kicked', squadId, targetUserId],
      );
      await this.audit(manager, userId, self ? 'squad.member.leave' : 'squad.member.kick', { squad_id: squadId, target_user_id: targetUserId }, actor);
      return { squad_id: squadId, user_id: targetUserId, status: self ? 'left' : 'kicked' };
    });
  }

  async createOwnershipTransfer(userId: number, squadId: string, body: any, actor: SquadActor) {
    this.assertEnabled();
    const targetId = Number(body?.target_user_id);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '目标用户 ID 无效。');
    }
    if (targetId === userId) squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '不能转让给自己。');
    return this.dataSource.transaction(async manager => {
      const squad = await findSquad(manager, squadId, { forUpdate: true });
      if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
      if (Number(squad.owner_user_id) !== userId) squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有队长可以发起转让。');
      const target = await findMember(manager, squadId, targetId);
      if (!target || target.status !== 'active') squadFail('SQUAD_MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND, '目标用户不是小队活跃成员。');
      const pending = await manager.query(
        "SELECT id,expires_at FROM squad_ownership_transfers WHERE squad_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [squadId],
      );
      if (Array.isArray(pending) && pending.length) {
        if (new Date(pending[0].expires_at).getTime() > Date.now()) {
          squadFail('SQUAD_TRANSFER_PENDING', HttpStatus.CONFLICT, '该小队已有待确认的队长转让。');
        }
        await manager.query("UPDATE squad_ownership_transfers SET status='expired', resolved_at=NOW() WHERE id=?", [pending[0].id]);
      }
      const id = randomUUID();
      const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
      await manager.query(
        `INSERT INTO squad_ownership_transfers (id,squad_id,from_user_id,to_user_id,status,expires_at)
         VALUES (?,?,?,?,'pending',?)`,
        [id, squadId, userId, targetId, expiresAt],
      );
      await this.audit(manager, userId, 'squad.ownership_transfer.create', { squad_id: squadId, transfer_id: id, to_user_id: targetId }, actor);
      return { id, squad_id: squadId, from_user_id: userId, to_user_id: targetId, status: 'pending', expires_at: expiresAt };
    });
  }

  /**
   * 接受两步转让（D04）。
   *
   * 加锁顺序固定为 users（按 id 升序）→ squad → transfer，与销号路径
   * （user → squads）、存储路径（user → squad → slot）以及
   * create/cancel（squad → transfer）一致，避免取消/重新发起并发时死锁。
   */
  async acceptOwnershipTransfer(userId: number, squadId: string, actor: SquadActor) {
    this.assertEnabled();
    // 无锁预读只用于取得双方 user id；所有有效性检查在持有锁后重做。
    const pending = await this.dataSource.query(
      "SELECT * FROM squad_ownership_transfers WHERE squad_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
      [squadId],
    );
    if (!Array.isArray(pending) || !pending.length) {
      squadFail('SQUAD_TRANSFER_NOT_FOUND', HttpStatus.NOT_FOUND, '没有待确认的队长转让。');
    }
    if (Number(pending[0].to_user_id) !== userId) {
      squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有被指定的新队长可以接受转让。');
    }
    if (new Date(pending[0].expires_at).getTime() <= Date.now()) {
      await this.expirePendingTransfer(squadId);
      squadFail('SQUAD_TRANSFER_EXPIRED', HttpStatus.GONE, '队长转让已过期，请由现任队长重新发起。');
    }
    const fromUserId = Number(pending[0].from_user_id);
    const pendingId = String(pending[0].id);
    const result = await this.dataSource.transaction(async manager => {
      await lockBillingUsers(manager, [fromUserId, userId]);
      const squad = await findSquad(manager, squadId, { forUpdate: true });
      if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
      const transferRows = await manager.query(
        "SELECT * FROM squad_ownership_transfers WHERE id=? AND status='pending' FOR UPDATE",
        [pendingId],
      );
      if (!Array.isArray(transferRows) || !transferRows.length || Number(transferRows[0].to_user_id) !== userId) {
        squadFail('SQUAD_TRANSFER_NOT_FOUND', HttpStatus.NOT_FOUND, '待确认的队长转让已变化，请刷新后重试。');
      }
      const transfer = transferRows[0];
      if (new Date(transfer.expires_at).getTime() <= Date.now()) {
        squadFail('SQUAD_TRANSFER_EXPIRED', HttpStatus.GONE, '队长转让已过期，请由现任队长重新发起。');
      }
      if (Number(squad.owner_user_id) !== fromUserId) {
        squadFail('SQUAD_TRANSFER_STALE', HttpStatus.CONFLICT, '现任队长已变化，请重新发起转让。');
      }
      const [fromMember, toMember] = [await findMember(manager, squadId, fromUserId), await findMember(manager, squadId, userId)];
      if (!fromMember || fromMember.status !== 'active' || fromMember.role !== 'owner') {
        squadFail('SQUAD_TRANSFER_STALE', HttpStatus.CONFLICT, '现任队长状态已变化，请重新发起转让。');
      }
      if (!toMember || toMember.status !== 'active') {
        squadFail('SQUAD_MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND, '新队长必须仍是小队活跃成员。');
      }

      const squadBytes = await this.squadOccupiedBytes(manager, squadId);
      const usage = await getSaveQuotaUsage(manager, userId);
      if (usage.used_bytes + squadBytes > this.quotaLimitBytes) {
        squadFail('SQUAD_TRANSFER_QUOTA_EXCEEDED', HttpStatus.CONFLICT, '新队长的云存档配额不足以承接该小队。');
      }

      await manager.query('UPDATE squads SET owner_user_id=?, updated_at=NOW() WHERE id=?', [userId, squadId]);
      await manager.query('UPDATE squad_save_blobs SET billing_user_id=? WHERE squad_id=?', [userId, squadId]);
      await manager.query(
        "UPDATE squad_save_blob_uploads SET billing_user_id=? WHERE squad_id=? AND status IN ('pending','ready')",
        [userId, squadId],
      );
      await manager.query("UPDATE squad_members SET role='member', updated_at=NOW() WHERE squad_id=? AND user_id=?", [squadId, fromUserId]);
      await manager.query("UPDATE squad_members SET role='owner', updated_at=NOW() WHERE squad_id=? AND user_id=?", [squadId, userId]);
      await manager.query("UPDATE squad_ownership_transfers SET status='accepted', resolved_at=NOW() WHERE id=?", [transfer.id]);
      await this.audit(manager, userId, 'squad.ownership_transfer.accept', {
        squad_id: squadId, transfer_id: transfer.id, from_user_id: fromUserId, to_user_id: userId, squad_bytes: squadBytes,
      }, actor);
      return {
        transfer_id: transfer.id, squad_id: squadId, owner_user_id: userId,
        from_user_id: fromUserId, squad_bytes: squadBytes,
        usage_after: { personal_bytes: usage.personal_bytes, owned_squads_bytes: usage.owned_squads_bytes + squadBytes, pending_bytes: usage.pending_bytes },
        memberIds: await listActiveMemberIds(manager, squadId),
      };
    });
    const { memberIds, ...response } = result;
    await broadcastSquadEvent(this.realtime, memberIds, 'squad_save.ownership_transferred', {
      squad_id: squadId, from_user_id: response.from_user_id, to_user_id: response.owner_user_id, transfer_id: response.transfer_id,
    });
    return response;
  }

  async declineOwnershipTransfer(userId: number, squadId: string, actor: SquadActor) {
    this.assertEnabled();
    const pending = await this.dataSource.query(
      "SELECT * FROM squad_ownership_transfers WHERE squad_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
      [squadId],
    );
    if (!Array.isArray(pending) || !pending.length) {
      squadFail('SQUAD_TRANSFER_NOT_FOUND', HttpStatus.NOT_FOUND, '没有待确认的队长转让。');
    }
    if (Number(pending[0].to_user_id) !== userId) {
      squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有被指定的新队长可以拒绝转让。');
    }
    if (new Date(pending[0].expires_at).getTime() <= Date.now()) {
      await this.expirePendingTransfer(squadId);
      squadFail('SQUAD_TRANSFER_EXPIRED', HttpStatus.GONE, '队长转让已过期。');
    }
    return this.dataSource.transaction(async manager => {
      const rows = await manager.query(
        "SELECT * FROM squad_ownership_transfers WHERE id=? AND status='pending' FOR UPDATE",
        [pending[0].id],
      );
      if (!Array.isArray(rows) || !rows.length || Number(rows[0].to_user_id) !== userId) {
        squadFail('SQUAD_TRANSFER_NOT_FOUND', HttpStatus.NOT_FOUND, '待确认的队长转让已变化，请刷新后重试。');
      }
      if (new Date(rows[0].expires_at).getTime() <= Date.now()) {
        squadFail('SQUAD_TRANSFER_EXPIRED', HttpStatus.GONE, '队长转让已过期。');
      }
      await manager.query("UPDATE squad_ownership_transfers SET status='declined', resolved_at=NOW() WHERE id=?", [rows[0].id]);
      await this.audit(manager, userId, 'squad.ownership_transfer.decline', { squad_id: squadId, transfer_id: rows[0].id }, actor);
      return { transfer_id: rows[0].id, squad_id: squadId, status: 'declined' };
    });
  }

  async cancelOwnershipTransfer(userId: number, squadId: string, actor: SquadActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      const squad = await findSquad(manager, squadId, { forUpdate: true });
      if (!squad) squadFail('SQUAD_NOT_FOUND', HttpStatus.NOT_FOUND, '小队不存在。');
      if (Number(squad.owner_user_id) !== userId) squadFail('SQUAD_PERMISSION_DENIED', HttpStatus.FORBIDDEN, '只有现任队长可以取消转让。');
      const rows = await manager.query(
        "SELECT id FROM squad_ownership_transfers WHERE squad_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [squadId],
      );
      if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_TRANSFER_NOT_FOUND', HttpStatus.NOT_FOUND, '没有待确认的队长转让。');
      await manager.query("UPDATE squad_ownership_transfers SET status='cancelled', resolved_at=NOW() WHERE id=?", [rows[0].id]);
      await this.audit(manager, userId, 'squad.ownership_transfer.cancel', { squad_id: squadId, transfer_id: rows[0].id }, actor);
      return { transfer_id: rows[0].id, squad_id: squadId, status: 'cancelled' };
    });
  }

  async createSlot(userId: number, squadId: string, body: any, actor: SquadActor) {
    this.assertEnabled();
    const name = normalizeSlotName(body?.name);
    const mods = Array.isArray(body?.mods) ? body.mods.slice(0, 100) : null;
    return this.dataSource.transaction(async manager => {
      const { squad } = await requireActiveSquad(manager, squadId, userId, { forUpdate: true });
      const [{ count }] = await manager.query('SELECT COUNT(*) AS count FROM squad_save_slots WHERE squad_id=? AND deleted_at IS NULL', [squadId]);
      if (Number(count) >= Number(squad.max_slots)) {
        squadFail('SQUAD_SLOT_LIMIT_EXCEEDED', HttpStatus.CONFLICT, '小队共享存档槽数量已达上限。');
      }
      const id = randomUUID();
      await manager.query(
        'INSERT INTO squad_save_slots (id,squad_id,name,game_version,mods_json,created_by_user_id) VALUES (?,?,?,?,?,?)',
        [id, squadId, name, typeof body?.game_version === 'string' ? body.game_version.slice(0, 64) : null, mods ? JSON.stringify(mods) : null, userId],
      );
      await this.audit(manager, userId, 'squad.slot.create', { squad_id: squadId, slot_id: id }, actor);
      return { id, squad_id: squadId, name, head_snapshot_id: null, active_session_id: null, created_by_user_id: userId };
    });
  }

  async renameSlot(userId: number, squadId: string, slotId: string, body: any, actor: SquadActor) {
    this.assertEnabled();
    const name = normalizeSlotName(body?.name);
    return this.dataSource.transaction(async manager => {
      await requireActiveSquad(manager, squadId, userId, { forUpdate: true });
      const slots = await manager.query('SELECT id FROM squad_save_slots WHERE id=? AND squad_id=? AND deleted_at IS NULL FOR UPDATE', [slotId, squadId]);
      if (!Array.isArray(slots) || !slots.length) squadFail('SQUAD_SAVE_SLOT_NOT_FOUND', HttpStatus.NOT_FOUND, '小队存档槽不存在。');
      await manager.query('UPDATE squad_save_slots SET name=?, updated_at=NOW() WHERE id=?', [name, slotId]);
      await this.audit(manager, userId, 'squad.slot.rename', { squad_id: squadId, slot_id: slotId }, actor);
      return { id: slotId, name };
    });
  }

  async deleteSlot(userId: number, squadId: string, slotId: string, actor: SquadActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      await requireManager(manager, squadId, userId, { forUpdate: true });
      const rows = await manager.query('SELECT id FROM squad_save_slots WHERE id=? AND squad_id=? AND deleted_at IS NULL FOR UPDATE', [slotId, squadId]);
      if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_SLOT_NOT_FOUND', HttpStatus.NOT_FOUND, '小队存档槽不存在。');
      const references = await manager.query(
        `SELECT s.id AS snapshot_id, f.blob_id AS blob_id
           FROM squad_save_snapshots s JOIN squad_save_snapshot_files f ON f.snapshot_id=s.id
          WHERE s.slot_id=? AND s.deleted_at IS NULL`,
        [slotId],
      );
      const bySnapshot = new Map<string, Set<string>>();
      for (const row of Array.isArray(references) ? references : []) {
        const set = bySnapshot.get(String(row.snapshot_id)) || new Set<string>();
        set.add(String(row.blob_id));
        bySnapshot.set(String(row.snapshot_id), set);
      }
      const counts = new Map<string, number>();
      for (const set of bySnapshot.values()) for (const blobId of set) counts.set(blobId, (counts.get(blobId) || 0) + 1);
      for (const [blobId, count] of counts) await this.releaseBlob(manager, blobId, count);
      for (const snapshotId of bySnapshot.keys()) await manager.query('DELETE FROM squad_save_snapshot_files WHERE snapshot_id=?', [snapshotId]);
      await manager.query('UPDATE squad_save_snapshots SET deleted_at=NOW() WHERE slot_id=? AND deleted_at IS NULL', [slotId]);
      await manager.query("UPDATE squad_save_leases SET status='expired', expires_at=LEAST(expires_at,NOW()), multiplayer_session_id=NULL WHERE slot_id=?", [slotId]);
      // 暂存上传没有 slot_id（设计稿按 squad + lease 建模），删除单个槽位时
      // 不能把同队其他槽位正在进行的上传一并作废；它们会在 TTL 后自然过期。
      await manager.query('UPDATE squad_save_slots SET head_snapshot_id=NULL, active_session_id=NULL, deleted_at=NOW(), updated_at=NOW() WHERE id=?', [slotId]);
      await this.audit(manager, userId, 'squad.slot.delete', { squad_id: squadId, slot_id: slotId }, actor);
      return { id: slotId, deleted: true };
    });
  }

  /** 该小队当前占用的有效 blob 字节 + 尚未引用的暂存预留字节。 */
  async squadOccupiedBytes(manager: EntityManager, squadId: string): Promise<number> {
    const blobRows = await manager.query(
      'SELECT COALESCE(SUM(size_bytes),0) AS size_bytes FROM squad_save_blobs WHERE squad_id=? AND ref_count>0',
      [squadId],
    );
    const pending = await manager.query(
      `SELECT DISTINCT u.sha256 AS sha256, u.size_bytes AS size_bytes
         FROM squad_save_blob_uploads u
        WHERE u.squad_id=? AND u.status IN ('pending','ready') AND u.expires_at>NOW()
          AND NOT EXISTS (
            SELECT 1 FROM squad_save_blobs b
             WHERE b.squad_id=u.squad_id AND b.sha256=u.sha256 AND b.size_bytes=u.size_bytes AND b.ref_count>0
          )`,
      [squadId],
    );
    return Number(blobRows[0]?.size_bytes || 0)
      + (Array.isArray(pending) ? pending.reduce((total: number, row: any) => total + Number(row.size_bytes || 0), 0) : 0);
  }

  /** 在事务外把已过期的 pending 转让落成 expired，避免抛错回滚状态更新。 */
  private async expirePendingTransfer(squadId: string): Promise<void> {
    await this.dataSource.query(
      "UPDATE squad_ownership_transfers SET status='expired', resolved_at=NOW() WHERE squad_id=? AND status='pending' AND expires_at<=NOW()",
      [squadId],
    );
  }

  private async releaseBlob(manager: EntityManager, blobId: string, count: number): Promise<void> {
    const rows = await manager.query('SELECT ref_count FROM squad_save_blobs WHERE id=? FOR UPDATE', [blobId]);
    if (!Array.isArray(rows) || !rows.length) return;
    const next = Math.max(0, Number(rows[0].ref_count) - Math.max(0, count));
    const pending = next === 0 ? new Date(Date.now() + 24 * 3_600_000) : null;
    await manager.query('UPDATE squad_save_blobs SET ref_count=?,pending_delete_at=?,gc_in_progress=0 WHERE id=?', [next, pending, blobId]);
  }

  private async audit(manager: EntityManager, userId: number, action: string, details: Record<string, unknown>, actor: SquadActor): Promise<void> {
    const body = { ...details, client_id: actor.clientId || null, request_id: actor.requestId || null };
    // target_id 是 INT，而小队 ID 是 UUID；ID 放入 details，避免严格模式下
    // 审计插入失败回滚业务事务。
    await manager.query(`INSERT INTO operation_logs (user_id,action,target_type,target_id,details,ip_address,user_agent,created_at)
      VALUES (?,?, 'squad', NULL, ?, ?, ?, NOW())`, [
      userId, action, JSON.stringify(body), actor.ip || null, (actor.userAgent || '').slice(0, 1000) || null,
    ]);
  }
}
