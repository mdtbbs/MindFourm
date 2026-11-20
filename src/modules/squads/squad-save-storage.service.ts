import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CloudSaveStorageService } from '../game-saves/cloud-save-storage.service';
import { getSaveQuotaUsage, lockBillingUser } from '../game-saves/save-quota';
import {
  normalizeHashList, normalizeManifest, normalizeSaveMetadata,
} from '../game-saves/game-save-validation';
import {
  broadcastSquadEvent, listActiveMemberIds, lockSquadOwner, requireActiveSquad, requireManager, requireSlot,
  squadFail,
} from './squad-access';
import { SquadLeaseService } from './squad-lease.service';

/** GFS 分层保留：最近 10 个主链快照 + 过去 7 个自然日每天最后一个（D06）。 */
export const SQUAD_GFS_RECENT = 10;
export const SQUAD_GFS_DAILY_DAYS = 7;
export const SQUAD_PIN_LIMIT = 10;
const BLOB_UPLOAD_TTL_MS = 10 * 60 * 1000;

type SquadSaveActor = {
  clientId?: string;
  deviceId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type SnapshotRow = {
  id: string;
  slot_id: string;
  squad_id: string;
  revision: number | string;
  parent_snapshot_id: string | null;
  uploader_user_id: number;
  fencing_token: string;
  branch_type: 'main' | 'conflict';
  retention_tier: 'recent' | 'daily' | 'pinned' | 'conflict';
  format: string;
  manifest_file_count: number | string;
  sha256: string;
  size_bytes: string;
  game_version: string | null;
  game_build: number | null;
  map_name: string | null;
  wave: number | null;
  playtime_seconds: number | string | null;
  mods_manifest_json: unknown;
  mods_manifest_hash: string | null;
  reason: string;
  pinned: boolean | number;
  created_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class SquadSaveStorageService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly storage: CloudSaveStorageService,
    private readonly lease: SquadLeaseService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  // ---------------------------------------------------------------- 查询

  async listSnapshots(userId: number, squadId: string, slotId: string) {
    this.assertEnabled();
    const { squad } = await requireActiveSquad(this.dataSource, squadId, userId);
    const slot = await requireSlot(this.dataSource, squadId, slotId);
    const rows = await this.dataSource.query(
      `SELECT * FROM squad_save_snapshots WHERE slot_id=? AND deleted_at IS NULL ORDER BY revision DESC LIMIT 500`,
      [slotId],
    );
    return {
      slot: this.shapeSlot(slot, squad),
      snapshots: (Array.isArray(rows) ? rows : []).map((row: any) => this.shapeSnapshot(row, slot)),
    };
  }

  async getSlot(userId: number, squadId: string, slotId: string) {
    this.assertEnabled();
    const { squad } = await requireActiveSquad(this.dataSource, squadId, userId);
    const slot = await requireSlot(this.dataSource, squadId, slotId);
    const head = slot.head_snapshot_id
      ? (await this.dataSource.query('SELECT * FROM squad_save_snapshots WHERE id=? AND deleted_at IS NULL LIMIT 1', [slot.head_snapshot_id]))[0] || null
      : null;
    const rows = await this.dataSource.query('SELECT * FROM squad_save_leases WHERE slot_id=? LIMIT 1', [slotId]);
    const leaseRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    const leaseActive = Boolean(leaseRow && leaseRow.status === 'active' && new Date(leaseRow.expires_at).getTime() > Date.now());
    const publicSlot = this.shapeSlot(slot, squad);
    if (!leaseActive) {
      publicSlot.active_session_id = null;
      publicSlot.lanlink_room_code = null;
    }
    return {
      slot: publicSlot,
      head: head ? this.shapeSnapshot(head, slot) : null,
      lease: leaseActive ? {
        holder_user_id: Number(leaseRow.holder_user_id),
        holder_client_id: leaseRow.holder_client_id,
        fencing_token: Number(leaseRow.fencing_token),
        expires_at: leaseRow.expires_at,
        multiplayer_session_id: leaseRow.multiplayer_session_id ?? null,
      } : null,
      pinned_count: Number((await this.dataSource.query(
        'SELECT COUNT(*) AS count FROM squad_save_snapshots WHERE slot_id=? AND deleted_at IS NULL AND pinned=1',
        [slotId],
      ))[0]?.count || 0),
    };
  }

  async getManifest(userId: number, squadId: string, slotId: string, snapshotId: string) {
    this.assertEnabled();
    await requireActiveSquad(this.dataSource, squadId, userId);
    await requireSlot(this.dataSource, squadId, slotId);
    const snapshot = await this.findLiveSnapshot(this.dataSource, slotId, snapshotId);
    const files = await this.dataSource.query(
      'SELECT file_path,size_bytes,sha256 FROM squad_save_snapshot_files WHERE snapshot_id=? ORDER BY file_path ASC',
      [snapshotId],
    );
    const mods = parseJson(snapshot.mods_manifest_json);
    return {
      format: snapshot.format || 'manifest_v1',
      snapshot_id: snapshotId,
      revision: Number(snapshot.revision),
      branch_type: snapshot.branch_type,
      sha256: snapshot.sha256,
      size: Number(snapshot.size_bytes),
      files: (Array.isArray(files) ? files : []).map((file: any) => ({
        path: file.file_path, size: Number(file.size_bytes), sha256: file.sha256,
      })),
      game: { version: snapshot.game_version ?? null, build: snapshot.game_build ?? null },
      save: {
        map_name: snapshot.map_name ?? null,
        wave: snapshot.wave ?? null,
        playtime_seconds: snapshot.playtime_seconds == null ? null : Number(snapshot.playtime_seconds),
      },
      mods: Array.isArray(mods) ? mods : [],
      created_at: snapshot.created_at,
    };
  }

  // ------------------------------------------------------------ 差量上传

  /**
   * 差量预检严格限制在当前 `squad_id`。
   *
   * 这条边界就是物理隔离的意义：成员只能知道本小队持有哪些内容，永远不能
   * 借哈希查询探测创建者个人 `game_save_blobs` 里的文件。
   */
  async checkBlobs(userId: number, squadId: string, slotId: string, body: any) {
    this.assertEnabled();
    await requireActiveSquad(this.dataSource, squadId, userId);
    await requireSlot(this.dataSource, squadId, slotId);
    const hashes = normalizeHashList(body?.sha256, this.number('maxManifestFiles', 5000));
    if (!hashes.length) return { exists: [], missing: [] };
    const marks = hashes.map(() => '?').join(',');
    const blobs = await this.dataSource.query(
      `SELECT DISTINCT sha256 FROM squad_save_blobs
        WHERE squad_id=? AND sha256 IN (${marks})
          AND (ref_count>0 OR (pending_delete_at IS NOT NULL AND pending_delete_at>NOW()))`,
      [squadId, ...hashes],
    );
    const uploads = await this.dataSource.query(
      `SELECT DISTINCT sha256 FROM squad_save_blob_uploads
        WHERE squad_id=? AND sha256 IN (${marks}) AND status='ready' AND expires_at>NOW()`,
      [squadId, ...hashes],
    );
    const exists = new Set([...(Array.isArray(blobs) ? blobs : []), ...(Array.isArray(uploads) ? uploads : [])]
      .map((row: any) => String(row.sha256)));
    return {
      exists: hashes.filter((hash) => exists.has(hash)),
      missing: hashes.filter((hash) => !exists.has(hash)),
    };
  }

  async createBlobUpload(userId: number, squadId: string, slotId: string, body: any, actor: SquadSaveActor) {
    this.assertEnabled();
    const sha256 = String(body?.sha256 || '');
    if (!/^[a-f0-9]{64}$/.test(sha256)) squadFail('SQUAD_SAVE_INVALID_HASH', HttpStatus.BAD_REQUEST, 'SHA-256 格式无效。');
    const size = Number(body?.size);
    const maxFile = this.number('maxFileBytes', 52428800);
    if (!Number.isSafeInteger(size) || size <= 0) squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '文件大小无效。');
    if (size > maxFile) squadFail('SQUAD_SAVE_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '存档文件超过单文件大小限制。');

    return this.dataSource.transaction(async manager => {
      const { squad } = await requireActiveSquad(manager, squadId, userId);
      // 锁顺序固定为 billing user → slot → lease；多联机会话绑定（users→slot）
      // 与快照提交共用同一顺序，避免同一房主并发建房/提交时互相死锁。
      const ownerUserId = Number(squad.owner_user_id);
      await lockBillingUser(manager, ownerUserId);
      await lockSquadOwner(manager, squadId, ownerUserId);
      await requireSlot(manager, squadId, slotId, { forUpdate: true });
      const lease = await this.lease.assertHeld(manager, slotId, userId);

      const existing = await manager.query(
        `SELECT id,gc_in_progress,ref_count,object_key FROM squad_save_blobs
          WHERE squad_id=? AND sha256=? AND size_bytes=?
            AND (ref_count>0 OR (pending_delete_at IS NOT NULL AND pending_delete_at>NOW())) LIMIT 1 FOR UPDATE`,
        [squadId, sha256, String(size)],
      );
      if (Array.isArray(existing) && existing.length) {
        if (existing[0].gc_in_progress) {
          squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存储清理正在处理此内容，请稍后重试。', true);
        }
        const info = await this.storage.statObject(existing[0].object_key).catch(() => null);
        if (info?.exists && info.size_bytes === size) return { no_upload_required: true, sha256, size };
        if (Number(existing[0].ref_count) > 0) {
          squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '小队存档存储中的文件缺失，请联系管理员。', true);
        }
        await manager.query('DELETE FROM squad_save_blobs WHERE id=? AND ref_count=0', [existing[0].id]);
      }

      const ready = await manager.query(
        `SELECT id,object_key FROM squad_save_blob_uploads
          WHERE squad_id=? AND sha256=? AND size_bytes=? AND status='ready' AND expires_at>NOW()
          ORDER BY created_at LIMIT 1 FOR UPDATE`,
        [squadId, sha256, String(size)],
      );
      if (Array.isArray(ready) && ready.length) {
        const info = await this.storage.statObject(ready[0].object_key).catch(() => null);
        if (info?.exists && info.size_bytes === size) return { no_upload_required: true, sha256, size };
        await manager.query("UPDATE squad_save_blob_uploads SET status='expired' WHERE id=? AND status='ready'", [ready[0].id]);
      }

      // 新会话尚未落库，不排除任何暂存：同内容已暂存时按两份预留偏保守，
      // 提交时只会晋升一份，另一个会话到期后由维护任务清理。
      const usage = await getSaveQuotaUsage(manager, ownerUserId);
      if (usage.used_bytes + size > this.quotaLimitBytes) {
        this.ownerQuotaExceeded(ownerUserId, userId, usage.used_bytes, usage.used_bytes + size);
      }

      const uploadId = randomUUID();
      const objectKey = `cloud-saves/${ownerUserId}/${randomUUID()}`;
      const expiresAt = new Date(Date.now() + BLOB_UPLOAD_TTL_MS);
      await manager.query(
        `INSERT INTO squad_save_blob_uploads
          (id,squad_id,billing_user_id,uploader_user_id,lease_id,sha256,size_bytes,object_key,status,expires_at)
         VALUES (?,?,?,?,?,?,?,?,'pending',?)`,
        [uploadId, squadId, ownerUserId, userId, lease.lease_id, sha256, String(size), objectKey, expiresAt],
      );
      await this.audit(manager, userId, 'squad.blob.upload.create', {
        squad_id: squadId, slot_id: slotId, upload_id: uploadId, sha256, size_bytes: size,
      }, actor);
      return {
        upload_id: uploadId,
        upload: {
          method: 'PUT',
          url: `/api/v1/squads/${encodeURIComponent(squadId)}/blobs/uploads/${encodeURIComponent(uploadId)}/file`,
          headers: { 'Content-Type': 'application/octet-stream' },
          expires_at: expiresAt.toISOString(),
        },
      };
    });
  }

  async receiveBlobUpload(userId: number, squadId: string, uploadId: string, source: NodeJS.ReadableStream, actor: SquadSaveActor) {
    this.assertEnabled();
    await requireActiveSquad(this.dataSource, squadId, userId);
    const rows = await this.dataSource.query(
      'SELECT * FROM squad_save_blob_uploads WHERE id=? AND squad_id=? AND uploader_user_id=? LIMIT 1',
      [uploadId, squadId, userId],
    );
    if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_UPLOAD_NOT_FOUND', HttpStatus.NOT_FOUND, '上传会话不存在。');
    const session = rows[0];
    if (session.status === 'ready') {
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        squadFail('SQUAD_SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
      }
      return { upload_id: uploadId, uploaded: true, size_bytes: Number(session.size_bytes), sha256: session.sha256, status: 'ready' };
    }
    if (session.status !== 'pending' || new Date(session.expires_at).getTime() <= Date.now()) {
      squadFail('SQUAD_SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    }
    // 会话创建时持有租约并不代表现在仍持有：被强制接管或自然过期后，
    // 旧房主不能继续向创建者配额里写入暂存字节。
    const leaseRows = await this.dataSource.query(
      'SELECT holder_user_id,status,expires_at FROM squad_save_leases WHERE lease_id=? LIMIT 1',
      [session.lease_id],
    );
    const activeLease = Array.isArray(leaseRows) ? leaseRows[0] : null;
    if (!activeLease || activeLease.status !== 'active' || Number(activeLease.holder_user_id) !== userId
      || new Date(activeLease.expires_at).getTime() <= Date.now()) {
      squadFail('SQUAD_SAVE_LEASE_REQUIRED', HttpStatus.CONFLICT, '写租约已失效，不能再上传暂存文件。');
    }
    try {
      await this.storage.writeObject(
        session.object_key, source as any, Number(session.size_bytes), String(session.sha256), this.number('maxFileBytes', 52428800),
      );
    } catch (error: any) {
      const code = error?.code;
      if (code === 'SAVE_FILE_TOO_LARGE') squadFail('SQUAD_SAVE_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '存档文件超过单文件大小限制。');
      if (code === 'SAVE_UPLOAD_SIZE_MISMATCH') squadFail('SQUAD_SAVE_SIZE_MISMATCH', HttpStatus.CONFLICT, '上传文件大小与声明不一致。');
      if (code === 'SAVE_UPLOAD_CHECKSUM_MISMATCH') squadFail('SQUAD_SAVE_CHECKSUM_MISMATCH', HttpStatus.CONFLICT, '上传文件 SHA-256 与声明不一致。');
      squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '无法写入存档存储目录。', true);
    }
    const update = await this.dataSource.query(
      "UPDATE squad_save_blob_uploads SET status='ready' WHERE id=? AND squad_id=? AND status='pending' AND expires_at>NOW()",
      [uploadId, squadId],
    );
    if (!update.affectedRows) {
      const currentRows = await this.dataSource.query(
        'SELECT status,size_bytes,sha256 FROM squad_save_blob_uploads WHERE id=? AND squad_id=? LIMIT 1',
        [uploadId, squadId],
      );
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (current && ['ready', 'committed'].includes(current.status)) {
        return { upload_id: uploadId, uploaded: true, size_bytes: Number(current.size_bytes), sha256: current.sha256, status: 'ready' };
      }
      await this.storage.deleteObject(session.object_key).catch(() => undefined);
      squadFail('SQUAD_SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    }
    await this.audit(this.dataSource.manager, userId, 'squad.blob.upload.received', {
      squad_id: squadId, upload_id: uploadId, size_bytes: Number(session.size_bytes), sha256: session.sha256,
    }, actor);
    return { upload_id: uploadId, uploaded: true, size_bytes: Number(session.size_bytes), sha256: session.sha256, status: 'ready' };
  }

  // -------------------------------------------------------------- 快照提交

  /**
   * 提交共享存档快照。
   *
   * 主链提交必须持有当前 fencing_token；token 过期返回 409
   * `SQUAD_SAVE_LEASE_STALE`。旧房主可以改用 `mode="conflict_rescue"` 把
   * 本地内容保存为 `branch_type='conflict'` 分支，既不推进 head 也不丢档。
   */
  async commitSnapshot(userId: number, squadId: string, slotId: string, body: any, actor: SquadSaveActor) {
    this.assertEnabled();
    const manifest = normalizeManifest(
      body?.manifest,
      this.number('maxManifestFiles', 5000),
      this.number('maxFileBytes', 52428800),
      this.number('fileManifestMaxBytes', 1048576),
    );
    const metadata = normalizeSaveMetadata({
      game: body?.game ?? body?.manifest?.game,
      save: body?.save ?? body?.manifest?.save,
      mods: body?.mods ?? body?.manifest?.mods,
    }, this.number('maxMods', 100), this.number('maxManifestBytes', 16384));
    const mode = body?.mode === 'conflict_rescue' ? 'conflict_rescue' : 'normal';
    const branchType: 'main' | 'conflict' = mode === 'conflict_rescue' ? 'conflict' : 'main';
    const fencingToken = Number(body?.fencing_token);
    if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
      squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, 'fencing_token 无效。');
    }
    const baseId = body?.base_snapshot_id || null;
    const reason = ['manual', 'before_launch', 'after_exit', 'periodic', 'restore', 'conflict', 'import'].includes(body?.reason)
      ? body.reason : 'manual';
    const deviceId = boundedOpaque(body?.device_id) || boundedOpaque(actor.deviceId);

    const result = await this.dataSource.transaction(async manager => {
      const { squad } = await requireActiveSquad(manager, squadId, userId);
      const ownerUserId = Number(squad.owner_user_id);
      // 先锁创建者（计费用户）再锁小队、槽位与租约，与转让接受（users → squad）
      // 和多联机会话绑定保持同一顺序；若期间队长已切换则返回可重试错误。
      await lockBillingUser(manager, ownerUserId);
      await lockSquadOwner(manager, squadId, ownerUserId);
      const slot = await requireSlot(manager, squadId, slotId, { forUpdate: true });
      if (branchType === 'main') {
        await this.lease.assertFencing(manager, squadId, slotId, userId, fencingToken);
      } else {
        await this.lease.assertSupersededFencing(manager, squadId, slotId, userId, fencingToken);
      }
      const headRows = slot.head_snapshot_id
        ? await manager.query('SELECT * FROM squad_save_snapshots WHERE id=? AND deleted_at IS NULL LIMIT 1', [slot.head_snapshot_id])
        : [];
      const head = Array.isArray(headRows) && headRows.length ? headRows[0] as SnapshotRow : null;

      if (branchType === 'conflict' && baseId) {
        const baseRows = await manager.query(
          'SELECT id FROM squad_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL LIMIT 1',
          [baseId, slotId],
        );
        if (!Array.isArray(baseRows) || !baseRows.length) {
          squadFail('SQUAD_SAVE_BASE_SNAPSHOT_INVALID', HttpStatus.CONFLICT, '基准快照不属于该存档槽或已删除。');
        }
      }
      if (branchType === 'main') {
        if ((head?.id || null) !== baseId) {
          squadFail('SQUAD_SAVE_CONFLICT', HttpStatus.CONFLICT, '共享存档自上次同步后已有更新。', false, [{
            base_snapshot_id: baseId, head_snapshot_id: head?.id || null,
          }]);
        }
        // 内容未变化时不烧 revision，直接回放 head 摘要。
        if (head && head.sha256 === manifest.manifest_hash && head.format === 'manifest_v1') {
          return {
            ...this.shapeSnapshot(head, slot), no_changes: true,
            memberIds: await listActiveMemberIds(manager, squadId), pruned: [] as string[],
          };
        }
      }

      const unique = new Map<string, { sha256: string; size: number }>();
      for (const file of manifest.files) unique.set(`${file.sha256}:${file.size}`, file);
      const resolved = new Map<string, string>();
      let newBytes = 0;
      for (const file of unique.values()) {
        const blobRows = await manager.query(
          'SELECT id,ref_count,gc_in_progress,object_key FROM squad_save_blobs WHERE squad_id=? AND sha256=? AND size_bytes=? FOR UPDATE',
          [squadId, file.sha256, String(file.size)],
        );
        if (Array.isArray(blobRows) && blobRows.length) {
          if (blobRows[0].gc_in_progress) {
            squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存储清理正在处理此内容，请稍后重试。', true);
          }
          const info = await this.storage.statObject(blobRows[0].object_key).catch(() => null);
          if (!info?.exists || info.size_bytes !== file.size) {
            squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '小队存档存储中的文件缺失，请重新上传。', true);
          }
          if (Number(blobRows[0].ref_count) === 0) newBytes += file.size;
          resolved.set(`${file.sha256}:${file.size}`, String(blobRows[0].id));
          continue;
        }
        // 暂存表没有 storage_provider 列（设计稿亦未包含）；当前实现只写本地
        // 存储，直接用服务实例的 provider。
        const uploadRows = await manager.query(
          `SELECT id,object_key FROM squad_save_blob_uploads
            WHERE squad_id=? AND sha256=? AND size_bytes=? AND status='ready' AND expires_at>NOW()
            ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [squadId, file.sha256, String(file.size)],
        );
        if (!Array.isArray(uploadRows) || !uploadRows.length) {
          squadFail('SQUAD_SAVE_BLOB_MISSING', HttpStatus.CONFLICT, '清单中的文件尚未上传到本小队。', false, [{ sha256: file.sha256, size: file.size }]);
        }
        const info = await this.storage.statObject(uploadRows[0].object_key).catch(() => null);
        if (!info?.exists || info.size_bytes !== file.size) {
          await manager.query("UPDATE squad_save_blob_uploads SET status='expired' WHERE id=? AND status='ready'", [uploadRows[0].id]);
          squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '暂存的小队存档文件缺失，请重新上传。', true);
        }
        const blobId = randomUUID();
        await manager.query(
          `INSERT INTO squad_save_blobs (id,squad_id,billing_user_id,sha256,size_bytes,storage_provider,object_key,ref_count)
           VALUES (?,?,?,?,?,?,?,0)`,
          [blobId, squadId, ownerUserId, file.sha256, String(file.size), this.storage.provider, uploadRows[0].object_key],
        );
        await manager.query("UPDATE squad_save_blob_uploads SET status='committed' WHERE id=?", [uploadRows[0].id]);
        newBytes += file.size;
        resolved.set(`${file.sha256}:${file.size}`, blobId);
      }

      // 配额仍记在创建者名下；非创建者只得到稳定错误码，不泄露剩余字节。
      const usage = await getSaveQuotaUsage(manager, ownerUserId, {
        squads: [...unique.values()].map((file) => ({ squad_id: squadId, sha256: file.sha256, size: file.size })),
      });
      if (usage.used_bytes + newBytes > this.quotaLimitBytes) {
        this.ownerQuotaExceeded(ownerUserId, userId, usage.used_bytes, usage.used_bytes + newBytes);
      }

      const [{ revision }] = await manager.query(
        'SELECT COALESCE(MAX(revision),0)+1 AS revision FROM squad_save_snapshots WHERE slot_id=? FOR UPDATE',
        [slotId],
      );
      const snapshotId = randomUUID();
      const files = manifest.files.map((file) => ({
        path: file.path, size: file.size, sha256: file.sha256, blobId: resolved.get(`${file.sha256}:${file.size}`)!,
      }));
      await manager.query(
        `INSERT INTO squad_save_snapshots
          (id,slot_id,squad_id,revision,parent_snapshot_id,uploader_user_id,fencing_token,branch_type,retention_tier,format,
           manifest_file_count,sha256,size_bytes,game_version,game_build,map_name,wave,playtime_seconds,
           mods_manifest_json,mods_manifest_hash,reason,pinned)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        [
          snapshotId, slotId, squadId, Number(revision), head?.id || baseId || null, userId, fencingToken, branchType,
          branchType === 'conflict' ? 'conflict' : 'recent', 'manifest_v1', files.length, manifest.manifest_hash,
          String(manifest.total_size), metadata.game_version, metadata.game_build, metadata.map_name, metadata.wave,
          metadata.playtime_seconds,
          metadata.mods_manifest_json ? JSON.stringify(metadata.mods_manifest_json) : null,
          metadata.mods_manifest_hash,
          branchType === 'conflict' ? 'conflict' : reason,
        ],
      );
      for (let offset = 0; offset < files.length; offset += 500) {
        const chunk = files.slice(offset, offset + 500);
        const values = chunk.map(() => '(?,?,?,?,?)').join(',');
        const parameters: unknown[] = [];
        for (const file of chunk) parameters.push(snapshotId, file.path, file.blobId, String(file.size), file.sha256);
        await manager.query(
          `INSERT INTO squad_save_snapshot_files (snapshot_id,file_path,blob_id,size_bytes,sha256) VALUES ${values}`,
          parameters,
        );
      }
      for (const blobId of [...new Set(files.map((file) => file.blobId))]) {
        const rows = await manager.query('SELECT id,gc_in_progress FROM squad_save_blobs WHERE id=? FOR UPDATE', [blobId]);
        if (!Array.isArray(rows) || !rows.length) {
          squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '快照文件记录暂不可用。', true);
        }
        if (rows[0].gc_in_progress) {
          squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存储清理正在处理此内容，请稍后重试。', true);
        }
        await manager.query('UPDATE squad_save_blobs SET ref_count=ref_count+1,pending_delete_at=NULL,last_referenced_at=NOW() WHERE id=?', [blobId]);
      }

      if (branchType === 'main') {
        await manager.query(
          'UPDATE squad_save_slots SET head_snapshot_id=?, game_version=?, mods_json=?, active_session_id=?, updated_at=NOW() WHERE id=?',
          [snapshotId, metadata.game_version, metadata.mods_manifest_json ? JSON.stringify(metadata.mods_manifest_json) : null,
            slot.active_session_id ?? null, slotId],
        );
      }
      const pruned = branchType === 'main' ? await this.pruneSlotSnapshots(manager, slotId) : [];
      await this.audit(manager, userId, branchType === 'conflict' ? 'squad.snapshot.conflict' : 'squad.snapshot.commit', {
        squad_id: squadId, slot_id: slotId, snapshot_id: snapshotId, revision: Number(revision),
        branch_type: branchType, file_count: files.length, size_bytes: manifest.total_size, fencing_token: fencingToken,
        pruned_snapshot_ids: pruned,
      }, actor);
      const row: SnapshotRow = {
        id: snapshotId, slot_id: slotId, squad_id: squadId, revision: Number(revision),
        parent_snapshot_id: head?.id || baseId || null, uploader_user_id: userId,
        fencing_token: String(fencingToken), branch_type: branchType,
        retention_tier: branchType === 'conflict' ? 'conflict' : 'recent', format: 'manifest_v1',
        manifest_file_count: files.length, sha256: manifest.manifest_hash, size_bytes: String(manifest.total_size),
        game_version: metadata.game_version, game_build: metadata.game_build, map_name: metadata.map_name,
        wave: metadata.wave, playtime_seconds: metadata.playtime_seconds,
        mods_manifest_json: metadata.mods_manifest_json, mods_manifest_hash: metadata.mods_manifest_hash,
        reason: branchType === 'conflict' ? 'conflict' : reason, pinned: false, created_at: new Date(), deleted_at: null,
      };
      return {
        ...this.shapeSnapshot(row, { ...slot, head_snapshot_id: branchType === 'main' ? snapshotId : slot.head_snapshot_id }),
        no_changes: false,
        memberIds: await listActiveMemberIds(manager, squadId),
        pruned,
      };
    });
    const { memberIds, pruned, ...snapshot } = result;
    if (!snapshot.no_changes) {
      await broadcastSquadEvent(this.realtime, memberIds, 'squad_save.snapshot_committed', {
        squad_id: squadId, slot_id: slotId, snapshot_id: snapshot.id, revision: snapshot.revision,
        branch_type: snapshot.branch_type, uploader_user_id: userId, fencing_token: Number(snapshot.fencing_token),
        head_snapshot_id: snapshot.is_head ? snapshot.id : null,
      });
    }
    return { ...snapshot, pruned_snapshot_ids: pruned };
  }

  // ---------------------------------------------------------- 置顶 / 恢复

  async setPinned(userId: number, squadId: string, slotId: string, snapshotId: string, pinned: boolean, actor: SquadSaveActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      await requireActiveSquad(manager, squadId, userId);
      await requireSlot(manager, squadId, slotId, { forUpdate: true });
      const rows = await manager.query(
        'SELECT id,branch_type,pinned FROM squad_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL FOR UPDATE',
        [snapshotId, slotId],
      );
      if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_SNAPSHOT_NOT_FOUND', HttpStatus.NOT_FOUND, '快照不存在。');
      if (pinned) {
        const [{ count }] = await manager.query(
          'SELECT COUNT(*) AS count FROM squad_save_snapshots WHERE slot_id=? AND deleted_at IS NULL AND pinned=1',
          [slotId],
        );
        if (!rows[0].pinned && Number(count) >= SQUAD_PIN_LIMIT) {
          squadFail('SQUAD_SAVE_PIN_LIMIT_EXCEEDED', HttpStatus.CONFLICT, `每个存档槽最多置顶 ${SQUAD_PIN_LIMIT} 个快照。`);
        }
      }
      const tier = pinned ? 'pinned' : (rows[0].branch_type === 'conflict' ? 'conflict' : 'recent');
      await manager.query('UPDATE squad_save_snapshots SET pinned=?, retention_tier=? WHERE id=?', [pinned ? 1 : 0, tier, snapshotId]);
      await this.audit(manager, userId, 'squad.snapshot.pin', { squad_id: squadId, slot_id: slotId, snapshot_id: snapshotId, pinned }, actor);
      return { id: snapshotId, pinned, retention_tier: tier };
    });
  }

  /**
   * 从历史或冲突分支恢复为主链新版本。
   *
   * 恢复同样推进主链，因此必须持有当前 fencing_token；原快照保留不删除。
   */
  async restore(userId: number, squadId: string, slotId: string, snapshotId: string, body: any, actor: SquadSaveActor) {
    this.assertEnabled();
    const fencingToken = Number(body?.fencing_token);
    if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
      squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, 'fencing_token 无效。');
    }
    const confirmHead = body?.confirm_head_snapshot_id || null;
    const result = await this.dataSource.transaction(async manager => {
      await requireActiveSquad(manager, squadId, userId);
      const slot = await requireSlot(manager, squadId, slotId, { forUpdate: true });
      await this.lease.assertFencing(manager, squadId, slotId, userId, fencingToken);
      if ((slot.head_snapshot_id || null) !== confirmHead) {
        squadFail('SQUAD_SAVE_CONFLICT', HttpStatus.CONFLICT, '主链 head 已变化，请重新读取后再恢复。', false, [{
          head_snapshot_id: slot.head_snapshot_id || null,
        }]);
      }
      const source = await this.findLiveSnapshot(manager, slotId, snapshotId);
      const files = await manager.query(
        'SELECT file_path,size_bytes,sha256,blob_id FROM squad_save_snapshot_files WHERE snapshot_id=? ORDER BY file_path ASC',
        [snapshotId],
      );
      if (!Array.isArray(files) || !files.length) squadFail('SQUAD_SAVE_SNAPSHOT_NOT_FOUND', HttpStatus.NOT_FOUND, '快照文件清单不存在。');
      const [{ revision }] = await manager.query(
        'SELECT COALESCE(MAX(revision),0)+1 AS revision FROM squad_save_snapshots WHERE slot_id=? FOR UPDATE',
        [slotId],
      );
      const newId = randomUUID();
      // mysql2 对 JSON 列返回已解析对象；原始参数必须显式序列化，否则对象
      // 会被驱动转成 "[object Object]" 写坏 JSON 列。
      const restoredMods = typeof source.mods_manifest_json === 'string'
        ? source.mods_manifest_json
        : source.mods_manifest_json ? JSON.stringify(source.mods_manifest_json) : null;
      await manager.query(
        `INSERT INTO squad_save_snapshots
          (id,slot_id,squad_id,revision,parent_snapshot_id,uploader_user_id,fencing_token,branch_type,retention_tier,format,
           manifest_file_count,sha256,size_bytes,game_version,game_build,map_name,wave,playtime_seconds,
           mods_manifest_json,mods_manifest_hash,reason,pinned)
         VALUES (?,?,?,?,?,?,?,'main','recent',?,?,?,?,?,?,?,?,?,?,?,'restore',0)`,
        [
          newId, slotId, squadId, Number(revision), slot.head_snapshot_id || null, userId, fencingToken,
          source.format || 'manifest_v1', files.length, source.sha256, String(source.size_bytes),
          source.game_version, source.game_build, source.map_name, source.wave, source.playtime_seconds,
          restoredMods, source.mods_manifest_hash,
        ],
      );
      for (let offset = 0; offset < files.length; offset += 500) {
        const chunk = files.slice(offset, offset + 500);
        const values = chunk.map(() => '(?,?,?,?,?)').join(',');
        const parameters: unknown[] = [];
        for (const file of chunk) parameters.push(newId, file.file_path, file.blob_id, String(file.size_bytes), file.sha256);
        await manager.query(
          `INSERT INTO squad_save_snapshot_files (snapshot_id,file_path,blob_id,size_bytes,sha256) VALUES ${values}`,
          parameters,
        );
      }
      for (const blobId of [...new Set(files.map((file: any) => String(file.blob_id)))]) {
        const rows = await manager.query('SELECT id,gc_in_progress FROM squad_save_blobs WHERE id=? FOR UPDATE', [blobId]);
        if (!Array.isArray(rows) || !rows.length || rows[0].gc_in_progress) {
          squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '快照文件记录暂不可用。', true);
        }
        await manager.query('UPDATE squad_save_blobs SET ref_count=ref_count+1,pending_delete_at=NULL,last_referenced_at=NOW() WHERE id=?', [blobId]);
      }
      await manager.query(
        'UPDATE squad_save_slots SET head_snapshot_id=?, game_version=?, mods_json=?, updated_at=NOW() WHERE id=?',
        [newId, source.game_version ?? null, restoredMods, slotId],
      );
      const pruned = await this.pruneSlotSnapshots(manager, slotId);
      await this.audit(manager, userId, 'squad.snapshot.restore', {
        squad_id: squadId, slot_id: slotId, source_snapshot_id: snapshotId, snapshot_id: newId, revision: Number(revision),
        source_branch_type: source.branch_type, pruned_snapshot_ids: pruned,
      }, actor);
      const newRow = await manager.query('SELECT * FROM squad_save_snapshots WHERE id=? LIMIT 1', [newId]);
      return {
        snapshot: this.shapeSnapshot(newRow[0], { ...slot, head_snapshot_id: newId }),
        pruned,
        memberIds: await listActiveMemberIds(manager, squadId),
      };
    });
    const { memberIds, pruned, ...response } = result;
    await broadcastSquadEvent(this.realtime, memberIds, 'squad_save.snapshot_committed', {
      squad_id: squadId, slot_id: slotId, snapshot_id: response.snapshot.id, revision: response.snapshot.revision,
      branch_type: 'main', uploader_user_id: userId, fencing_token: response.snapshot.fencing_token,
    });
    return { snapshot: response.snapshot, pruned_snapshot_ids: pruned };
  }

  async deleteSnapshot(userId: number, squadId: string, slotId: string, snapshotId: string, actor: SquadSaveActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      await requireManager(manager, squadId, userId);
      const slot = await requireSlot(manager, squadId, slotId, { forUpdate: true });
      if (slot.head_snapshot_id === snapshotId) {
        squadFail('SQUAD_SAVE_HEAD_SNAPSHOT_DELETE_FORBIDDEN', HttpStatus.CONFLICT, '主链当前快照不能单独删除。');
      }
      const rows = await manager.query(
        'SELECT id FROM squad_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL FOR UPDATE',
        [snapshotId, slotId],
      );
      if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_SNAPSHOT_NOT_FOUND', HttpStatus.NOT_FOUND, '快照不存在。');
      await manager.query('UPDATE squad_save_snapshots SET deleted_at=NOW() WHERE id=?', [snapshotId]);
      const blobs = await manager.query('SELECT DISTINCT blob_id FROM squad_save_snapshot_files WHERE snapshot_id=?', [snapshotId]);
      for (const row of Array.isArray(blobs) ? blobs : []) await this.releaseBlob(manager, String(row.blob_id), 1);
      await manager.query('DELETE FROM squad_save_snapshot_files WHERE snapshot_id=?', [snapshotId]);
      await this.audit(manager, userId, 'squad.snapshot.delete', { squad_id: squadId, slot_id: slotId, snapshot_id: snapshotId }, actor);
      return { id: snapshotId, deleted: true };
    });
  }

  // -------------------------------------------------------------- 下载

  async blobDownloadGrant(userId: number, squadId: string, slotId: string, snapshotId: string, body: any, actor: SquadSaveActor) {
    this.assertEnabled();
    await requireActiveSquad(this.dataSource, squadId, userId);
    await requireSlot(this.dataSource, squadId, slotId);
    await this.findLiveSnapshot(this.dataSource, slotId, snapshotId);
    const hashes = normalizeHashList(body?.sha256, this.number('maxManifestFiles', 5000));
    if (!hashes.length) return { downloads: [] };
    const marks = hashes.map(() => '?').join(',');
    const files = await this.dataSource.query(
      `SELECT file_path,size_bytes,sha256 FROM squad_save_snapshot_files WHERE snapshot_id=? AND sha256 IN (${marks})`,
      [snapshotId, ...hashes],
    );
    const found = new Set((Array.isArray(files) ? files : []).map((file: any) => String(file.sha256)));
    const missing = hashes.filter((hash) => !found.has(hash));
    if (missing.length) {
      squadFail('SQUAD_SAVE_BLOB_NOT_IN_SNAPSHOT', HttpStatus.NOT_FOUND, '部分文件不属于该快照。', false, missing.map((sha256) => ({ sha256 })));
    }
    await this.audit(this.dataSource.manager, userId, 'squad.blob.download.request', {
      squad_id: squadId, slot_id: slotId, snapshot_id: snapshotId, file_count: files.length,
    }, actor);
    return {
      downloads: (Array.isArray(files) ? files : []).map((file: any) => ({
        path: file.file_path,
        size: Number(file.size_bytes),
        sha256: file.sha256,
        download: {
          method: 'GET',
          url: `/api/v1/squads/${encodeURIComponent(squadId)}/slots/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(snapshotId)}/blobs/${file.sha256}/file`,
          headers: {},
          size: Number(file.size_bytes),
          sha256: file.sha256,
          expires_at: null,
          reusable: true,
        },
      })),
    };
  }

  async openBlobDownload(userId: number, squadId: string, slotId: string, snapshotId: string, sha256: string, actor: SquadSaveActor) {
    this.assertEnabled();
    if (!/^[a-f0-9]{64}$/.test(sha256)) squadFail('SQUAD_SAVE_INVALID_HASH', HttpStatus.BAD_REQUEST, 'SHA-256 格式无效。');
    await requireActiveSquad(this.dataSource, squadId, userId);
    await requireSlot(this.dataSource, squadId, slotId);
    await this.findLiveSnapshot(this.dataSource, slotId, snapshotId);
    const rows = await this.dataSource.query(
      `SELECT f.file_path,f.size_bytes,f.sha256,b.object_key,b.storage_provider
         FROM squad_save_snapshot_files f JOIN squad_save_blobs b ON b.id=f.blob_id
        WHERE f.snapshot_id=? AND f.sha256=? LIMIT 1`,
      [snapshotId, sha256],
    );
    if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_BLOB_NOT_IN_SNAPSHOT', HttpStatus.NOT_FOUND, '该文件不属于此快照。');
    const row = rows[0];
    if (row.storage_provider !== this.storage.provider) {
      squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档存储服务暂不可用。', true);
    }
    const file = await this.storage.openObject(row.object_key).catch(() => null);
    if (!file || file.size !== Number(row.size_bytes)) {
      squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档文件暂不可用。', true);
    }
    await this.audit(this.dataSource.manager, userId, 'squad.blob.download', {
      squad_id: squadId, slot_id: slotId, snapshot_id: snapshotId, sha256, size_bytes: Number(row.size_bytes),
    }, actor);
    return {
      stream: file.stream,
      size: file.size,
      file_name: String(row.file_path).split('/').pop() || 'file',
      path: row.file_path,
      sha256: row.sha256,
      last_modified: file.last_modified,
    };
  }

  // -------------------------------------------------------------- 维护

  /**
   * 小队存档维护：清理过期暂存对象，并对引用数归零的 blob 做延迟 GC。
   * 物理删除前再次核对存活快照引用，避免把主链仍在使用的字节删掉。
   */
  async runMaintenance(): Promise<{ expiredUploads: number; deletedBlobs: number }> {
    if (!this.storage.isConfigured()) return { expiredUploads: 0, deletedBlobs: 0 };
    const expired = await this.dataSource.query(
      `SELECT id,object_key,status FROM squad_save_blob_uploads
        WHERE status IN ('pending','ready') AND expires_at < NOW() LIMIT 100`,
    );
    let expiredUploads = 0;
    for (const item of Array.isArray(expired) ? expired : []) {
      try {
        await this.storage.deleteObject(item.object_key);
        await this.dataSource.query("UPDATE squad_save_blob_uploads SET status='expired' WHERE id=? AND status IN ('pending','ready')", [item.id]);
        expiredUploads++;
      } catch { /* 下一轮重试 */ }
    }
    // 已提交对象归 blob 表所有；只删除过期的暂存行。
    const staleRows = await this.dataSource.query(
      `SELECT id,object_key,status FROM squad_save_blob_uploads
        WHERE status IN ('committed','expired') AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 100`,
    );
    for (const item of Array.isArray(staleRows) ? staleRows : []) {
      if (item.status !== 'committed') {
        // 删除失败时保留行，下一轮重试；先删行会永久遗弃物理对象。
        try { await this.storage.deleteObject(item.object_key); } catch { continue; }
      }
      await this.dataSource.query('DELETE FROM squad_save_blob_uploads WHERE id=?', [item.id]);
    }
    const candidates = await this.dataSource.query(
      `SELECT id,object_key FROM squad_save_blobs
        WHERE ref_count=0 AND gc_in_progress=0 AND pending_delete_at IS NOT NULL AND pending_delete_at<=NOW() LIMIT 100`,
    );
    let deletedBlobs = 0;
    for (const blob of Array.isArray(candidates) ? candidates : []) {
      const claim = await this.dataSource.query(
        'UPDATE squad_save_blobs SET gc_in_progress=1 WHERE id=? AND ref_count=0 AND gc_in_progress=0 AND pending_delete_at<=NOW()',
        [blob.id],
      );
      if (!claim.affectedRows) continue;
      try {
        await this.storage.deleteObject(blob.object_key);
        await this.dataSource.transaction(async manager => {
          const rows = await manager.query('SELECT id,ref_count,gc_in_progress FROM squad_save_blobs WHERE id=? FOR UPDATE', [blob.id]);
          if (!Array.isArray(rows) || !rows.length) return;
          const refs = await manager.query(
            `SELECT COUNT(DISTINCT f.snapshot_id) AS count
               FROM squad_save_snapshot_files f JOIN squad_save_snapshots s ON s.id=f.snapshot_id
              WHERE f.blob_id=? AND s.deleted_at IS NULL`,
            [blob.id],
          );
          if (Number(rows[0].ref_count) === 0 && Number(refs[0]?.count || 0) === 0 && rows[0].gc_in_progress) {
            await manager.query('DELETE FROM squad_save_blobs WHERE id=?', [blob.id]);
          } else {
            await manager.query('UPDATE squad_save_blobs SET gc_in_progress=0 WHERE id=?', [blob.id]);
          }
        });
        deletedBlobs++;
      } catch {
        await this.dataSource.query(
          'UPDATE squad_save_blobs SET gc_in_progress=0,pending_delete_at=DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id=? AND ref_count=0',
          [this.number('gcGraceHours', 24), blob.id],
        );
      }
    }
    return { expiredUploads, deletedBlobs };
  }

  // -------------------------------------------------------------- 内部

  /**
   * GFS 分层裁剪（D06）：每次主链提交后同步执行。
   *
   * 保留集 A = 最近 10 个未置顶主链快照；B = 过去 7 个自然日每天最后一个；
   * 所有 pinned 与 conflict 分支不在裁剪范围内。淘汰时软删快照、清理文件行、
   * 按快照递减 blob 引用；ref_count 归零即释放创建者配额。
   */
  private async pruneSlotSnapshots(manager: EntityManager, slotId: string): Promise<string[]> {
    const recent = await manager.query(
      `SELECT id FROM squad_save_snapshots
        WHERE slot_id=? AND deleted_at IS NULL AND branch_type='main' AND pinned=0
        ORDER BY revision DESC LIMIT ${SQUAD_GFS_RECENT}`,
      [slotId],
    );
    const daily = await manager.query(
      `SELECT MAX(revision) AS revision FROM squad_save_snapshots
        WHERE slot_id=? AND deleted_at IS NULL AND branch_type='main' AND pinned=0
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL ${SQUAD_GFS_DAILY_DAYS - 1} DAY)
        GROUP BY DATE(created_at)`,
      [slotId],
    );
    const dailyRevisions = (Array.isArray(daily) ? daily : [])
      .map((row: any) => Number(row.revision))
      .filter((value) => Number.isSafeInteger(value));
    const keep = new Set((Array.isArray(recent) ? recent : []).map((row: any) => String(row.id)));
    const dailyIds = new Set<string>();
    if (dailyRevisions.length) {
      const marks = dailyRevisions.map(() => '?').join(',');
      const rows = await manager.query(
        `SELECT id FROM squad_save_snapshots
          WHERE slot_id=? AND deleted_at IS NULL AND branch_type='main' AND pinned=0 AND revision IN (${marks})`,
        [slotId, ...dailyRevisions],
      );
      for (const row of Array.isArray(rows) ? rows : []) {
        dailyIds.add(String(row.id));
        keep.add(String(row.id));
      }
    }
    if (dailyIds.size) {
      await manager.query(
        `UPDATE squad_save_snapshots SET retention_tier='daily' WHERE id IN (${[...dailyIds].map(() => '?').join(',')})`,
        [...dailyIds],
      );
    }
    // recent 集合里除去 daily 的部分统一标记为 recent（含上次是 daily 的旧快照）。
    const recentOnly = [...keep].filter((id) => !dailyIds.has(id));
    if (recentOnly.length) {
      await manager.query(
        `UPDATE squad_save_snapshots SET retention_tier='recent' WHERE id IN (${recentOnly.map(() => '?').join(',')})`,
        recentOnly,
      );
    }
    const candidates = await manager.query(
      `SELECT id FROM squad_save_snapshots
        WHERE slot_id=? AND deleted_at IS NULL AND branch_type='main' AND pinned=0`,
      [slotId],
    );
    const pruned: string[] = [];
    for (const row of Array.isArray(candidates) ? candidates : []) {
      const id = String(row.id);
      if (keep.has(id)) continue;
      const blobs = await manager.query('SELECT DISTINCT blob_id FROM squad_save_snapshot_files WHERE snapshot_id=?', [id]);
      await manager.query('UPDATE squad_save_snapshots SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL', [id]);
      for (const blob of Array.isArray(blobs) ? blobs : []) await this.releaseBlob(manager, String(blob.blob_id), 1);
      await manager.query('DELETE FROM squad_save_snapshot_files WHERE snapshot_id=?', [id]);
      pruned.push(id);
    }
    return pruned;
  }

  private async findLiveSnapshot(manager: { query: Function }, slotId: string, snapshotId: string): Promise<any> {
    const rows = await manager.query(
      'SELECT * FROM squad_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL LIMIT 1',
      [snapshotId, slotId],
    );
    if (!Array.isArray(rows) || !rows.length) squadFail('SQUAD_SAVE_SNAPSHOT_NOT_FOUND', HttpStatus.NOT_FOUND, '快照不存在。');
    return rows[0];
  }

  private shapeSlot(slot: any, squad: any) {
    return {
      id: slot.id,
      squad_id: slot.squad_id,
      name: slot.name,
      head_snapshot_id: slot.head_snapshot_id ?? null,
      active_session_id: slot.active_session_id ?? null,
      lanlink_room_code: slot.lanlink_room_code ?? null,
      game_version: slot.game_version ?? null,
      mods: parseJson(slot.mods_json) || [],
      owner_user_id: Number(squad.owner_user_id),
      created_by_user_id: Number(slot.created_by_user_id),
      created_at: slot.created_at ?? null,
      updated_at: slot.updated_at ?? null,
    };
  }

  private shapeSnapshot(row: any, slot: any) {
    const mods = parseJson(row.mods_manifest_json);
    return {
      id: row.id,
      slot_id: row.slot_id ?? slot.id,
      squad_id: row.squad_id ?? slot.squad_id,
      revision: Number(row.revision),
      parent_snapshot_id: row.parent_snapshot_id ?? null,
      uploader_user_id: Number(row.uploader_user_id),
      fencing_token: Number(row.fencing_token),
      branch_type: row.branch_type || 'main',
      retention_tier: row.retention_tier || 'recent',
      format: row.format || 'manifest_v1',
      sha256: row.sha256,
      size: Number(row.size_bytes),
      file_count: row.manifest_file_count == null ? null : Number(row.manifest_file_count),
      game: { version: row.game_version ?? null, build: row.game_build ?? null },
      save: {
        map_name: row.map_name ?? null,
        wave: row.wave ?? null,
        playtime_seconds: row.playtime_seconds == null ? null : Number(row.playtime_seconds),
      },
      mods: { count: Array.isArray(mods) ? mods.length : 0, manifest_hash: row.mods_manifest_hash ?? null },
      reason: row.reason,
      pinned: Boolean(row.pinned),
      is_head: slot.head_snapshot_id === row.id,
      created_at: row.created_at,
    };
  }

  /**
   * 配额不足：对非创建者隐藏具体数值，只返回稳定错误码与统一文案。
   * 创建者本人可以看到用量，便于自行清理。
   */
  private ownerQuotaExceeded(ownerUserId: number, callerUserId: number, usedBytes: number, requiredBytes: number): never {
    const details = ownerUserId === callerUserId
      ? [{ used_bytes: usedBytes, limit_bytes: this.quotaLimitBytes, required_bytes: requiredBytes }]
      : [];
    squadFail('SQUAD_OWNER_QUOTA_EXCEEDED', HttpStatus.CONFLICT,
      '小队创建者的云存档空间不足，无法继续上传。', false, details);
  }

  private async releaseBlob(manager: EntityManager, blobId: string, count: number): Promise<void> {
    const rows = await manager.query('SELECT ref_count FROM squad_save_blobs WHERE id=? FOR UPDATE', [blobId]);
    if (!Array.isArray(rows) || !rows.length) return;
    const next = Math.max(0, Number(rows[0].ref_count) - Math.max(0, count));
    const pending = next === 0 ? new Date(Date.now() + this.number('gcGraceHours', 24) * 3_600_000) : null;
    await manager.query('UPDATE squad_save_blobs SET ref_count=?,pending_delete_at=?,gc_in_progress=0 WHERE id=?', [next, pending, blobId]);
  }

  private async audit(manager: EntityManager, userId: number, action: string, details: Record<string, unknown>, actor: SquadSaveActor): Promise<void> {
    const body = { ...details, client_id: actor.clientId || null, device_id: actor.deviceId || null, request_id: actor.requestId || null };
    // operation_logs.target_id 是 INT；小队 ID 是 UUID，放进去会在严格模式
    // 下报错并回滚整个业务事务。ID 保留在 details JSON 中，target_id 置 NULL。
    await manager.query(`INSERT INTO operation_logs (user_id,action,target_type,target_id,details,ip_address,user_agent,created_at)
      VALUES (?,?, 'squad', NULL, ?, ?, ?, NOW())`, [
      userId, action, JSON.stringify(body), actor.ip || null, (actor.userAgent || '').slice(0, 1000) || null,
    ]);
  }

  private assertEnabled(): void {
    if (this.settings.getCached('squad_saves_enabled') !== 'true') {
      squadFail('SQUADS_DISABLED', HttpStatus.FORBIDDEN, '小队共享存档功能尚未启用。');
    }
    if (this.settings.getCached('cloud_saves_enabled') !== 'true') {
      squadFail('CLOUD_SAVES_DISABLED', HttpStatus.FORBIDDEN, '云存档功能尚未启用。');
    }
    if (!this.storage.isConfigured()) {
      squadFail('SQUAD_SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档存储尚未配置。', true);
    }
  }

  private get quotaLimitBytes(): number {
    const value = Number(this.settings.getCached('cloud_saves_user_quota_bytes'));
    return Number.isSafeInteger(value) && value > 0 ? value : 524288000;
  }

  private number(key: string, fallback: number): number {
    if (key === 'maxFileBytes') return this.settingNumber('cloud_saves_max_file_bytes', fallback);
    const value = Number(this.config.get(`cloudSaves.${key}`));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  private settingNumber(key: string, fallback: number): number {
    const value = Number(this.settings.getCached(key));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function boundedOpaque(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    squadFail('SQUAD_INVALID_METADATA', HttpStatus.BAD_REQUEST, '设备标识无效。');
  }
  return value;
}
