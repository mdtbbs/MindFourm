import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { SettingsService } from '../settings/settings.service';
import {
  broadcastSquadEvent, isManagerRole, listActiveMemberIds, requireActiveSquad, requireSlot, squadFail,
} from './squad-access';

/** 150 秒 = 90 秒心跳租期 + 60 秒宽限（D05）。 */
export const SQUAD_SAVE_LEASE_TTL_MS = 150_000;

export type SquadSaveLeaseRow = {
  slot_id: string;
  lease_id: string;
  holder_user_id: number;
  holder_client_id: string;
  multiplayer_session_id: string | null;
  fencing_token: string;
  previous_holder_user_id: number | null;
  previous_fencing_token: string | null;
  status: 'active' | 'released' | 'expired';
  acquired_at: Date;
  last_heartbeat_at: Date;
  expires_at: Date;
};

export type SquadSaveRef = {
  squad_id: string;
  slot_id: string;
  fencing_token: number;
  lanlink_room_code?: string;
};

@Injectable()
export class SquadLeaseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeEventsService,
    private readonly settings: SettingsService,
  ) {}

  private assertEnabled(): void {
    if (this.settings.getCached('squad_saves_enabled') !== 'true') {
      squadFail('SQUADS_DISABLED', HttpStatus.FORBIDDEN, '小队共享存档功能尚未启用。');
    }
    if (this.settings.getCached('cloud_saves_enabled') !== 'true') {
      squadFail('CLOUD_SAVES_DISABLED', HttpStatus.FORBIDDEN, '云存档功能尚未启用。');
    }
  }

  private nowMs(): number { return Date.now(); }

  private publicLease(row: SquadSaveLeaseRow) {
    return {
      slot_id: row.slot_id,
      lease_id: row.lease_id,
      holder_user_id: Number(row.holder_user_id),
      holder_client_id: row.holder_client_id,
      multiplayer_session_id: row.multiplayer_session_id ?? null,
      fencing_token: Number(row.fencing_token),
      previous_holder_user_id: row.previous_holder_user_id == null ? null : Number(row.previous_holder_user_id),
      previous_fencing_token: row.previous_fencing_token == null ? null : Number(row.previous_fencing_token),
      status: row.status,
      acquired_at: row.acquired_at,
      last_heartbeat_at: row.last_heartbeat_at,
      expires_at: row.expires_at,
    };
  }

  async getStatus(userId: number, squadId: string, slotId: string) {
    this.assertEnabled();
    await requireActiveSquad(this.dataSource, squadId, userId);
    await requireSlot(this.dataSource, squadId, slotId);
    const rows = await this.dataSource.query('SELECT * FROM squad_save_leases WHERE slot_id=? LIMIT 1', [slotId]);
    const row = Array.isArray(rows) && rows.length ? rows[0] as SquadSaveLeaseRow : null;
    const active = row?.status === 'active' && new Date(row.expires_at).getTime() > this.nowMs();
    return {
      slot_id: slotId,
      lease: active ? this.publicLease(row) : null,
      held_by_me: Boolean(active && Number(row.holder_user_id) === userId),
    };
  }

  /**
   * 抢占 / 接力写租约。
   *
   * - 无记录、已释放或自然过期：任意活跃成员可直接获得，token 单调 +1；
   * - 未过期：返回 409 `SQUAD_SAVE_LEASE_HELD` 并附带当前房主信息，客户端可
   *   直接展示“一键加入”；只有 owner/admin 能 `force_takeover`。
   */
  async acquire(userId: number, clientId: string, squadId: string, slotId: string, body: any) {
    this.assertEnabled();
    const forceTakeover = body?.force_takeover === true;
    const result = await this.dataSource.transaction(async manager => {
      const { member } = await requireActiveSquad(manager, squadId, userId);
      const slot = await requireSlot(manager, squadId, slotId, { forUpdate: true });
      const rows = await manager.query('SELECT * FROM squad_save_leases WHERE slot_id=? FOR UPDATE', [slotId]);
      const previous = Array.isArray(rows) && rows.length ? rows[0] as SquadSaveLeaseRow : null;
      const now = new Date();
      const previousActive = Boolean(previous && previous.status === 'active' && new Date(previous.expires_at).getTime() > now.getTime());

      if (previousActive) {
        if (!forceTakeover) {
          const details = [{
            holder_user_id: Number(previous!.holder_user_id),
            fencing_token: Number(previous!.fencing_token),
            multiplayer_session_id: previous!.multiplayer_session_id ?? null,
            lanlink_room_code: slot.lanlink_room_code ?? null,
            expires_at: previous!.expires_at,
          }];
          squadFail('SQUAD_SAVE_LEASE_HELD', HttpStatus.CONFLICT,
            '该存档槽当前由其他房主持有；可加入对方房间，或由队长/管理员强制接管。', false, details);
        }
        if (!isManagerRole(member.role)) {
          squadFail('SQUAD_TAKEOVER_FORBIDDEN', HttpStatus.FORBIDDEN, '只有队长或管理员可以强制接管未过期的租约。');
        }
      }

      const fencingToken = previous ? Number(previous.fencing_token) + 1 : 1;
      const leaseId = randomUUID();
      const expiresAt = new Date(now.getTime() + SQUAD_SAVE_LEASE_TTL_MS);
      if (previous) {
        await manager.query(
          `UPDATE squad_save_leases
              SET lease_id=?, holder_user_id=?, holder_client_id=?, multiplayer_session_id=NULL,
                  fencing_token=?, previous_holder_user_id=?, previous_fencing_token=?,
                  status='active', acquired_at=?, last_heartbeat_at=?, expires_at=?
            WHERE slot_id=?`,
          [
            leaseId, userId, clientId.slice(0, 128), fencingToken,
            previous.holder_user_id, previous.fencing_token,
            now, now, expiresAt, slotId,
          ],
        );
      } else {
        await manager.query(
          `INSERT INTO squad_save_leases
            (slot_id,lease_id,holder_user_id,holder_client_id,multiplayer_session_id,fencing_token,status,acquired_at,last_heartbeat_at,expires_at)
           VALUES (?,?,?,?,NULL,?,'active',?,?,?)`,
          [slotId, leaseId, userId, clientId.slice(0, 128), fencingToken, now, now, expiresAt],
        );
      }
      await manager.query('UPDATE squad_save_slots SET active_session_id=NULL, lanlink_room_code=NULL, updated_at=NOW() WHERE id=?', [slotId]);
      return {
        lease: {
          slot_id: slotId, lease_id: leaseId, holder_user_id: userId, holder_client_id: clientId.slice(0, 128),
          multiplayer_session_id: null, fencing_token: fencingToken,
          previous_holder_user_id: previous ? Number(previous.holder_user_id) : null,
          previous_fencing_token: previous ? Number(previous.fencing_token) : null,
          status: 'active' as const, acquired_at: now, last_heartbeat_at: now, expires_at: expiresAt,
        },
        previous_holder_user_id: previousActive ? Number(previous!.holder_user_id) : null,
        previous_lease_id: previousActive ? previous!.lease_id : null,
        taken_over: previousActive,
        memberIds: await listActiveMemberIds(manager, squadId),
      };
    });
    const { memberIds, ...response } = result;
    await broadcastSquadEvent(this.realtime, memberIds,
      response.taken_over ? 'squad_save.lease_taken_over' : 'squad_save.lease_acquired', {
        squad_id: squadId,
        slot_id: slotId,
        lease_id: response.lease.lease_id,
        holder_user_id: userId,
        previous_holder_user_id: response.previous_holder_user_id,
        fencing_token: response.lease.fencing_token,
        expires_at: response.lease.expires_at,
      });
    if (response.taken_over && response.previous_holder_user_id && !memberIds.includes(response.previous_holder_user_id)) {
      await this.realtime.emitUser(response.previous_holder_user_id, 'squad_save.lease_taken_over', {
        squad_id: squadId, slot_id: slotId, lease_id: response.lease.lease_id,
        holder_user_id: userId, previous_holder_user_id: response.previous_holder_user_id,
        fencing_token: response.lease.fencing_token, expires_at: response.lease.expires_at,
      }).catch(() => null);
    }
    return {
      lease: response.lease,
      taken_over: response.taken_over,
      previous_holder_user_id: response.previous_holder_user_id,
      previous_lease_id: response.previous_lease_id,
    };
  }

  /** 心跳续期：只有当前持有者、且 token 未被接管时可以续期。 */
  async renew(userId: number, clientId: string, squadId: string, slotId: string, body: any) {
    this.assertEnabled();
    const fencingToken = Number(body?.fencing_token);
    if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
      squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, 'fencing_token 无效。');
    }
    return this.dataSource.transaction(async manager => {
      await requireActiveSquad(manager, squadId, userId);
      await requireSlot(manager, squadId, slotId, { forUpdate: true });
      const lease = await this.lockLease(manager, slotId);
      if (!this.isHeldBy(lease, userId, fencingToken)) {
        squadFail('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT, '租约已失效或已被其他房主接管，请重新获取。');
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SQUAD_SAVE_LEASE_TTL_MS);
      await manager.query(
        'UPDATE squad_save_leases SET last_heartbeat_at=?, expires_at=?, holder_client_id=? WHERE slot_id=?',
        [now, expiresAt, clientId.slice(0, 128), slotId],
      );
      return {
        slot_id: slotId,
        lease_id: lease!.lease_id,
        fencing_token: Number(lease!.fencing_token),
        expires_at: expiresAt,
        heartbeat_interval_seconds: 90,
      };
    });
  }

  async release(userId: number, squadId: string, slotId: string, fencingToken: number | undefined) {
    this.assertEnabled();
    const result = await this.dataSource.transaction(async manager => {
      await requireActiveSquad(manager, squadId, userId);
      await requireSlot(manager, squadId, slotId, { forUpdate: true });
      const lease = await this.lockLease(manager, slotId);
      if (!lease || lease.status !== 'active' || Number(lease.holder_user_id) !== userId) {
        squadFail('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT, '你没有持有该存档槽的租约。');
      }
      if (fencingToken != null && Number(lease.fencing_token) !== fencingToken) {
        squadFail('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT, 'fencing_token 与当前租约不一致。');
      }
      await manager.query("UPDATE squad_save_leases SET status='released', multiplayer_session_id=NULL WHERE slot_id=?", [slotId]);
      await manager.query('UPDATE squad_save_slots SET active_session_id=NULL, lanlink_room_code=NULL, updated_at=NOW() WHERE id=?', [slotId]);
      return {
        lease_id: lease.lease_id, fencing_token: Number(lease.fencing_token),
        memberIds: await listActiveMemberIds(manager, squadId),
      };
    });
    const { memberIds, ...response } = result;
    await broadcastSquadEvent(this.realtime, memberIds, 'squad_save.lease_released', {
      squad_id: squadId, slot_id: slotId, lease_id: response.lease_id,
      holder_user_id: userId, fencing_token: response.fencing_token,
    });
    return { slot_id: slotId, lease_id: response.lease_id, released: true };
  }

  /**
   * 校验 fencing_token 并返回租约行；调用方必须已开启事务。
   *
   * 先锁槽位行再锁租约行，与 acquire/renew/release 保持同一加锁顺序。
   */
  async assertFencing(manager: EntityManager, squadId: string, slotId: string, userId: number, fencingToken: number): Promise<SquadSaveLeaseRow> {
    await requireSlot(manager, squadId, slotId, { forUpdate: true });
    const lease = await this.lockLease(manager, slotId);
    if (!this.isHeldBy(lease, userId, fencingToken)) {
      squadFail('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT,
        '租约已失效或已被其他房主接管；可改用 mode="conflict_rescue" 保存为冲突分支。');
    }
    return lease!;
  }

  /**
   * 冲突救援校验：只允许当前持有者，或最近一次被接管的原持有者。
   *
   * 仅按“token 小于当前值”放行会让任意活跃成员用一个很小的 token 绕过写
   * 租约，无限写入永不自动裁剪的 conflict 分支并消耗创建者配额。这里改为
   * 核对租约行记录的上一次持有者与 token：只有真正被接管的那位旧房主能
   * 用自己当时的 token 保存本地内容。
   */
  async assertSupersededFencing(manager: EntityManager, squadId: string, slotId: string, userId: number, fencingToken: number): Promise<SquadSaveLeaseRow> {
    await requireSlot(manager, squadId, slotId, { forUpdate: true });
    const lease = await this.lockLease(manager, slotId);
    if (!lease) {
      squadFail('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT, '该存档槽从未建立写租约，不能提交冲突分支。');
    }
    const currentToken = Number(lease!.fencing_token);
    const isCurrentHolder = lease!.status === 'active' && Number(lease!.holder_user_id) === userId
      && Number(lease!.fencing_token) === fencingToken && new Date(lease!.expires_at).getTime() > this.nowMs();
    const isPreviousHolder = Number(lease!.previous_holder_user_id) === userId
      && Number(lease!.previous_fencing_token) === fencingToken
      && fencingToken < currentToken;
    if (isCurrentHolder || isPreviousHolder) return lease!;
    squadFail('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT,
      '只有当前持有者或最近一次被接管的原持有者可以保存冲突分支。');
  }

  /**
   * 上传暂存要求调用者当前持有租约：暂存内容会占用创建者配额，不能由
   * 已经失去写权限的旧房主继续灌入。`conflict_rescue` 提交只复用已暂存的
   * ready 内容，因此不需要在这里放行过期 token。
   */
  async assertHeld(manager: EntityManager, slotId: string, userId: number): Promise<SquadSaveLeaseRow> {
    const rows = await manager.query('SELECT * FROM squad_save_leases WHERE slot_id=? FOR UPDATE', [slotId]);
    const lease = Array.isArray(rows) && rows.length ? rows[0] as SquadSaveLeaseRow : null;
    if (!lease || lease.status !== 'active' || Number(lease.holder_user_id) !== userId
      || new Date(lease.expires_at).getTime() <= this.nowMs()) {
      squadFail('SQUAD_SAVE_LEASE_REQUIRED', HttpStatus.CONFLICT, '请先获取该存档槽的写租约再上传文件。');
    }
    return lease;
  }

  /**
   * 把多人联机会话绑定到租约与槽位（`active_session_id` 回填）。
   * 由 `POST /api/v1/multiplayer/sessions` 带 `squad_save_ref` 时调用。
   */
  async bindMultiplayerSession(manager: EntityManager, userId: number, ref: SquadSaveRef, sessionId: string): Promise<void> {
    this.assertEnabled();
    await requireActiveSquad(manager, ref.squad_id, userId);
    const lease = await this.assertFencing(manager, ref.squad_id, ref.slot_id, userId, ref.fencing_token);
    await manager.query('UPDATE squad_save_leases SET multiplayer_session_id=? WHERE slot_id=?', [sessionId, ref.slot_id]);
    // 房间码只用于让其他成员“一键加入当前房主房间”，不参与任何授权判断。
    const roomCode = typeof ref.lanlink_room_code === 'string' && ref.lanlink_room_code.trim()
      ? ref.lanlink_room_code.trim().slice(0, 16) : null;
    await manager.query(
      'UPDATE squad_save_slots SET active_session_id=?, lanlink_room_code=COALESCE(?, lanlink_room_code), updated_at=NOW() WHERE id=?',
      [sessionId, roomCode, ref.slot_id],
    );
    void lease;
  }

  /**
   * 多人会话结束时清除槽位上的“当前房主房间”指针，避免其他成员按已关闭
   * 的 session/房间码尝试加入。租约本身不受影响（房主可继续保存）。
   */
  async clearSessionBinding(sessionId: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE squad_save_leases SET multiplayer_session_id=NULL WHERE multiplayer_session_id=?',
      [sessionId],
    );
    await this.dataSource.query(
      'UPDATE squad_save_slots SET active_session_id=NULL, lanlink_room_code=NULL, updated_at=NOW() WHERE active_session_id=?',
      [sessionId],
    );
  }

  async assertLeaseHolder(userId: number, ref: SquadSaveRef): Promise<void> {
    this.assertEnabled();
    await this.dataSource.transaction(async manager => {
      await requireActiveSquad(manager, ref.squad_id, userId);
      await this.assertFencing(manager, ref.squad_id, ref.slot_id, userId, ref.fencing_token);
    });
  }

  private async lockLease(manager: EntityManager, slotId: string): Promise<SquadSaveLeaseRow | null> {
    const rows = await manager.query('SELECT * FROM squad_save_leases WHERE slot_id=? FOR UPDATE', [slotId]);
    return Array.isArray(rows) && rows.length ? rows[0] as SquadSaveLeaseRow : null;
  }

  private isHeldBy(lease: SquadSaveLeaseRow | null, userId: number, fencingToken: number): boolean {
    return Boolean(lease && lease.status === 'active'
      && Number(lease.holder_user_id) === userId
      && Number(lease.fencing_token) === fencingToken
      && new Date(lease.expires_at).getTime() > this.nowMs());
  }
}
