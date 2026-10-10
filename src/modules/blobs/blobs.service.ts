import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { SettingsService } from '../settings/settings.service';
import { BlobStorageError, BlobStorageService } from './blob-storage.service';
import { decodeBlobCursor, encodeBlobCursor } from './blob-cursor.util';
import {
  BLOB_GC_GRACE_HOURS,
  BLOB_IDEMPOTENCY_TTL_HOURS,
  BLOB_UPLOAD_SESSION_MINUTES,
  DEFAULT_BLOB_MAX_OBJECT_BYTES,
  DEFAULT_BLOB_NAMESPACE,
  DEFAULT_BLOB_QUOTA_BYTES,
  MAX_OPEN_BLOB_UPLOADS,
  RESERVED_BLOB_NAMESPACES,
} from './blobs.constants';

export type BlobOwner = { owner_type: string; owner_id: string; user_id: number | null };

export type BlobActor = {
  clientId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export type CreateBlobInput = {
  namespace?: string;
  key: string;
  file_name: string;
  size_bytes: number;
  sha256: string;
  mime_type: string;
  visibility?: 'private' | 'public';
  metadata?: Record<string, unknown>;
  tags?: string[];
  ref_type?: string;
  ref_id?: string;
  expires_in_seconds?: number;
};

export type UpdateBlobInput = {
  key?: string;
  file_name?: string;
  visibility?: 'private' | 'public';
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
  ref_type?: string | null;
  ref_id?: string | null;
};

export type ListBlobsInput = {
  namespace?: string;
  ref_type?: string;
  ref_id?: string;
  cursor?: string;
  limit?: number;
};

const MAX_KEY_LENGTH = 255;

/**
 * Generic blob storage, independent of any one business domain.
 *
 * The shape of the contract is deliberately the same one the forum already uses
 * for durable binaries: declare the content, upload the bytes to a URL that is
 * bound to an authorized session, then commit — and only then does the server
 * read the object back and create the durable row. What is *new* here is that the
 * namespace, key, metadata and reference are supplied by the caller instead of
 * being hard-coded to resources, saves or attachments, so a new module can store
 * bytes without adding another table and another download endpoint.
 *
 * Ownership lives on the row rather than being inferred from a join: every
 * read, write and delete resolves `(owner_type, owner_id)` first. That keeps an
 * erasure request answerable from this module alone.
 */
@Injectable()
export class BlobsService {
  private readonly logger = new Logger(BlobsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly storage: BlobStorageService,
    private readonly settings: SettingsService,
  ) {}

  static userOwner(userId: number): BlobOwner {
    return { owner_type: 'user', owner_id: String(userId), user_id: userId };
  }

  isEnabled(): boolean {
    return this.settings.getCached('blobs_enabled') === 'true';
  }

  isStorageReady(): boolean {
    return this.storage.isConfigured();
  }

  /** Feature discovery for `GET /api/v1/capabilities`. */
  capability(): boolean {
    return this.isEnabled() && this.isStorageReady();
  }

  // ---------------------------------------------------------------- uploads

  /**
   * Open an upload session for one blob key.
   *
   * Returns `deduplicated: true` when the caller's own content is already stored,
   * because then the bytes never have to move; commit is still required, so the
   * client has exactly one flow to implement.
   */
  async createUpload(owner: BlobOwner, input: CreateBlobInput, actor: BlobActor, idempotencyKey?: string) {
    this.assertEnabled();
    const namespace = this.normalizeNamespace(input.namespace);
    const key = this.normalizeKey(input.key);
    const fileName = this.normalizeFileName(input.file_name);
    const mimeType = this.normalizeMime(input.mime_type);
    const sha256 = this.normalizeHash(input.sha256);
    const maxObjectBytes = this.maxObjectBytes();
    const size = Number(input.size_bytes);
    if (!Number.isSafeInteger(size) || size <= 0) this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, '文件大小无效。');
    if (size > maxObjectBytes) this.fail('BLOB_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '文件超过单对象大小限制。');
    const visibility = input.visibility === 'public' ? 'public' : 'private';
    const metadata = this.normalizeMetadata(input.metadata);
    const tags = this.normalizeTags(input.tags);
    const refType = this.normalizeOptional(input.ref_type, 32);
    const refId = this.normalizeOptional(input.ref_id, 64);
    const expiresAt = this.resolveExpiry(input.expires_in_seconds);

    const payload = { namespace, key, fileName, mimeType, sha256, size, visibility, metadata, tags, refType, refId, expiresAt };
    return this.idempotent(owner, 'blob.upload.create', idempotencyKey, payload, async (manager) => {
      await this.assertQuota(manager, owner, namespace, sha256, size);
      await this.assertOpenUploadBudget(manager, owner);
      const sessionId = randomUUID();
      const objectKey = this.buildObjectKey(owner, namespace);
      await manager.query(
        `INSERT INTO blob_upload_sessions
           (id,owner_type,owner_id,user_id,namespace,blob_key,expected_sha256,expected_size_bytes,file_name,mime_type,
            visibility,metadata_json,tags_json,ref_type,ref_id,object_id,object_key,storage_provider,status,expires_at,record_expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
        [sessionId, owner.owner_type, owner.owner_id, owner.user_id, namespace, key, sha256, String(size), fileName,
          mimeType, visibility, metadata ? JSON.stringify(metadata) : null, tags ? JSON.stringify(tags) : null,
          refType, refId, null, objectKey, this.storage.provider, BLOB_UPLOAD_SESSION_MINUTES, expiresAt],
      );
      const reusable = await this.findReusableObject(manager, owner, namespace, sha256, size);
      if (reusable) {
        await manager.query('UPDATE blob_upload_sessions SET object_id=? WHERE id=?', [reusable.id, sessionId]);
        await this.audit(manager, owner, 'blob.upload.deduplicated', { upload_id: sessionId, namespace, key, sha256, size_bytes: size }, actor);
        return { upload_id: sessionId, deduplicated: true, commit_required: true as const };
      }
      await this.audit(manager, owner, 'blob.upload.create', { upload_id: sessionId, namespace, key, sha256, size_bytes: size }, actor);
      return {
        upload_id: sessionId,
        deduplicated: false,
        commit_required: true as const,
        upload: { url: this.uploadUrl(sessionId), expires_at: new Date(Date.now() + BLOB_UPLOAD_SESSION_MINUTES * 60_000).toISOString() },
      };
    });
  }

  async receiveUpload(owner: BlobOwner, uploadId: string, source: NodeJS.ReadableStream, actor: BlobActor) {
    this.assertEnabled();
    const rows = await this.dataSource.query(
      'SELECT * FROM blob_upload_sessions WHERE id=? AND owner_type=? AND owner_id=? LIMIT 1',
      [uploadId, owner.owner_type, owner.owner_id],
    );
    if (!rows.length) this.notFound('BLOB_UPLOAD_NOT_FOUND', '上传会话不存在。');
    const session = rows[0];
    if (session.status === 'committed') this.fail('BLOB_UPLOAD_ALREADY_COMMITTED', HttpStatus.CONFLICT, '上传会话已经提交。');
    // Bytes that already exist are referenced, not copied: a PUT here would write a
    // second file for content the object table already owns.
    if (session.object_id) return { ...this.uploadReceipt(session), deduplicated: true };
    if (!['pending', 'uploaded'].includes(session.status) || new Date(session.expires_at).getTime() <= Date.now()) {
      this.fail('BLOB_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    }

    try {
      await this.storage.writeObject(
        session.object_key,
        source as any,
        Number(session.expected_size_bytes),
        String(session.expected_sha256),
        this.maxObjectBytes(),
      );
    } catch (error: any) {
      if (error instanceof BlobStorageError) {
        if (error.code === 'BLOB_FILE_TOO_LARGE') this.fail('BLOB_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '文件超过单对象大小限制。');
        if (error.code === 'BLOB_UPLOAD_SIZE_MISMATCH') this.fail('BLOB_UPLOAD_SIZE_MISMATCH', HttpStatus.CONFLICT, '上传文件大小与声明不一致。');
        if (error.code === 'BLOB_UPLOAD_CHECKSUM_MISMATCH') this.fail('BLOB_UPLOAD_CHECKSUM_MISMATCH', HttpStatus.CONFLICT, '上传文件 SHA-256 与声明不一致。');
      }
      this.fail('BLOB_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '无法写入 blob 存储目录。', true);
    }

    // The session may have expired while the body was streaming in. Deleting the
    // object keeps a late PUT from leaving bytes nothing will ever commit.
    const updated = await this.dataSource.query(
      `UPDATE blob_upload_sessions SET status='uploaded' WHERE id=? AND owner_type=? AND owner_id=? AND status IN ('pending','uploaded') AND expires_at>NOW()`,
      [uploadId, owner.owner_type, owner.owner_id],
    );
    if (!updated.affectedRows) {
      await this.storage.deleteObject(session.object_key).catch(() => undefined);
      this.fail('BLOB_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
    }
    await this.audit(this.dataSource.manager, owner, 'blob.upload.received', {
      upload_id: uploadId, namespace: session.namespace, size_bytes: Number(session.expected_size_bytes),
    }, actor);
    return this.uploadReceipt(session);
  }

  private uploadReceipt(session: any) {
    return {
      upload_id: String(session.id),
      uploaded: true,
      size_bytes: Number(session.expected_size_bytes),
      sha256: String(session.expected_sha256),
    };
  }

  /**
   * Bind a verified object to a durable blob.
   *
   * Everything that becomes durable is taken from the server's own reading of the
   * stored object: the caller's declared filename and MIME are only used after the
   * size and digest in the session have been re-checked against the file. The
   * session row is the authorization context, so an upload ID from another account
   * resolves to nothing.
   */
  async commitUpload(owner: BlobOwner, uploadId: string, actor: BlobActor, idempotencyKey?: string) {
    this.assertEnabled();
    return this.idempotent(owner, 'blob.upload.commit', idempotencyKey, { uploadId }, async (manager) => {
      const rows = await manager.query(
        'SELECT * FROM blob_upload_sessions WHERE id=? AND owner_type=? AND owner_id=? FOR UPDATE',
        [uploadId, owner.owner_type, owner.owner_id],
      );
      if (!rows.length) this.notFound('BLOB_UPLOAD_NOT_FOUND', '上传会话不存在。');
      const session = rows[0];
      if (session.status === 'committed' && session.committed_blob_id) {
        const blob = await this.requireBlobRow(manager, String(session.committed_blob_id));
        return { blob: this.shapeBlob(blob), committed: true as const };
      }
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        await manager.query(`UPDATE blob_upload_sessions SET status='expired' WHERE id=? AND status IN ('pending','uploaded')`, [uploadId]);
        this.fail('BLOB_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期。');
      }
      if (!['pending', 'uploaded'].includes(session.status)) {
        this.fail('BLOB_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期或已取消。');
      }

      const expectedSize = Number(session.expected_size_bytes);
      const expectedSha = String(session.expected_sha256);
      const object = await this.resolveVerifiedObject(manager, owner, session, expectedSize, expectedSha);

      // Writing to an occupied key replaces the previous blob: a key is a slot.
      // The old record is only tombstoned, and its object's reference is dropped,
      // so the bytes stay until the last binding is gone.
      const replaced = await manager.query(
        `SELECT id,object_id FROM blob_records
          WHERE namespace=? AND owner_type=? AND owner_id=? AND blob_key=? AND status='active' FOR UPDATE`,
        [session.namespace, owner.owner_type, owner.owner_id, session.blob_key],
      );
      for (const previous of replaced) {
        await manager.query(
          `UPDATE blob_records SET status='deleted',active_slot=NULL,deleted_at=NOW(),updated_at=NOW() WHERE id=?`,
          [previous.id],
        );
        await this.releaseObject(manager, String(previous.object_id), 1);
      }

      const metadata = parseJson(session.metadata_json);
      const tags = parseJson(session.tags_json);
      const blobId = randomUUID();
      // The record keeps the lifetime the caller asked for, not the session's own
      // short TTL; temporary blobs are the reason `expires_at` exists on both.
      const recordExpiresAt = session.record_expires_at ? new Date(session.record_expires_at) : null;
      await manager.query(
        `INSERT INTO blob_records
           (id,namespace,owner_type,owner_id,blob_key,object_id,file_name,mime_type,size_bytes,sha256,visibility,status,
            metadata_json,tags_json,ref_type,ref_id,expires_at,created_by_user_id,active_slot,deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,1,NULL)`,
        [blobId, session.namespace, owner.owner_type, owner.owner_id, session.blob_key, object.id,
          session.file_name, session.mime_type, String(expectedSize), expectedSha, session.visibility,
          metadata ? JSON.stringify(metadata) : null, tags ? JSON.stringify(tags) : null,
          session.ref_type, session.ref_id, recordExpiresAt, owner.user_id],
      );
      await manager.query(
        `UPDATE blob_upload_sessions SET status='committed',committed_at=NOW(),committed_blob_id=? WHERE id=?`,
        [blobId, uploadId],
      );
      await this.audit(manager, owner, 'blob.upload.commit', {
        upload_id: uploadId, blob_id: blobId, namespace: session.namespace, key: session.blob_key,
        size_bytes: expectedSize, sha256: expectedSha, replaced_records: replaced.length,
      }, actor);
      const blob = await this.requireBlobRow(manager, blobId);
      return { blob: this.shapeBlob(blob), committed: true as const };
    });
  }

  async cancelUpload(owner: BlobOwner, uploadId: string, actor: BlobActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        'SELECT id,status,object_key FROM blob_upload_sessions WHERE id=? AND owner_type=? AND owner_id=? FOR UPDATE',
        [uploadId, owner.owner_type, owner.owner_id],
      );
      if (!rows.length) this.notFound('BLOB_UPLOAD_NOT_FOUND', '上传会话不存在。');
      if (rows[0].status === 'committed') this.fail('BLOB_UPLOAD_ALREADY_COMMITTED', HttpStatus.CONFLICT, '上传会话已经提交。');
      await manager.query(
        `UPDATE blob_upload_sessions SET status='cancelled' WHERE id=? AND status IN ('pending','uploaded')`,
        [uploadId],
      );
      await this.audit(manager, owner, 'blob.upload.cancel', { upload_id: uploadId }, actor);
      return { id: uploadId, cancelled: true };
    });
  }

  // ------------------------------------------------------------------ reads

  async listBlobs(owner: BlobOwner, input: ListBlobsInput) {
    this.assertEnabled();
    const namespace = input.namespace ? this.normalizeNamespace(input.namespace) : null;
    const limit = Math.max(1, Math.min(Number.isSafeInteger(Number(input.limit)) ? Number(input.limit) : 30, 100));
    const cursor = decodeBlobCursor(input.cursor);
    const args: unknown[] = [owner.owner_type, owner.owner_id];
    let condition = `owner_type=? AND owner_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())`;
    if (namespace) { condition += ' AND namespace=?'; args.push(namespace); }
    if (input.ref_type) { condition += ' AND ref_type=?'; args.push(this.normalizeOptional(input.ref_type, 32)); }
    if (input.ref_id) { condition += ' AND ref_id=?'; args.push(this.normalizeOptional(input.ref_id, 64)); }
    if (cursor) {
      condition += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      args.push(cursor.created_at, cursor.created_at, cursor.id);
    }
    const rows = await this.dataSource.query(
      `SELECT * FROM blob_records WHERE ${condition} ORDER BY created_at DESC, id DESC LIMIT ?`,
      [...args, limit + 1],
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const data = page.map((row: any) => this.shapeBlob(row));
    Object.defineProperty(data, '__v1NextCursor', {
      value: hasMore ? encodeBlobCursor(page[page.length - 1].created_at, String(page[page.length - 1].id)) : null,
      enumerable: false,
    });
    return data;
  }

  async getBlob(viewer: BlobOwner | null, blobId: string) {
    this.assertEnabled();
    const row = await this.findVisible(viewer, blobId);
    return this.shapeBlob(row);
  }

  async openBlobContent(viewer: BlobOwner | null, blobId: string) {
    this.assertEnabled();
    const row = await this.findVisible(viewer, blobId);
    try {
      const file = await this.storage.openObject(String(row.object_key));
      return { ...file, row };
    } catch {
      this.fail('BLOB_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, 'blob 内容暂不可用。', true);
    }
  }

  async usage(owner: BlobOwner) {
    this.assertEnabled();
    return this.usageFor(this.dataSource.manager, owner);
  }

  // ----------------------------------------------------------------- writes

  async updateBlob(owner: BlobOwner, blobId: string, input: UpdateBlobInput, actor: BlobActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM blob_records WHERE id=? AND owner_type=? AND owner_id=? AND status='active' FOR UPDATE`,
        [blobId, owner.owner_type, owner.owner_id],
      );
      if (!rows.length) this.notFound('BLOB_NOT_FOUND', 'blob 不存在。');
      const current = rows[0];

      const nextKey = input.key === undefined ? String(current.blob_key) : this.normalizeKey(input.key);
      if (nextKey !== current.blob_key) {
        const clash = await manager.query(
          `SELECT id FROM blob_records
            WHERE namespace=? AND owner_type=? AND owner_id=? AND blob_key=? AND status='active' AND id<>? FOR UPDATE`,
          [current.namespace, owner.owner_type, owner.owner_id, nextKey, blobId],
        );
        if (clash.length) {
          this.fail('BLOB_KEY_CONFLICT', HttpStatus.CONFLICT, '目标 key 已被占用；请先删除或替换该 blob。');
        }
      }
      const fileName = input.file_name === undefined ? current.file_name : this.normalizeFileName(input.file_name);
      const visibility = input.visibility === undefined ? current.visibility
        : (input.visibility === 'public' ? 'public' : 'private');
      const metadata = input.metadata === undefined ? parseJson(current.metadata_json) : this.normalizeMetadata(input.metadata);
      const tags = input.tags === undefined ? parseJson(current.tags_json) : this.normalizeTags(input.tags);
      const refType = input.ref_type === undefined ? current.ref_type : this.normalizeOptional(input.ref_type, 32);
      const refId = input.ref_id === undefined ? current.ref_id : this.normalizeOptional(input.ref_id, 64);

      await manager.query(
        `UPDATE blob_records SET blob_key=?,file_name=?,visibility=?,metadata_json=?,tags_json=?,ref_type=?,ref_id=?,updated_at=NOW() WHERE id=?`,
        [nextKey, fileName, visibility, metadata ? JSON.stringify(metadata) : null,
          tags ? JSON.stringify(tags) : null, refType, refId, blobId],
      );
      await this.audit(manager, owner, 'blob.update', { blob_id: blobId, visibility }, actor);
      const updated = await this.requireBlobRow(manager, blobId);
      return this.shapeBlob(updated);
    });
  }

  async deleteBlob(owner: BlobOwner, blobId: string, actor: BlobActor) {
    this.assertEnabled();
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id,object_id FROM blob_records WHERE id=? AND owner_type=? AND owner_id=? AND status='active' FOR UPDATE`,
        [blobId, owner.owner_type, owner.owner_id],
      );
      if (!rows.length) this.notFound('BLOB_NOT_FOUND', 'blob 不存在。');
      await manager.query(
        `UPDATE blob_records SET status='deleted',active_slot=NULL,deleted_at=NOW(),updated_at=NOW() WHERE id=?`,
        [blobId],
      );
      await this.releaseObject(manager, String(rows[0].object_id), 1);
      await this.audit(manager, owner, 'blob.delete', { blob_id: blobId }, actor);
      return { id: blobId, deleted: true as const };
    });
  }

  /** Account erasure: tombstone every binding, then let the bytes fall to GC. */
  async markOwnerDataDeleted(ownerType: string, ownerId: string): Promise<{ records: number; objects: number; uploads: number }> {
    return this.dataSource.transaction(async (manager) => {
      const records = await manager.query(
        `SELECT id,object_id FROM blob_records WHERE owner_type=? AND owner_id=? AND status='active' FOR UPDATE`,
        [ownerType, ownerId],
      );
      const perObject = new Map<string, number>();
      for (const record of records) {
        const objectId = String(record.object_id);
        perObject.set(objectId, (perObject.get(objectId) || 0) + 1);
      }
      if (records.length) {
        await manager.query(
          `UPDATE blob_records SET status='deleted',active_slot=NULL,deleted_at=NOW(),updated_at=NOW()
            WHERE owner_type=? AND owner_id=? AND status='active'`,
          [ownerType, ownerId],
        );
        for (const [objectId, count] of perObject) await this.releaseObject(manager, objectId, count);
      }
      const cancelled = await manager.query(
        `UPDATE blob_upload_sessions SET status='cancelled' WHERE owner_type=? AND owner_id=? AND status IN ('pending','uploaded')`,
        [ownerType, ownerId],
      );
      const uploads = Number(cancelled?.affectedRows || 0);
      if (records.length || uploads) {
        await this.audit(manager, { owner_type: ownerType, owner_id: ownerId, user_id: null }, 'blob.account_delete', {
          records: records.length, objects: perObject.size, uploads,
        }, {});
      }
      return { records: records.length, objects: perObject.size, uploads };
    });
  }

  async markUserDataDeleted(userId: number) {
    return this.markOwnerDataDeleted('user', String(userId));
  }

  // ------------------------------------------------------------ maintenance

  async runMaintenance(): Promise<{
    expiredUploads: number; orphanObjects: number; expiredBlobs: number; deletedObjects: number; expiredIdempotencyKeys: number;
  }> {
    if (!this.isStorageReady()) {
      return { expiredUploads: 0, orphanObjects: 0, expiredBlobs: 0, deletedObjects: 0, expiredIdempotencyKeys: 0 };
    }
    const expiredUploads = await this.sweepUploads();
    const orphanObjects = await this.sweepOrphanObjects();
    const expiredBlobs = await this.sweepExpiredBlobs();
    const deletedObjects = await this.sweepObjects();
    const expiredIdempotencyKeys = await this.sweepIdempotency();
    if (expiredUploads || orphanObjects || expiredBlobs || deletedObjects) {
      this.logger.log(`Blob maintenance: ${JSON.stringify({ expiredUploads, orphanObjects, expiredBlobs, deletedObjects })}`);
    }
    return { expiredUploads, orphanObjects, expiredBlobs, deletedObjects, expiredIdempotencyKeys };
  }

  private async sweepUploads(): Promise<number> {
    const stale = await this.dataSource.query(
      `SELECT id,object_key,status FROM blob_upload_sessions
        WHERE object_deleted_at IS NULL AND ((status IN ('pending','uploaded') AND expires_at < NOW())
          OR (status IN ('cancelled','expired','failed') AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)))
        LIMIT 100`,
    );
    let removed = 0;
    for (const item of stale) {
      if (item.status === 'pending' || item.status === 'uploaded') {
        await this.dataSource.query(
          `UPDATE blob_upload_sessions SET status='expired' WHERE id=? AND status IN ('pending','uploaded')`,
          [item.id],
        );
      }
      try {
        await this.storage.deleteObject(item.object_key);
        await this.dataSource.query('UPDATE blob_upload_sessions SET object_deleted_at=NOW() WHERE id=?', [item.id]);
        removed += 1;
      } catch { /* The next maintenance pass retries this object. */ }
    }
    return removed;
  }

  /**
   * A commit binds the object that was uploaded, but a session whose bytes were
   * re-uploaded under a replaced key can leave a second copy behind; those files
   * have no binding left and are safe to remove.
   */
  private async sweepOrphanObjects(): Promise<number> {
    const orphans = await this.dataSource.query(
      `SELECT u.id,u.object_key FROM blob_upload_sessions u
        JOIN blob_records r ON r.id=u.committed_blob_id
        JOIN blob_objects o ON o.id=r.object_id
        WHERE u.status='committed' AND u.object_deleted_at IS NULL AND u.object_key<>o.object_key LIMIT 100`,
    );
    let removed = 0;
    for (const item of orphans) {
      try {
        await this.storage.deleteObject(item.object_key);
        await this.dataSource.query('UPDATE blob_upload_sessions SET object_deleted_at=NOW() WHERE id=?', [item.id]);
        removed += 1;
      } catch { /* Retried on the next pass. */ }
    }
    return removed;
  }

  private async sweepExpiredBlobs(): Promise<number> {
    const expired = await this.dataSource.query(
      `SELECT id,object_id FROM blob_records
        WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=NOW() LIMIT 200`,
    );
    let removed = 0;
    for (const record of expired) {
      await this.dataSource.transaction(async (manager) => {
        const locked = await manager.query(
          `SELECT id,object_id FROM blob_records WHERE id=? AND status='active' FOR UPDATE`,
          [record.id],
        );
        if (!locked.length) return;
        await manager.query(`UPDATE blob_records SET status='deleted',active_slot=NULL,deleted_at=NOW(),updated_at=NOW() WHERE id=?`, [record.id]);
        await this.releaseObject(manager, String(locked[0].object_id), 1);
      });
      removed += 1;
    }
    return removed;
  }

  private async sweepObjects(): Promise<number> {
    const candidates = await this.dataSource.query(
      `SELECT id,object_key FROM blob_objects
        WHERE ref_count=0 AND gc_in_progress=0 AND pending_delete_at IS NOT NULL AND pending_delete_at<=NOW() LIMIT 100`,
    );
    let removed = 0;
    for (const object of candidates) {
      const claim = await this.dataSource.query(
        'UPDATE blob_objects SET gc_in_progress=1 WHERE id=? AND ref_count=0 AND gc_in_progress=0 AND pending_delete_at<=NOW()',
        [object.id],
      );
      if (!claim.affectedRows) continue;
      try {
        await this.storage.deleteObject(object.object_key);
        await this.dataSource.transaction(async (manager) => {
          const rows = await manager.query('SELECT id,ref_count,gc_in_progress FROM blob_objects WHERE id=? FOR UPDATE', [object.id]);
          if (!rows.length) return;
          const bound = await manager.query(
            `SELECT COUNT(*) AS count FROM blob_records WHERE object_id=? AND status='active'`,
            [object.id],
          );
          if (Number(rows[0].ref_count) === 0 && Number(bound[0].count) === 0 && rows[0].gc_in_progress) {
            await manager.query('DELETE FROM blob_objects WHERE id=?', [object.id]);
          } else {
            await manager.query('UPDATE blob_objects SET gc_in_progress=0 WHERE id=?', [object.id]);
          }
        });
        removed += 1;
      } catch {
        await this.dataSource.query(
          `UPDATE blob_objects SET gc_in_progress=0,pending_delete_at=DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id=? AND ref_count=0`,
          [BLOB_GC_GRACE_HOURS, object.id],
        );
      }
    }
    return removed;
  }

  private async sweepIdempotency(): Promise<number> {
    const purged = await this.dataSource.query('DELETE FROM blob_idempotency WHERE expires_at < NOW() LIMIT 1000');
    return Number(purged?.affectedRows || 0);
  }

  // ---------------------------------------------------------------- helpers

  private async findVisible(viewer: BlobOwner | null, blobId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(blobId)) {
      this.notFound('BLOB_NOT_FOUND', 'blob 不存在。');
    }
    const rows = await this.dataSource.query(
      `SELECT r.*,o.object_key FROM blob_records r JOIN blob_objects o ON o.id=r.object_id
        WHERE r.id=? AND r.status='active' AND (r.expires_at IS NULL OR r.expires_at>NOW()) LIMIT 1`,
      [blobId],
    );
    if (!rows.length) this.notFound('BLOB_NOT_FOUND', 'blob 不存在。');
    const row = rows[0];
    const isOwner = viewer && row.owner_type === viewer.owner_type && row.owner_id === viewer.owner_id;
    if (!isOwner && row.visibility !== 'public') {
      // Same answer as a missing blob: a private blob's existence is not public.
      this.notFound('BLOB_NOT_FOUND', 'blob 不存在。');
    }
    return row;
  }

  private async requireBlobRow(manager: EntityManager, blobId: string) {
    const rows = await manager.query(
      `SELECT r.*,o.object_key FROM blob_records r JOIN blob_objects o ON o.id=r.object_id WHERE r.id=? LIMIT 1`,
      [blobId],
    );
    if (!rows.length) this.fail('BLOB_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, 'blob 元数据不可用。', true);
    return rows[0];
  }

  private async findReusableObject(manager: EntityManager, owner: BlobOwner, namespace: string, sha256: string, size: number) {
    const rows = await manager.query(
      `SELECT id FROM blob_objects WHERE namespace=? AND owner_type=? AND owner_id=? AND sha256=? AND size_bytes=? AND ref_count>0 LIMIT 1`,
      [namespace, owner.owner_type, owner.owner_id, sha256, String(size)],
    );
    return rows[0] ?? null;
  }

  /**
   * Resolve the object this session commits, creating its row when these are new
   * bytes.
   *
   * The file is fully re-read here rather than trusted from the session: the row
   * that becomes durable is the one the server verified, and the same path covers
   * a deduplicated session whose bytes arrived in an earlier request.
   */
  private async resolveVerifiedObject(
    manager: EntityManager,
    owner: BlobOwner,
    session: any,
    expectedSize: number,
    expectedSha: string,
  ) {
    const existing = await manager.query(
      `SELECT * FROM blob_objects WHERE namespace=? AND owner_type=? AND owner_id=? AND sha256=? AND size_bytes=? FOR UPDATE`,
      [session.namespace, owner.owner_type, owner.owner_id, expectedSha, String(expectedSize)],
    );
    const objectKey = existing.length && Number(existing[0].ref_count) > 0 ? String(existing[0].object_key) : String(session.object_key);
    const verified = await this.storage.verifyObject(objectKey, expectedSize, expectedSha, this.maxObjectBytes())
      .catch(() => { throw new ApiV1Exception('BLOB_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, 'blob 存储暂不可用。', true); });
    if (!verified) {
      const info = await this.storage.statObject(objectKey).catch(() => null);
      if (!info?.exists) this.fail('BLOB_UPLOAD_OBJECT_MISSING', HttpStatus.CONFLICT, '上传对象尚未到达存储服务。');
      if (info.size_bytes !== expectedSize) this.fail('BLOB_UPLOAD_SIZE_MISMATCH', HttpStatus.CONFLICT, '上传对象大小与声明不一致。');
      this.fail('BLOB_UPLOAD_CHECKSUM_MISMATCH', HttpStatus.CONFLICT, '上传对象 SHA-256 校验失败。');
    }

    if (existing.length) {
      const current = existing[0];
      if (Number(current.ref_count) > 0) {
        // The object already holds live bytes; this binding adds one more
        // reference. Without the increment two bindings would share a count of
        // one, and deleting either would schedule the bytes for reclamation
        // while the other binding still points at them.
        await manager.query(
          'UPDATE blob_objects SET ref_count=ref_count+1,last_referenced_at=NOW() WHERE id=?',
          [current.id],
        );
        return { ...current, ref_count: Number(current.ref_count) + 1 };
      }
      // The bytes are still on disk but nothing referenced them. A maintenance
      // sweep may have claimed this row for deletion already, in which case the
      // file is not ours to revive and the caller has to upload again.
      if (Number(current.gc_in_progress) === 1) {
        this.fail('BLOB_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, 'blob 正在回收，请稍后重试。', true);
      }
      await manager.query(
        `UPDATE blob_objects SET ref_count=1,gc_in_progress=0,pending_delete_at=NULL,last_referenced_at=NOW(),
          object_key=?,storage_provider=?,mime_type=?,size_bytes=? WHERE id=?`,
        [String(session.object_key), this.storage.provider, session.mime_type, String(expectedSize), current.id],
      );
      return { ...current, object_key: String(session.object_key), ref_count: 1 };
    }

    const objectId = randomUUID();
    await manager.query(
      `INSERT INTO blob_objects
         (id,namespace,owner_type,owner_id,sha256,size_bytes,mime_type,storage_provider,object_key,ref_count,gc_in_progress,pending_delete_at,created_at,last_referenced_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,0,NULL,NOW(),NOW())`,
      [objectId, session.namespace, owner.owner_type, owner.owner_id, expectedSha, String(expectedSize),
        session.mime_type, this.storage.provider, String(session.object_key)],
    );
    return { id: objectId, object_key: String(session.object_key), ref_count: 1 };
  }

  /**
   * Drop references and mark the object reclaimable.
   *
   * `pending_delete_at` is what separates "unreferenced" from "deletable": the
   * grace period is the window in which a client that is mid-flight can still
   * revive the same content without a re-upload.
   */
  private async releaseObject(manager: EntityManager, objectId: string, count: number): Promise<void> {
    if (count <= 0) return;
    const rows = await manager.query('SELECT id,ref_count FROM blob_objects WHERE id=? FOR UPDATE', [objectId]);
    if (!rows.length) return;
    const remaining = Math.max(0, Number(rows[0].ref_count) - count);
    await manager.query(
      `UPDATE blob_objects SET ref_count=?,gc_in_progress=0,
        pending_delete_at=IF(?=0, DATE_ADD(NOW(), INTERVAL ? HOUR), NULL) WHERE id=?`,
      [remaining, remaining, BLOB_GC_GRACE_HOURS, objectId],
    );
  }

  private async assertQuota(manager: EntityManager, owner: BlobOwner, namespace: string, sha256: string, size: number): Promise<void> {
    const limit = this.quotaBytes();
    const [{ used_bytes }] = await manager.query(
      `SELECT COALESCE(SUM(size_bytes),0) AS used_bytes FROM blob_objects WHERE owner_type=? AND owner_id=? AND ref_count>0`,
      [owner.owner_type, owner.owner_id],
    );
    const [{ reserved_bytes }] = await manager.query(
      `SELECT COALESCE(SUM(size_bytes),0) AS reserved_bytes FROM (
         SELECT DISTINCT s.expected_sha256,s.expected_size_bytes AS size_bytes FROM blob_upload_sessions s
          WHERE s.owner_type=? AND s.owner_id=? AND s.status IN ('pending','uploaded') AND s.expires_at>NOW()
            AND NOT EXISTS (SELECT 1 FROM blob_objects b WHERE b.namespace=s.namespace AND b.owner_type=s.owner_type
              AND b.owner_id=s.owner_id AND b.sha256=s.expected_sha256 AND b.size_bytes=s.expected_size_bytes AND b.ref_count>0)
       ) pending_blobs`,
      [owner.owner_type, owner.owner_id],
    );
    const reusable = await this.findReusableObject(manager, owner, namespace, sha256, size);
    const additional = reusable ? 0 : size;
    if (Number(used_bytes) + Number(reserved_bytes) + additional > limit) {
      this.fail('BLOB_QUOTA_EXCEEDED', HttpStatus.CONFLICT, 'blob 存储空间不足。');
    }
  }

  private async assertOpenUploadBudget(manager: EntityManager, owner: BlobOwner): Promise<void> {
    const [{ count }] = await manager.query(
      `SELECT COUNT(*) AS count FROM blob_upload_sessions
        WHERE owner_type=? AND owner_id=? AND status IN ('pending','uploaded') AND expires_at>NOW()`,
      [owner.owner_type, owner.owner_id],
    );
    if (Number(count) >= MAX_OPEN_BLOB_UPLOADS) {
      this.fail('BLOB_UPLOAD_LIMIT_REACHED', HttpStatus.TOO_MANY_REQUESTS, '未完成的上传会话过多，请先提交或取消。', true);
    }
  }

  private async usageFor(manager: EntityManager, owner: BlobOwner) {
    const [{ used_bytes }] = await manager.query(
      `SELECT COALESCE(SUM(size_bytes),0) AS used_bytes FROM blob_objects WHERE owner_type=? AND owner_id=? AND ref_count>0`,
      [owner.owner_type, owner.owner_id],
    );
    const [{ reserved_bytes }] = await manager.query(
      `SELECT COALESCE(SUM(expected_size_bytes),0) AS reserved_bytes FROM blob_upload_sessions
        WHERE owner_type=? AND owner_id=? AND status IN ('pending','uploaded') AND expires_at>NOW() AND object_id IS NULL`,
      [owner.owner_type, owner.owner_id],
    );
    const [{ blob_count }] = await manager.query(
      `SELECT COUNT(*) AS blob_count FROM blob_records
        WHERE owner_type=? AND owner_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())`,
      [owner.owner_type, owner.owner_id],
    );
    return {
      used_bytes: Number(used_bytes) + Number(reserved_bytes),
      limit_bytes: this.quotaBytes(),
      max_object_bytes: this.maxObjectBytes(),
      blob_count: Number(blob_count),
    };
  }

  private shapeBlob(row: any) {
    return {
      id: String(row.id),
      namespace: String(row.namespace),
      key: String(row.blob_key),
      visibility: row.visibility === 'public' ? 'public' : 'private',
      file_name: String(row.file_name),
      mime_type: String(row.mime_type),
      size_bytes: Number(row.size_bytes),
      sha256: String(row.sha256),
      metadata: parseJson(row.metadata_json),
      tags: parseJson(row.tags_json),
      ref_type: row.ref_type ?? null,
      ref_id: row.ref_id ?? null,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      content_url: `/api/v1/blobs/${encodeURIComponent(String(row.id))}/content`,
    };
  }

  private normalizeNamespace(value: unknown): string {
    const namespace = value === undefined || value === null || value === '' ? DEFAULT_BLOB_NAMESPACE : String(value);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(namespace)) {
      this.fail('BLOB_KEY_INVALID', HttpStatus.BAD_REQUEST, 'namespace 无效。');
    }
    if ((RESERVED_BLOB_NAMESPACES as readonly string[]).includes(namespace)) {
      this.fail('BLOB_KEY_INVALID', HttpStatus.BAD_REQUEST, 'namespace 为保留名称。');
    }
    return namespace;
  }

  private normalizeKey(value: unknown): string {
    if (typeof value !== 'string') this.fail('BLOB_KEY_INVALID', HttpStatus.BAD_REQUEST, 'key 无效。');
    const key = value.trim();
    if (!key || key.length > MAX_KEY_LENGTH || /[\u0000-\u001f\u007f]/.test(key)) {
      this.fail('BLOB_KEY_INVALID', HttpStatus.BAD_REQUEST, 'key 无效。');
    }
    return key;
  }

  private normalizeFileName(value: unknown): string {
    if (typeof value !== 'string') this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, '文件名无效。');
    const name = value.trim();
    if (!name || name.length > 255 || /[\u0000-\u001f\u007f]/.test(name)) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, '文件名无效。');
    }
    return name;
  }

  private normalizeMime(value: unknown): string {
    if (typeof value !== 'string' || value.length > 100 || !/^[\w.+-]+\/[\w.+-]+$/.test(value)) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, 'MIME 类型无效。');
    }
    return value.toLowerCase();
  }

  private normalizeHash(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value)) {
      this.fail('BLOB_INVALID_HASH', HttpStatus.BAD_REQUEST, 'SHA-256 格式无效。');
    }
    return value.toLowerCase();
  }

  private normalizeMetadata(value: unknown): Record<string, unknown> | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, 'metadata 必须是 JSON 对象。');
    }
    const serialized = JSON.stringify(value);
    if (serialized.length > 16_384) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, 'metadata 过大。');
    }
    return JSON.parse(serialized);
  }

  private normalizeTags(value: unknown): string[] | null {
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value) || value.length > 32) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, 'tags 无效。');
    }
    const tags = value.map((tag) => String(tag).trim()).filter(Boolean);
    if (tags.some((tag) => tag.length > 64 || /[\u0000-\u001f\u007f]/.test(tag))) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, 'tags 无效。');
    }
    return tags.length ? tags : null;
  }

  private normalizeOptional(value: unknown, maxLength: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, '引用字段无效。');
    }
    return text;
  }

  private resolveExpiry(seconds: unknown): Date | null {
    if (seconds === undefined || seconds === null) return null;
    const value = Number(seconds);
    if (!Number.isSafeInteger(value) || value < 60 || value > 2_592_000) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, '过期时间无效。');
    }
    return new Date(Date.now() + value * 1000);
  }

  /**
   * Opaque, server-generated key. The owner segment is a digest rather than the
   * raw id so a storage directory never becomes a user listing.
   */
  private buildObjectKey(owner: BlobOwner, namespace: string): string {
    const ownerSegment = createHash('sha256').update(`${owner.owner_type}:${owner.owner_id}`).digest('hex').slice(0, 32);
    return `blobs/${namespace}/${ownerSegment}/${randomUUID()}`;
  }

  private uploadUrl(uploadId: string): string {
    const base = String(this.config.get('app.apiUrl') || '').replace(/\/+$/, '');
    return `${base}/api/v1/blobs/uploads/${encodeURIComponent(uploadId)}/content`;
  }

  private quotaBytes(): number {
    return this.settingBytes('blobs_owner_quota_bytes', DEFAULT_BLOB_QUOTA_BYTES);
  }

  private maxObjectBytes(): number {
    return this.settingBytes('blobs_max_object_bytes', DEFAULT_BLOB_MAX_OBJECT_BYTES);
  }

  private settingBytes(key: string, fallback: number): number {
    const value = Number(this.settings.getCached(key));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  private async audit(
    manager: EntityManager,
    owner: BlobOwner,
    action: string,
    details: Record<string, unknown>,
    actor: BlobActor,
  ): Promise<void> {
    const body = { ...details, client_id: actor.clientId || null, request_id: actor.requestId || null };
    await manager.query(
      `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,ip_address,user_agent,created_at)
       VALUES (?,?,'blob',NULL,?,?,?,NOW())`,
      [owner.user_id, `blob.${action.replace(/^blob\./, '')}`, JSON.stringify(body),
        actor.ip || null, (actor.userAgent || '').slice(0, 1000) || null],
    );
  }

  private async idempotent<T>(
    owner: BlobOwner,
    operation: string,
    key: string | undefined,
    payload: unknown,
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const normalizedKey = key?.trim();
    if (!normalizedKey) return this.dataSource.transaction((manager) => callback(manager));
    if (!/^[\x21-\x7e]{1,128}$/.test(normalizedKey)) {
      this.fail('BLOB_METADATA_INVALID', HttpStatus.BAD_REQUEST, 'Idempotency-Key 格式无效。');
    }
    const fingerprint = createHash('sha256').update(canonicalize(payload)).digest('hex');
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `DELETE FROM blob_idempotency WHERE owner_type=? AND owner_id=? AND operation=? AND idempotency_key=? AND expires_at<=NOW()`,
          [owner.owner_type, owner.owner_id, operation, normalizedKey],
        );
        await manager.query(
          `INSERT INTO blob_idempotency (owner_type,owner_id,operation,idempotency_key,request_sha256,expires_at)
           VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL ? HOUR))`,
          [owner.owner_type, owner.owner_id, operation, normalizedKey, fingerprint, BLOB_IDEMPOTENCY_TTL_HOURS],
        );
        const result = await callback(manager);
        await manager.query(
          `UPDATE blob_idempotency SET response_json=? WHERE owner_type=? AND owner_id=? AND operation=? AND idempotency_key=?`,
          [JSON.stringify(result), owner.owner_type, owner.owner_id, operation, normalizedKey],
        );
        return result;
      });
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY' && error?.driverError?.code !== 'ER_DUP_ENTRY' && error?.errno !== 1062) throw error;
      const rows = await this.dataSource.query(
        `SELECT request_sha256,response_json FROM blob_idempotency
          WHERE owner_type=? AND owner_id=? AND operation=? AND idempotency_key=? AND expires_at>NOW() LIMIT 1`,
        [owner.owner_type, owner.owner_id, operation, normalizedKey],
      );
      if (!rows.length) throw error;
      if (rows[0].request_sha256 !== fingerprint) {
        this.fail('IDEMPOTENCY_KEY_REUSED', HttpStatus.CONFLICT, '此 Idempotency-Key 已用于不同请求。');
      }
      if (!rows[0].response_json) {
        this.fail('IDEMPOTENCY_IN_PROGRESS', HttpStatus.CONFLICT, '相同请求仍在处理中，请稍后重试。', true);
      }
      return JSON.parse(rows[0].response_json);
    }
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) this.fail('BLOBS_DISABLED', HttpStatus.FORBIDDEN, 'blob 存储功能尚未启用。');
    if (!this.storage.isConfigured()) {
      this.fail('BLOB_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, 'blob 存储尚未配置。', true);
    }
  }

  private fail(code: string, status: HttpStatus, message: string, retryable = false): never {
    throw new ApiV1Exception(code, status, message, retryable);
  }

  private notFound(code: string, message: string): never {
    throw new ApiV1Exception(code, HttpStatus.NOT_FOUND, message);
  }
}

function parseJson(value: unknown): any {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize((value as any)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
