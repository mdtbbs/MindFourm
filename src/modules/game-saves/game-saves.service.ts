import { createHash, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { SettingsService } from '../settings/settings.service';
import { CloudSaveStorageService } from './cloud-save-storage.service';
import { decodeSaveCursor, encodeSaveCursor, normalizeCloudSaveName, normalizeSaveMetadata, shouldCreateConflictCopy } from './game-save-validation';

export type CloudSaveActor = { clientId?: string; deviceId?: string; requestId?: string; ip?: string; userAgent?: string };

@Injectable()
export class GameSavesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly storage: CloudSaveStorageService,
    private readonly settings: SettingsService,
  ) {}

  isEnabled(): boolean {
    return this.settings.getCached('cloud_saves_enabled') === 'true' && this.storage.isConfigured();
  }

  isStorageReady(): boolean { return this.storage.isConfigured(); }

  /** Account deletion path: preserve rows for delayed object GC while making all saves inaccessible. */
  async markUserDataDeleted(userId: number): Promise<{ slots: number; snapshots: number; uploads: number }> {
    return this.dataSource.transaction(async manager => {
      const users = await manager.query('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
      if (!users.length) return { slots: 0, snapshots: 0, uploads: 0 };

      const slots = await manager.query('SELECT id FROM game_save_slots WHERE user_id=? AND deleted_at IS NULL FOR UPDATE', [userId]);
      const slotIds = slots.map((row: any) => String(row.id));
      let snapshots = 0;
      if (slotIds.length) {
        const marks = slotIds.map(() => '?').join(',');
        const references = await manager.query(`SELECT blob_id FROM game_save_snapshots WHERE slot_id IN (${marks}) AND deleted_at IS NULL`, slotIds);
        const counts = new Map<string, number>();
        for (const row of references) counts.set(String(row.blob_id), (counts.get(String(row.blob_id)) || 0) + 1);
        for (const [blobId, count] of counts) await this.releaseBlob(manager, blobId, count);
        const updated = await manager.query(`UPDATE game_save_snapshots SET deleted_at=NOW() WHERE slot_id IN (${marks}) AND deleted_at IS NULL`, slotIds);
        snapshots = Number(updated?.affectedRows || 0);
        await manager.query(`UPDATE game_save_slots SET current_snapshot_id=NULL,deleted_at=NOW(),updated_at=NOW() WHERE id IN (${marks})`, slotIds);
      }
      const cancelled = await manager.query('UPDATE game_save_upload_sessions SET status=? WHERE user_id=? AND status IN (?,?)', ['cancelled', userId, 'pending', 'uploaded']);
      const uploads = Number(cancelled?.affectedRows || 0);
      if (slotIds.length || uploads) {
        await this.audit(manager, userId, 'cloud_save.account_delete', { slots: slotIds.length, snapshots, uploads }, {});
      }
      return { slots: slotIds.length, snapshots, uploads };
    });
  }

  async listSlots(userId: number, cursor?: string, limit = 30) {
    this.assertEnabled();
    const decoded = decodeSaveCursor(cursor);
    const pageSize = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 30, 100));
    const args: any[] = [userId];
    let condition = 's.user_id = ? AND s.deleted_at IS NULL';
    if (decoded) {
      condition += ' AND (s.updated_at < ? OR (s.updated_at = ? AND s.id < ?))';
      args.push(decoded.updated_at, decoded.updated_at, decoded.id);
    }
    const rows = await this.dataSource.query(`SELECT s.id, s.name, s.created_at, s.updated_at,
        sn.id AS snapshot_id, sn.revision, sn.sha256, sn.size_bytes, sn.game_version, sn.game_build,
        sn.map_name, sn.wave, sn.playtime_seconds, sn.created_at AS snapshot_created_at
      FROM game_save_slots s LEFT JOIN game_save_snapshots sn ON sn.id = s.current_snapshot_id AND sn.deleted_at IS NULL
      WHERE ${condition} ORDER BY s.updated_at DESC, s.id DESC LIMIT ?`, [...args, pageSize + 1]);
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const data = page.map((row: any) => this.shapeSlot(row));
    Object.defineProperty(data, '__v1NextCursor', { value: hasMore ? encodeSaveCursor(page[page.length - 1].updated_at, page[page.length - 1].id) : null, enumerable: false });
    return data;
  }

  async getSlot(userId: number, slotId: string) {
    this.assertEnabled();
    const rows = await this.dataSource.query(`SELECT s.id, s.name, s.created_at, s.updated_at,
        sn.id AS snapshot_id, sn.revision, sn.sha256, sn.size_bytes, sn.game_version, sn.game_build,
        sn.map_name, sn.wave, sn.playtime_seconds, sn.created_at AS snapshot_created_at
      FROM game_save_slots s LEFT JOIN game_save_snapshots sn ON sn.id = s.current_snapshot_id AND sn.deleted_at IS NULL
      WHERE s.id = ? AND s.user_id = ? AND s.deleted_at IS NULL LIMIT 1`, [slotId, userId]);
    if (!rows.length) this.notFound('SAVE_NOT_FOUND', '云存档不存在。');
    return this.shapeSlot(rows[0]);
  }

  async createSlot(userId: number, body: any, actor: CloudSaveActor, key?: string) {
    this.assertEnabled();
    const name = normalizeCloudSaveName(body?.name);
    return this.idempotent(userId, 'slot.create', key, { name }, async manager => {
      await this.lockUser(manager, userId);
      const [{ count }] = await manager.query('SELECT COUNT(*) AS count FROM game_save_slots WHERE user_id = ? AND deleted_at IS NULL', [userId]);
      if (Number(count) >= this.number('maxSlots', 100)) this.fail('SAVE_SLOT_LIMIT_EXCEEDED', HttpStatus.CONFLICT, '已达到云存档数量上限。');
      const id = randomUUID();
      await manager.query('INSERT INTO game_save_slots (id, user_id, name) VALUES (?, ?, ?)', [id, userId, name]);
      const result = { id, name, current_snapshot: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      await this.audit(manager, userId, 'cloud_save.slot.create', { slot_id: id }, actor);
      return result;
    });
  }

  async renameSlot(userId: number, slotId: string, body: any, actor: CloudSaveActor) {
    this.assertEnabled();
    const name = normalizeCloudSaveName(body?.name);
    return this.dataSource.transaction(async manager => {
      await this.lockUser(manager, userId);
      const slot = await this.lockSlot(manager, userId, slotId);
      await manager.query('UPDATE game_save_slots SET name = ?, updated_at = NOW() WHERE id = ?', [name, slot.id]);
      await this.audit(manager, userId, 'cloud_save.slot.rename', { slot_id: slotId }, actor);
      return { id: slotId, name, updated_at: new Date().toISOString() };
    });
  }

  async deleteSlot(userId: number, slotId: string, actor: CloudSaveActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      await this.lockUser(manager, userId);
      const slot = await this.lockSlot(manager, userId, slotId);
      const counts = await manager.query(`SELECT blob_id, COUNT(*) AS ref_count FROM game_save_snapshots
        WHERE slot_id = ? AND deleted_at IS NULL GROUP BY blob_id`, [slotId]);
      for (const row of counts) await this.releaseBlob(manager, String(row.blob_id), Number(row.ref_count));
      await manager.query('UPDATE game_save_snapshots SET deleted_at = NOW() WHERE slot_id = ? AND deleted_at IS NULL', [slotId]);
      await manager.query('UPDATE game_save_upload_sessions SET status = IF(status IN (\'pending\',\'uploaded\'), \'cancelled\', status) WHERE slot_id = ? AND status IN (\'pending\',\'uploaded\')', [slotId]);
      await manager.query('UPDATE game_save_slots SET current_snapshot_id = NULL, deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [slot.id]);
      await this.audit(manager, userId, 'cloud_save.slot.delete', { slot_id: slotId }, actor);
      return { id: slotId, deleted: true };
    });
  }

  async getQuota(userId: number) {
    this.assertEnabled();
    const [{ used_bytes }] = await this.dataSource.query('SELECT COALESCE(SUM(size_bytes), 0) AS used_bytes FROM game_save_blobs WHERE user_id = ? AND ref_count > 0', [userId]);
    const [{ used_slots }] = await this.dataSource.query('SELECT COUNT(*) AS used_slots FROM game_save_slots WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    return {
      used_bytes: Number(used_bytes), limit_bytes: this.number('maxBytesPerUser', 524288000),
      max_file_size_bytes: this.number('maxFileBytes', 52428800),
      slots: { used: Number(used_slots), limit: this.number('maxSlots', 100) },
      retention: { max_unpinned_versions_per_slot: this.number('maxHistoryPerSlot', 20), max_unpinned_age_days: this.number('retentionDays', 90) },
    };
  }

  async createUpload(userId: number, slotId: string, body: any, actor: CloudSaveActor, key?: string) {
    this.assertEnabled();
    const sha256 = String(body?.sha256 || '');
    if (!/^[a-f0-9]{64}$/.test(sha256)) this.fail('SAVE_INVALID_HASH', HttpStatus.BAD_REQUEST, 'SHA-256 格式无效。');
    const size = Number(body?.size);
    const maxFile = this.number('maxFileBytes', 52428800);
    if (!Number.isSafeInteger(size) || size <= 0) this.fail('SAVE_INVALID_METADATA', HttpStatus.BAD_REQUEST, '文件大小无效。');
    if (size > maxFile) this.fail('SAVE_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '存档超过单文件大小限制。');
    const metadata = normalizeSaveMetadata(body, this.number('maxMods', 100), this.number('maxManifestBytes', 16384));
    const reason = ['manual', 'before_launch', 'after_exit', 'periodic', 'restore', 'conflict', 'import'].includes(body?.reason) ? body.reason : 'manual';
    const resolution = ['normal', 'create_conflict_copy', 'force_replace_head'].includes(body?.conflict_resolution) ? body.conflict_resolution : 'normal';
    const baseId = body?.base_snapshot_id || null;
    const confirmedCurrentId = body?.confirm_current_snapshot_id || null;
    const deviceId = boundedOpaque(body?.device_id) || boundedOpaque(actor.deviceId);
    const payload = { slotId, sha256, size, metadata, reason, resolution, baseId, confirmedCurrentId, deviceId };
    const created = await this.idempotent(userId, 'upload.create', key, payload, async manager => {
      await this.lockUser(manager, userId);
      const slot = await this.lockSlot(manager, userId, slotId);
      let base: any = null;
      if (baseId) {
        const baseRows = await manager.query(`SELECT id FROM game_save_snapshots WHERE id = ? AND slot_id = ? AND deleted_at IS NULL LIMIT 1`, [baseId, slotId]);
        if (!baseRows.length) this.fail('SAVE_BASE_SNAPSHOT_INVALID', HttpStatus.CONFLICT, '基准快照不属于此存档或已删除。');
        base = baseRows[0];
      }
      const currentRows = slot.current_snapshot_id ? await manager.query('SELECT id, sha256 FROM game_save_snapshots WHERE id = ? AND deleted_at IS NULL LIMIT 1', [slot.current_snapshot_id]) : [];
      const current = currentRows[0] || null;
      // Head already holds these bytes. Return the upload-session shape anyway,
      // marked committed, so a client that always PUTs what it is given keeps
      // working; `no_upload_required` remains for compatibility with clients
      // that check it first.
      if (current && current.sha256 === sha256) {
        const uploadId = randomUUID();
        await manager.query(`INSERT INTO game_save_upload_sessions
          (id,user_id,slot_id,expected_sha256,expected_size_bytes,game_version,game_build,map_name,wave,playtime_seconds,
           mods_manifest_json,mods_manifest_hash,base_snapshot_id,reason,conflict_resolution,confirm_current_snapshot_id,
           object_key,storage_provider,status,created_by_client_id,device_id,expires_at,committed_at,committed_snapshot_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'committed',?,?,NOW(),NOW(),?)`, [
          uploadId, userId, slotId, sha256, String(size), metadata.game_version, metadata.game_build, metadata.map_name,
          metadata.wave, metadata.playtime_seconds, metadata.mods_manifest_json ? JSON.stringify(metadata.mods_manifest_json) : null,
          metadata.mods_manifest_hash, baseId, reason, resolution, confirmedCurrentId,
          `cloud-saves/${userId}/${randomUUID()}`, this.storage.provider,
          actor.clientId || null, deviceId, current.id,
        ]);
        return { upload_id: uploadId, no_upload_required: true, snapshot_id: current.id };
      }
      if (!current && base) this.fail('SAVE_BASE_SNAPSHOT_INVALID', HttpStatus.CONFLICT, '云存档当前没有基准快照。');
      if (current && (!base || base.id !== current.id)) {
        if (resolution === 'normal') this.conflict(base?.id || null, current.id, true);
        if (resolution === 'force_replace_head' && confirmedCurrentId !== current.id) this.conflict(base?.id || null, current.id);
      }
      if (resolution === 'force_replace_head' && (!current || confirmedCurrentId !== current.id)) this.conflict(base?.id || null, current?.id || null);
      const reservationRows = await manager.query(`SELECT COALESCE(SUM(size_bytes), 0) AS reserved_bytes FROM (
        SELECT DISTINCT s.expected_sha256, s.expected_size_bytes AS size_bytes
        FROM game_save_upload_sessions s WHERE s.user_id = ? AND s.status IN ('pending','uploaded') AND s.expires_at > NOW()
          AND NOT EXISTS (SELECT 1 FROM game_save_blobs b WHERE b.user_id = s.user_id AND b.sha256 = s.expected_sha256
            AND b.size_bytes = s.expected_size_bytes AND b.ref_count > 0)
      ) pending_saves`, [userId]);
      const usedRows = await manager.query('SELECT COALESCE(SUM(size_bytes), 0) AS used_bytes FROM game_save_blobs WHERE user_id = ? AND ref_count > 0', [userId]);
      const existingBlob = await manager.query('SELECT id FROM game_save_blobs WHERE user_id = ? AND sha256 = ? AND size_bytes = ? LIMIT 1 FOR UPDATE', [userId, sha256, String(size)]);
      const additional = existingBlob.length ? 0 : size;
      if (Number(usedRows[0].used_bytes) + Number(reservationRows[0].reserved_bytes) + additional > this.number('maxBytesPerUser', 524288000)) {
        this.fail('SAVE_QUOTA_EXCEEDED', HttpStatus.CONFLICT, '云存档空间不足。');
      }
      const uploadId = randomUUID();
      const objectKey = `cloud-saves/${userId}/${randomUUID()}`;
      const ttlSeconds = this.number('uploadSessionMinutes', 10) * 60;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await manager.query(`INSERT INTO game_save_upload_sessions
        (id,user_id,slot_id,expected_sha256,expected_size_bytes,game_version,game_build,map_name,wave,playtime_seconds,
         mods_manifest_json,mods_manifest_hash,base_snapshot_id,reason,conflict_resolution,confirm_current_snapshot_id,
         object_key,storage_provider,status,created_by_client_id,device_id,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`, [
        uploadId, userId, slotId, sha256, String(size), metadata.game_version, metadata.game_build, metadata.map_name,
        metadata.wave, metadata.playtime_seconds, metadata.mods_manifest_json ? JSON.stringify(metadata.mods_manifest_json) : null,
        metadata.mods_manifest_hash, baseId, reason, resolution, confirmedCurrentId, objectKey, this.storage.provider,
        actor.clientId || null, deviceId, expiresAt,
      ]);
      await this.audit(manager, userId, 'cloud_save.upload.create', { slot_id: slotId, upload_id: uploadId, sha256, size_bytes: size, reason }, actor);
      return { upload_id: uploadId, expires_at: expiresAt.toISOString() };
    });
    const commit = (snapshotId: string) => ((created as any).no_upload_required
      ? { no_upload_required: true, snapshot_id: snapshotId } : { upload_id: (created as any).upload_id, snapshot_id: snapshotId });
    if ((created as any).no_upload_required && !(created as any).upload_id) return created;
    const sessions = await this.dataSource.query('SELECT object_key, expected_sha256, expires_at, status, committed_snapshot_id FROM game_save_upload_sessions WHERE id = ? AND user_id = ? LIMIT 1', [(created as any).upload_id, userId]);
    if (!sessions.length) this.notFound('SAVE_UPLOAD_NOT_FOUND', '上传会话不存在。');
    if (sessions[0].status === 'committed' && sessions[0].committed_snapshot_id) {
      return commit(sessions[0].committed_snapshot_id);
    }
    if (!['pending', 'uploaded'].includes(sessions[0].status)) this.fail('SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    if (new Date(sessions[0].expires_at).getTime() <= Date.now()) this.fail('SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期。');
    const uploadId = (created as any).upload_id;
    const response: Record<string, unknown> = {
      upload_id: uploadId,
      upload: {
        method: 'PUT',
        url: `/api/v1/game-saves/uploads/${encodeURIComponent(uploadId)}/file`,
        headers: { 'Content-Type': 'application/octet-stream' },
        expires_at: new Date(sessions[0].expires_at).toISOString(),
      },
    };
    if ((created as any).no_upload_required) response.no_upload_required = true;
    return response;
  }

  async receiveUpload(userId: number, uploadId: string, source: NodeJS.ReadableStream, actor: CloudSaveActor) {
    this.assertEnabled();
    const rows = await this.dataSource.query(
      'SELECT * FROM game_save_upload_sessions WHERE id=? AND user_id=? LIMIT 1',
      [uploadId, userId],
    );
    if (!rows.length) this.notFound('SAVE_UPLOAD_NOT_FOUND', '上传会话不存在。');
    const session = rows[0];
    if (!['pending', 'uploaded'].includes(session.status) || new Date(session.expires_at).getTime() <= Date.now()) {
      this.fail('SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    }
    try {
      await this.storage.writeObject(
        session.object_key,
        source as any,
        Number(session.expected_size_bytes),
        String(session.expected_sha256),
        this.number('maxFileBytes', 52428800),
      );
    } catch (error: any) {
      const code = error?.code;
      if (code === 'SAVE_FILE_TOO_LARGE') this.fail('SAVE_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '存档超过单文件大小限制。');
      if (code === 'SAVE_UPLOAD_SIZE_MISMATCH') this.fail('SAVE_UPLOAD_SIZE_MISMATCH', HttpStatus.CONFLICT, '上传文件大小与声明不一致。');
      if (code === 'SAVE_UPLOAD_CHECKSUM_MISMATCH') this.fail('SAVE_UPLOAD_CHECKSUM_MISMATCH', HttpStatus.CONFLICT, '上传文件 SHA-256 与声明不一致。');
      this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '无法写入论坛本地存档目录。', true);
    }
    const update = await this.dataSource.query(
      'UPDATE game_save_upload_sessions SET status=? WHERE id=? AND user_id=? AND status IN (?,?) AND expires_at>NOW()',
      ['uploaded', uploadId, userId, 'pending', 'uploaded'],
    );
    if (!update.affectedRows) {
      await this.storage.deleteObject(session.object_key).catch(() => undefined);
      this.fail('SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    }
    await this.audit(this.dataSource.manager, userId, 'cloud_save.upload.received', {
      slot_id: session.slot_id, upload_id: uploadId, size_bytes: Number(session.expected_size_bytes),
    }, actor);
    return { upload_id: uploadId, uploaded: true, size_bytes: Number(session.expected_size_bytes), sha256: session.expected_sha256 };
  }

  async commitUpload(userId: number, uploadId: string, actor: CloudSaveActor, key?: string) {
    this.assertEnabled();
    const existing = await this.dataSource.query('SELECT * FROM game_save_upload_sessions WHERE id = ? AND user_id = ? LIMIT 1', [uploadId, userId]);
    if (!existing.length) this.notFound('SAVE_UPLOAD_NOT_FOUND', '上传会话不存在。');
    const session = existing[0];
    if (session.status === 'committed' && session.committed_snapshot_id) return this.getSnapshotForUser(userId, session.committed_snapshot_id);
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await this.dataSource.query('UPDATE game_save_upload_sessions SET status=? WHERE id=? AND status IN (?,?)', ['expired', uploadId, 'pending', 'uploaded']);
      this.fail('SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期。');
    }
    const expectedSize = Number(session.expected_size_bytes);
    let valid = false;
    try { valid = await this.storage.verifyObject(session.object_key, expectedSize, session.expected_sha256, this.number('maxFileBytes', 52428800)); }
    catch { this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '云存档存储暂不可用。', true); }
    if (!valid) {
      const info = await this.storage.statObject(session.object_key).catch(() => null);
      if (!info?.exists) this.fail('SAVE_UPLOAD_OBJECT_MISSING', HttpStatus.CONFLICT, '上传对象尚未到达存储服务。');
      if (info.size_bytes !== expectedSize) this.fail('SAVE_UPLOAD_SIZE_MISMATCH', HttpStatus.CONFLICT, '上传对象大小与声明不一致。');
      this.fail('SAVE_UPLOAD_CHECKSUM_MISMATCH', HttpStatus.CONFLICT, '上传对象 SHA-256 校验失败。');
    }
    const response = await this.idempotent(userId, 'upload.commit', key, { uploadId }, async manager => {
      await this.lockUser(manager, userId);
      const lockedRows = await manager.query('SELECT * FROM game_save_upload_sessions WHERE id = ? AND user_id = ? LIMIT 1', [uploadId, userId]);
      if (!lockedRows.length) this.notFound('SAVE_UPLOAD_NOT_FOUND', '上传会话不存在。');
      const slot = await this.lockSlot(manager, userId, lockedRows[0].slot_id);
      const sessionRows = await manager.query('SELECT * FROM game_save_upload_sessions WHERE id = ? AND user_id = ? FOR UPDATE', [uploadId, userId]);
      const locked = sessionRows[0];
      if (locked.status === 'committed' && locked.committed_snapshot_id) return await this.getSnapshotWith(manager, locked.committed_snapshot_id);
      if (!['pending', 'uploaded'].includes(locked.status) || new Date(locked.expires_at).getTime() <= Date.now()) this.fail('SAVE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
      const currentRows = slot.current_snapshot_id ? await manager.query('SELECT id,sha256 FROM game_save_snapshots WHERE id = ? AND deleted_at IS NULL LIMIT 1', [slot.current_snapshot_id]) : [];
      const current = currentRows[0] || null;
      const hasConflict = (current?.id || null) !== (locked.base_snapshot_id || null);
      const createConflictCopy = shouldCreateConflictCopy(locked.conflict_resolution, hasConflict);
      if (hasConflict && current?.sha256 === locked.expected_sha256) {
        await manager.query("UPDATE game_save_upload_sessions SET status='committed', committed_at=NOW(), committed_snapshot_id=? WHERE id=?", [current.id, uploadId]);
        return await this.getSnapshotWith(manager, current.id);
      }
      let destination = slot;
      if (locked.conflict_resolution === 'normal' && hasConflict) this.conflict(locked.base_snapshot_id || null, current?.id || null, true);
      if (locked.conflict_resolution === 'force_replace_head' && (locked.confirm_current_snapshot_id || null) !== (current?.id || null)) {
        this.conflict(locked.base_snapshot_id || null, current?.id || null);
      }
      if (createConflictCopy) {
        const [{ count }] = await manager.query('SELECT COUNT(*) AS count FROM game_save_slots WHERE user_id=? AND deleted_at IS NULL', [userId]);
        if (Number(count) >= this.number('maxSlots', 100)) this.fail('SAVE_SLOT_LIMIT_EXCEEDED', HttpStatus.CONFLICT, '已达到云存档数量上限，无法创建冲突副本。');
        const copyId = randomUUID();
        let copyName = `${slot.name.slice(0, 86)}（冲突副本）`;
        let suffix = 2;
        while ((await manager.query('SELECT id FROM game_save_slots WHERE user_id=? AND name=? AND deleted_at IS NULL LIMIT 1', [userId, copyName])).length) {
          const tail = ` (${suffix++})`;
          copyName = `${slot.name.slice(0, Math.max(1, 100 - tail.length - 6))}（冲突副本）${tail}`;
        }
        await manager.query('INSERT INTO game_save_slots (id,user_id,name) VALUES (?,?,?)', [copyId, userId, copyName]);
        destination = { id: copyId, name: copyName, current_snapshot_id: null };
        await this.audit(manager, userId, 'cloud_save.slot.create', { slot_id: copyId, conflict_copy_of: slot.id }, actor);
      }
      const [{ used_bytes }] = await manager.query('SELECT COALESCE(SUM(size_bytes),0) AS used_bytes FROM game_save_blobs WHERE user_id=? AND ref_count>0', [userId]);
      const [{ reserved_bytes }] = await manager.query(`SELECT COALESCE(SUM(size_bytes),0) AS reserved_bytes FROM (
        SELECT DISTINCT s.expected_sha256,s.expected_size_bytes AS size_bytes FROM game_save_upload_sessions s
        WHERE s.user_id=? AND s.status IN ('pending','uploaded') AND s.expires_at>NOW()
          AND NOT EXISTS (SELECT 1 FROM game_save_blobs b WHERE b.user_id=s.user_id AND b.sha256=s.expected_sha256
            AND b.size_bytes=s.expected_size_bytes AND b.ref_count>0)
      ) pending_saves`, [userId]);
      if (Number(used_bytes) + Number(reserved_bytes) > this.number('maxBytesPerUser', 524288000)) {
        // Quota may have been lowered after the session was created. Fail the
        // session and drop the object now; leaving it pending would keep the
        // reservation alive and block every later commit.
        await this.discardUpload(manager, locked);
        this.fail('SAVE_QUOTA_EXCEEDED', HttpStatus.CONFLICT, '云存档空间不足。');
      }
      const blobId = await this.addBlobReference(manager, userId, locked);
      const snapshotSource = createConflictCopy ? { ...locked, reason: 'conflict' } : locked;
      const snapshot = await this.insertSnapshot(manager, destination, snapshotSource, blobId, actor);
      await manager.query('UPDATE game_save_slots SET current_snapshot_id=?, updated_at=NOW() WHERE id=?', [snapshot.id, destination.id]);
      await manager.query("UPDATE game_save_upload_sessions SET status='committed',committed_at=NOW(),committed_snapshot_id=? WHERE id=?", [snapshot.id, uploadId]);
      await this.audit(manager, userId, 'cloud_save.upload.commit', { slot_id: destination.id, upload_id: uploadId, snapshot_id: snapshot.id, revision: snapshot.revision, sha256: snapshot.sha256 }, actor);
      return this.shapeSnapshot(snapshot, destination.id);
    });
    return response;
  }

  async listSnapshots(userId: number, slotId: string) {
    this.assertEnabled();
    const slot = await this.findSlot(userId, slotId);
    const rows = await this.dataSource.query(`SELECT * FROM game_save_snapshots WHERE slot_id=? AND deleted_at IS NULL
      ORDER BY revision DESC LIMIT 500`, [slotId]);
    return rows.map((row: any) => this.shapeHistory(row, slot.name));
  }

  async downloadGrant(userId: number, slotId: string, snapshotId: string, actor: CloudSaveActor) {
    this.assertEnabled();
    const rows = await this.dataSource.query(`SELECT s.name AS slot_name,sn.*,b.object_key,b.storage_provider
      FROM game_save_slots s JOIN game_save_snapshots sn ON sn.slot_id=s.id
      JOIN game_save_blobs b ON b.id=sn.blob_id
      WHERE s.id=? AND s.user_id=? AND s.deleted_at IS NULL AND sn.id=? AND sn.deleted_at IS NULL LIMIT 1`, [slotId,userId,snapshotId]);
    if (!rows.length) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
    const row = rows[0];
    if (row.storage_provider !== this.storage.provider) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档存储服务暂不可用。', true);
    const info = await this.storage.statObject(row.object_key).catch(() => null);
    if (!info?.exists || info.size_bytes !== Number(row.size_bytes)) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档文件暂不可用。', true);
    const fileName = `${String(row.slot_name).replace(/[\r\n"\\/]/g, '_').slice(0, 140) || 'save'}.msav`;
    await this.audit(this.dataSource.manager, userId, 'cloud_save.download.request', { slot_id: slotId, snapshot_id: snapshotId, size_bytes: Number(row.size_bytes) }, actor);
    return {
      download: {
        method: 'GET',
        url: `/api/v1/game-saves/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(snapshotId)}/file`,
        headers: {},
        size: Number(row.size_bytes),
        sha256: row.sha256,
        file_name: fileName,
        // The URL is not signed and not one-time: it stays valid for as long as
        // the snapshot is downloadable, so clients may reuse it.
        expires_at: null,
        reusable: true,
      },
    };
  }

  async openSnapshotDownload(userId: number, slotId: string, snapshotId: string, actor: CloudSaveActor) {
    this.assertEnabled();
    const rows = await this.dataSource.query(`SELECT s.name AS slot_name,sn.*,b.object_key,b.storage_provider
      FROM game_save_slots s JOIN game_save_snapshots sn ON sn.slot_id=s.id
      JOIN game_save_blobs b ON b.id=sn.blob_id
      WHERE s.id=? AND s.user_id=? AND s.deleted_at IS NULL AND sn.id=? AND sn.deleted_at IS NULL LIMIT 1`, [slotId, userId, snapshotId]);
    if (!rows.length) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
    const row = rows[0];
    if (row.storage_provider !== this.storage.provider) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档存储服务暂不可用。', true);
    const file = await this.storage.openObject(row.object_key).catch(() => null);
    if (!file || file.size !== Number(row.size_bytes)) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存档文件暂不可用。', true);
    const fileName = `${String(row.slot_name).replace(/[\\r\\n"\\\\/]/g, '_').slice(0, 140) || 'save'}.msav`;
    await this.audit(this.dataSource.manager, userId, 'cloud_save.download', {
      slot_id: slotId, snapshot_id: snapshotId, size_bytes: Number(row.size_bytes),
    }, actor);
    return { stream: file.stream, size: file.size, file_name: fileName, sha256: row.sha256, last_modified: file.last_modified };
  }

  async restore(userId: number, slotId: string, snapshotId: string, body: any, actor: CloudSaveActor, key?: string) {
    this.assertEnabled();
    const confirm = body?.confirm_current_snapshot_id || null;
    return this.idempotent(userId, 'snapshot.restore', key, { slotId, snapshotId, confirm }, async manager => {
      await this.lockUser(manager, userId);
      const slot = await this.lockSlot(manager, userId, slotId);
      if ((slot.current_snapshot_id || null) !== confirm) this.conflict(confirm, slot.current_snapshot_id || null);
      const sourceRows = await manager.query('SELECT * FROM game_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL LIMIT 1', [snapshotId, slotId]);
      if (!sourceRows.length) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
      const source = sourceRows[0];
      await this.addBlobRefById(manager, source.blob_id);
      const snapshot = await this.insertSnapshot(manager, slot, { ...source, reason: 'restore', base_snapshot_id: slot.current_snapshot_id || null }, source.blob_id, actor);
      await manager.query('UPDATE game_save_slots SET current_snapshot_id=?,updated_at=NOW() WHERE id=?', [snapshot.id, slotId]);
      await this.audit(manager, userId, 'cloud_save.snapshot.restore', { slot_id: slotId, source_snapshot_id: snapshotId, snapshot_id: snapshot.id, revision: snapshot.revision }, actor);
      return this.shapeSnapshot(snapshot, slotId);
    });
  }

  async setPinned(userId: number, slotId: string, snapshotId: string, pinned: boolean, actor: CloudSaveActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      await this.lockSlot(manager, userId, slotId);
      const result = await manager.query('UPDATE game_save_snapshots SET is_pinned=? WHERE id=? AND slot_id=? AND deleted_at IS NULL', [pinned ? 1 : 0, snapshotId, slotId]);
      if (!result.affectedRows) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
      await this.audit(manager, userId, 'cloud_save.snapshot.pin', { slot_id: slotId, snapshot_id: snapshotId, pinned }, actor);
      return { id: snapshotId, pinned };
    });
  }

  async deleteSnapshot(userId: number, slotId: string, snapshotId: string, actor: CloudSaveActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      const slot = await this.lockSlot(manager, userId, slotId);
      if (slot.current_snapshot_id === snapshotId) this.fail('SAVE_CURRENT_SNAPSHOT_DELETE_FORBIDDEN', HttpStatus.CONFLICT, '当前快照不能单独删除，请先恢复其他版本或删除整个存档。');
      const rows = await manager.query('SELECT blob_id FROM game_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL FOR UPDATE', [snapshotId, slotId]);
      if (!rows.length) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
      await manager.query('UPDATE game_save_snapshots SET deleted_at=NOW() WHERE id=?', [snapshotId]);
      await this.releaseBlob(manager, rows[0].blob_id, 1);
      await this.audit(manager, userId, 'cloud_save.snapshot.delete', { slot_id: slotId, snapshot_id: snapshotId }, actor);
      return { id: snapshotId, deleted: true };
    });
  }

  async cancelUpload(userId: number, uploadId: string, actor: CloudSaveActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async manager => {
      await this.lockUser(manager, userId);
      const rows = await manager.query('SELECT id,slot_id,status FROM game_save_upload_sessions WHERE id=? AND user_id=? FOR UPDATE', [uploadId, userId]);
      if (!rows.length) this.notFound('SAVE_UPLOAD_NOT_FOUND', '上传会话不存在。');
      if (rows[0].status === 'committed') this.fail('SAVE_UPLOAD_ALREADY_COMMITTED', HttpStatus.CONFLICT, '上传会话已经提交。');
      await manager.query('UPDATE game_save_upload_sessions SET status=? WHERE id=? AND user_id=? AND status IN (?,?)', ['cancelled', uploadId, userId, 'pending', 'uploaded']);
      await this.audit(manager, userId, 'cloud_save.upload.cancel', { slot_id: rows[0].slot_id, upload_id: uploadId }, actor);
      return { id: uploadId, cancelled: true };
    });
  }

  async getSnapshotForUser(userId: number, snapshotId: string) {
    this.assertEnabled();
    const row = await this.getSnapshotRow(userId, snapshotId);
    return this.shapeSnapshot(row, row.slot_id);
  }

  async runMaintenance(): Promise<{ expiredUploads: number; orphanObjects: number; deletedBlobs: number; deletedSnapshots: number; expiredIdempotencyKeys: number }> {
    if (!this.isStorageReady()) return { expiredUploads: 0, orphanObjects: 0, deletedBlobs: 0, deletedSnapshots: 0, expiredIdempotencyKeys: 0 };
    const expired = await this.dataSource.query(`SELECT id,object_key,status FROM game_save_upload_sessions
      WHERE object_deleted_at IS NULL AND ((status IN ('pending','uploaded') AND expires_at < NOW())
        OR (status IN ('cancelled','expired','failed') AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))) LIMIT 100`);
    let expiredUploads = 0;
    for (const item of expired) {
      if (item.status === 'pending' || item.status === 'uploaded') {
        await this.dataSource.query('UPDATE game_save_upload_sessions SET status=? WHERE id=? AND status IN (?,?)', ['expired', item.id, 'pending', 'uploaded']);
      }
      try {
        await this.storage.deleteObject(item.object_key);
        await this.dataSource.query('UPDATE game_save_upload_sessions SET object_deleted_at=NOW() WHERE id=?', [item.id]);
        expiredUploads++;
      } catch { /* The next maintenance pass retries this object. */ }
    }
    const orphanRows = await this.dataSource.query(`SELECT u.id,u.object_key FROM game_save_upload_sessions u
      JOIN game_save_snapshots s ON s.id=u.committed_snapshot_id JOIN game_save_blobs b ON b.id=s.blob_id
      WHERE u.status='committed' AND u.object_deleted_at IS NULL AND u.object_key<>b.object_key LIMIT 100`);
    let orphanObjects = 0;
    for (const item of orphanRows) {
      try {
        await this.storage.deleteObject(item.object_key);
        await this.dataSource.query('UPDATE game_save_upload_sessions SET object_deleted_at=NOW() WHERE id=?', [item.id]);
        orphanObjects++;
      } catch { /* Retried on the next pass. */ }
    }
    const candidates = await this.dataSource.query(`SELECT id,object_key FROM game_save_blobs
      WHERE ref_count=0 AND gc_in_progress=0 AND pending_delete_at IS NOT NULL AND pending_delete_at<=NOW() LIMIT 100`);
    let deletedBlobs = 0;
    for (const blob of candidates) {
      const claim = await this.dataSource.query('UPDATE game_save_blobs SET gc_in_progress=1 WHERE id=? AND ref_count=0 AND gc_in_progress=0 AND pending_delete_at<=NOW()', [blob.id]);
      if (!claim.affectedRows) continue;
      try {
        await this.storage.deleteObject(blob.object_key);
        await this.dataSource.transaction(async manager => {
          const rows = await manager.query('SELECT id,ref_count,gc_in_progress FROM game_save_blobs WHERE id=? FOR UPDATE', [blob.id]);
          if (!rows.length) return;
          const refs = await manager.query('SELECT COUNT(*) AS count FROM game_save_snapshots WHERE blob_id=? AND deleted_at IS NULL', [blob.id]);
          if (Number(rows[0].ref_count) === 0 && Number(refs[0].count) === 0 && rows[0].gc_in_progress) {
            await manager.query('DELETE FROM game_save_blobs WHERE id=?', [blob.id]);
          } else await manager.query('UPDATE game_save_blobs SET gc_in_progress=0 WHERE id=?', [blob.id]);
        });
        deletedBlobs++;
      } catch {
        await this.dataSource.query('UPDATE game_save_blobs SET gc_in_progress=0,pending_delete_at=DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id=? AND ref_count=0', [this.number('gcGraceHours', 24), blob.id]);
      }
    }
    const deletedSnapshots = await this.applyRetention();
    // Idempotency rows only disappear when the exact same key is replayed, so a
    // busy account would otherwise accumulate response_json payloads forever.
    const purged = await this.dataSource.query(
      'DELETE FROM game_save_idempotency WHERE expires_at < NOW() LIMIT 1000',
    );
    const expiredIdempotencyKeys = Number(purged?.affectedRows || 0);
    return { expiredUploads, orphanObjects, deletedBlobs, deletedSnapshots, expiredIdempotencyKeys };
  }

  /**
   * Sweep slots in id order so every slot is eventually visited. Ordering by
   * `updated_at` starved anything past the first page: dormant slots keep their
   * old timestamp and permanently occupy the front of the queue.
   */
  private async applyRetention(): Promise<number> {
    const [{ last_id }] = await this.dataSource.query(`SELECT CAST(COALESCE((
        SELECT value FROM settings WHERE \`key\` = 'cloud_saves_retention_cursor'
      ), '0') AS CHAR) AS last_id`);
    const page = await this.dataSource.query(`SELECT id FROM game_save_slots
      WHERE deleted_at IS NULL AND id > ? ORDER BY id ASC LIMIT 200`, [String(last_id)]);
    const rows = page.length
      ? page
      : await this.dataSource.query('SELECT id FROM game_save_slots WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 200');
    let removed = 0;
    const maxHistory = this.number('maxHistoryPerSlot', 20);
    const cutoff = new Date(Date.now() - this.number('retentionDays', 90) * 86_400_000);
    for (const candidate of rows) {
      removed += await this.dataSource.transaction(async manager => {
        const slotRows = await manager.query('SELECT id,user_id,current_snapshot_id FROM game_save_slots WHERE id=? AND deleted_at IS NULL FOR UPDATE', [candidate.id]);
        if (!slotRows.length) return 0;
        const active = await manager.query(`SELECT id,blob_id,created_at FROM game_save_snapshots
          WHERE slot_id=? AND deleted_at IS NULL AND is_pinned=0 AND id<>COALESCE(?, '') ORDER BY revision DESC`, [candidate.id, slotRows[0].current_snapshot_id]);
        let rank = 0;
        let count = 0;
        for (const snapshot of active) {
          rank++;
          if (rank > maxHistory || new Date(snapshot.created_at).getTime() < cutoff.getTime()) {
            await manager.query('UPDATE game_save_snapshots SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL', [snapshot.id]);
            await this.releaseBlob(manager, snapshot.blob_id, 1);
            count++;
          }
        }
        return count;
      });
    }
    if (rows.length) await this.saveRetentionCursor(String(rows[rows.length - 1].id));
    return removed;
  }

  /** Advance the round-robin cursor; a missing settings row must not fail the sweep. */
  private async saveRetentionCursor(value: string): Promise<void> {
    try {
      await this.dataSource.query(`INSERT INTO settings (\`key\`, value, category, description, updated_at)
        VALUES ('cloud_saves_retention_cursor', ?, 'cloud-saves', 'Internal: cloud save retention sweep cursor', NOW())
        ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`, [value]);
    } catch { /* The next pass re-reads the previous cursor and retries. */ }
  }

  /** Mark a session failed so the next maintenance pass deletes its staged object. */
  private async discardUpload(manager: EntityManager, session: any): Promise<void> {
    await manager.query('UPDATE game_save_upload_sessions SET status=? WHERE id=? AND status IN (?,?)', ['failed', session.id, 'pending', 'uploaded']);
  }

  private async addBlobReference(manager: EntityManager, userId: number, session: any): Promise<string> {
    const rows = await manager.query('SELECT * FROM game_save_blobs WHERE user_id=? AND sha256=? AND size_bytes=? FOR UPDATE', [userId, session.expected_sha256, String(session.expected_size_bytes)]);
    if (rows.length) {
      const blob = rows[0];
      if (blob.gc_in_progress) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存储清理正在处理此内容，请稍后重试。', true);
      await manager.query('UPDATE game_save_blobs SET ref_count=ref_count+1,pending_delete_at=NULL,last_referenced_at=NOW() WHERE id=?', [blob.id]);
      return String(blob.id);
    }
    const blobId = randomUUID();
    await manager.query(`INSERT INTO game_save_blobs (id,user_id,sha256,size_bytes,storage_provider,object_key,ref_count)
      VALUES (?,?,?,?,?,?,1)`, [blobId, userId, session.expected_sha256, String(session.expected_size_bytes), this.storage.provider, session.object_key]);
    return blobId;
  }

  private async addBlobRefById(manager: EntityManager, blobId: string): Promise<void> {
    const rows = await manager.query('SELECT id,gc_in_progress FROM game_save_blobs WHERE id=? FOR UPDATE', [blobId]);
    if (!rows.length) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '快照文件记录暂不可用。', true);
    if (rows[0].gc_in_progress) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '存储清理正在处理此内容，请稍后重试。', true);
    await manager.query('UPDATE game_save_blobs SET ref_count=ref_count+1,pending_delete_at=NULL,last_referenced_at=NOW() WHERE id=?', [blobId]);
  }

  private async releaseBlob(manager: EntityManager, blobId: string, count: number): Promise<void> {
    const rows = await manager.query('SELECT ref_count FROM game_save_blobs WHERE id=? FOR UPDATE', [blobId]);
    if (!rows.length) return;
    const next = Math.max(0, Number(rows[0].ref_count) - Math.max(0, count));
    const pending = next === 0 ? new Date(Date.now() + this.number('gcGraceHours', 24) * 3_600_000) : null;
    await manager.query('UPDATE game_save_blobs SET ref_count=?,pending_delete_at=?,gc_in_progress=0 WHERE id=?', [next, pending, blobId]);
  }

  private async insertSnapshot(manager: EntityManager, slot: any, source: any, blobId: string, actor: CloudSaveActor) {
    const [{ revision }] = await manager.query('SELECT COALESCE(MAX(revision),0)+1 AS revision FROM game_save_snapshots WHERE slot_id=? FOR UPDATE', [slot.id]);
    const id = randomUUID();
    const metadata = source.mods_manifest_json;
    await manager.query(`INSERT INTO game_save_snapshots
      (id,slot_id,revision,blob_id,sha256,size_bytes,game_version,game_build,map_name,wave,playtime_seconds,
       mods_manifest_json,mods_manifest_hash,created_by_client_id,device_id,reason,base_snapshot_id,is_pinned)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`, [
      id, slot.id, Number(revision), blobId, source.expected_sha256 || source.sha256,
      String(source.expected_size_bytes ?? source.size_bytes), source.game_version ?? null, source.game_build ?? null,
      source.map_name ?? null, source.wave ?? null, source.playtime_seconds ?? null,
      typeof metadata === 'string' ? metadata : metadata ? JSON.stringify(metadata) : null,
      source.mods_manifest_hash ?? null, actor.clientId || source.created_by_client_id || null,
      actor.deviceId || source.device_id || null, source.reason || 'manual', source.base_snapshot_id || null,
    ]);
    return { id, slot_id: slot.id, revision: Number(revision), sha256: source.expected_sha256 || source.sha256,
      size_bytes: String(source.expected_size_bytes ?? source.size_bytes), game_version: source.game_version ?? null,
      game_build: source.game_build ?? null, map_name: source.map_name ?? null, wave: source.wave ?? null,
      playtime_seconds: source.playtime_seconds ?? null, mods_manifest_json: metadata, mods_manifest_hash: source.mods_manifest_hash ?? null,
      created_by_client_id: actor.clientId || source.created_by_client_id || null, device_id: actor.deviceId || source.device_id || null,
      reason: source.reason || 'manual', base_snapshot_id: source.base_snapshot_id || null, is_pinned: false, created_at: new Date() };
  }

  private async findSlot(userId: number, slotId: string) {
      const rows = await this.dataSource.query('SELECT * FROM game_save_slots WHERE id=? AND user_id=? AND deleted_at IS NULL LIMIT 1', [slotId, userId]);
    if (!rows.length) this.notFound('SAVE_NOT_FOUND', '云存档不存在。');
    return rows[0];
  }

  private async lockSlot(manager: EntityManager, userId: number, slotId: string) {
    const rows = await manager.query('SELECT * FROM game_save_slots WHERE id=? AND user_id=? AND deleted_at IS NULL FOR UPDATE', [slotId, userId]);
    if (!rows.length) this.notFound('SAVE_NOT_FOUND', '云存档不存在。');
    return rows[0];
  }

  private async lockUser(manager: EntityManager, userId: number): Promise<void> {
    const rows = await manager.query('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    if (!rows.length) this.notFound('SAVE_NOT_FOUND', '用户不存在。');
  }

  private async getSnapshotRow(userId: number, snapshotId: string) {
    const rows = await this.dataSource.query(`SELECT sn.* FROM game_save_snapshots sn JOIN game_save_slots s ON s.id=sn.slot_id
      WHERE sn.id=? AND s.user_id=? AND s.deleted_at IS NULL AND sn.deleted_at IS NULL LIMIT 1`, [snapshotId,userId]);
    if (!rows.length) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
    return rows[0];
  }

  private async getSnapshotWith(manager: EntityManager, snapshotId: string) {
    const rows = await manager.query(`SELECT sn.* FROM game_save_snapshots sn JOIN game_save_slots s ON s.id=sn.slot_id
      WHERE sn.id=? AND s.deleted_at IS NULL AND sn.deleted_at IS NULL LIMIT 1`, [snapshotId]);
    if (!rows.length) this.notFound('SAVE_SNAPSHOT_NOT_FOUND', '快照不存在。');
    return this.shapeSnapshot(rows[0], rows[0].slot_id);
  }

  private shapeSlot(row: any) {
    const current = row.snapshot_id ? {
      id: row.snapshot_id, revision: Number(row.revision), sha256: row.sha256, size: Number(row.size_bytes),
      game: { version: row.game_version ?? null, build: row.game_build ?? null },
      save: { map_name: row.map_name ?? null, wave: row.wave ?? null, playtime_seconds: row.playtime_seconds == null ? null : Number(row.playtime_seconds) },
      created_at: row.snapshot_created_at,
    } : null;
    return { id: row.id, name: row.name, current_snapshot: current, created_at: row.created_at ?? null, updated_at: row.updated_at };
  }

  private shapeHistory(row: any, _slotName: string) {
    const mods = parseJson(row.mods_manifest_json);
    return { id: row.id, revision: Number(row.revision), reason: row.reason, size: Number(row.size_bytes), sha256: row.sha256,
      game: { version: row.game_version ?? null, build: row.game_build ?? null },
      save: { map_name: row.map_name ?? null, wave: row.wave ?? null, playtime_seconds: row.playtime_seconds == null ? null : Number(row.playtime_seconds) },
      mods: { count: Array.isArray(mods) ? mods.length : 0, manifest_hash: row.mods_manifest_hash ?? null },
      source: { client_id: row.created_by_client_id ?? null, client_name: row.created_by_client_id ? null : 'Unknown / Removed OAuth Client', device_id: row.device_id ?? null },
      pinned: Boolean(row.is_pinned), created_at: row.created_at };
  }

  private shapeSnapshot(row: any, slotId: string) {
    return { id: row.id, slot_id: slotId, revision: Number(row.revision), sha256: row.sha256, size: Number(row.size_bytes),
      game: { version: row.game_version ?? null, build: row.game_build ?? null },
      save: { map_name: row.map_name ?? null, wave: row.wave ?? null, playtime_seconds: row.playtime_seconds == null ? null : Number(row.playtime_seconds) },
      reason: row.reason, created_at: row.created_at };
  }

  private async audit(manager: EntityManager, userId: number, action: string, details: Record<string, unknown>, actor: CloudSaveActor): Promise<void> {
    const body = { ...details, client_id: actor.clientId || null, device_id: actor.deviceId || null, request_id: actor.requestId || null };
    await manager.query(`INSERT INTO operation_logs (user_id,action,target_type,target_id,details,ip_address,user_agent,created_at)
      VALUES (?,?, 'cloud_save', NULL, ?, ?, ?, NOW())`, [userId, action, JSON.stringify(body), actor.ip || null, (actor.userAgent || '').slice(0, 1000) || null]);
  }

  private async idempotent<T>(userId: number, operation: string, key: string | undefined, payload: unknown, callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    const normalizedKey = key?.trim();
    if (!normalizedKey) return this.dataSource.transaction(manager => callback(manager));
    if (!/^[\x21-\x7e]{1,128}$/.test(normalizedKey)) this.fail('SAVE_INVALID_METADATA', HttpStatus.BAD_REQUEST, 'Idempotency-Key 格式无效。');
    const fingerprint = createHash('sha256').update(canonical(payload)).digest('hex');
    try {
      return await this.dataSource.transaction(async manager => {
        await manager.query('DELETE FROM game_save_idempotency WHERE user_id=? AND operation=? AND idempotency_key=? AND expires_at<=NOW()', [userId, operation, normalizedKey]);
        await manager.query(`INSERT INTO game_save_idempotency (user_id,operation,idempotency_key,request_sha256,expires_at)
          VALUES (?,?,?,?,DATE_ADD(NOW(), INTERVAL 24 HOUR))`, [userId, operation, normalizedKey, fingerprint]);
        const result = await callback(manager);
        await manager.query('UPDATE game_save_idempotency SET response_json=? WHERE user_id=? AND operation=? AND idempotency_key=?', [JSON.stringify(result), userId, operation, normalizedKey]);
        return result;
      });
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY' && error?.driverError?.code !== 'ER_DUP_ENTRY' && error?.errno !== 1062) throw error;
      const rows = await this.dataSource.query('SELECT request_sha256,response_json FROM game_save_idempotency WHERE user_id=? AND operation=? AND idempotency_key=? AND expires_at>NOW() LIMIT 1', [userId, operation, normalizedKey]);
      if (!rows.length) throw error;
      if (rows[0].request_sha256 !== fingerprint) this.fail('IDEMPOTENCY_KEY_REUSED', HttpStatus.CONFLICT, '此 Idempotency-Key 已用于不同请求。');
      if (!rows[0].response_json) this.fail('IDEMPOTENCY_IN_PROGRESS', HttpStatus.CONFLICT, '相同请求仍在处理中，请稍后重试。', true);
      return JSON.parse(rows[0].response_json);
    }
  }

  private conflict(base: string | null, current: string | null, suggestConflictCopy = false): never {
    const details: Record<string, unknown> = { base_snapshot_id: base, current_snapshot_id: current };
    // Without this hint a client only learns the head moved after it has already
    // uploaded the whole file; the retry has to re-upload with a new session.
    if (suggestConflictCopy) details.suggested_resolution = 'create_conflict_copy';
    throw new ApiV1Exception('SAVE_CONFLICT', HttpStatus.CONFLICT, '云存档自上次同步后已有更新。', false, [details]);
  }
  private assertEnabled(): void {
    if (this.settings.getCached('cloud_saves_enabled') !== 'true') this.fail('CLOUD_SAVES_DISABLED', HttpStatus.FORBIDDEN, '云存档功能尚未启用。');
    if (!this.storage.isConfigured()) this.fail('SAVE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '云存档存储尚未配置。', true);
  }
  private number(key: string, fallback: number): number {
    if (key === 'maxBytesPerUser') return this.settingNumber('cloud_saves_user_quota_bytes', fallback);
    if (key === 'maxFileBytes') return this.settingNumber('cloud_saves_max_file_bytes', fallback);
    const value = Number(this.config.get(`cloudSaves.${key}`));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
  private settingNumber(key: string, fallback: number): number {
    const value = Number(this.settings.getCached(key));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
  private fail(code: string, status: HttpStatus, message: string, retryable = false): never { throw new ApiV1Exception(code, status, message, retryable); }
  private notFound(code: string, message: string): never { throw new ApiV1Exception(code, HttpStatus.NOT_FOUND, message); }
}

function boundedOpaque(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ApiV1Exception('SAVE_INVALID_METADATA', HttpStatus.BAD_REQUEST, '设备标识无效。');
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}
