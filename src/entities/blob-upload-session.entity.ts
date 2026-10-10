import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One staged upload: declared size/hash plus the object key the bytes land on.
 *
 * The session is the authorization context. Nothing from the client — size, MIME,
 * hash, filename — is durable until the server has read the stored object back and
 * matched it against this row, so a client cannot commit content it never proved
 * it had.
 */
@Entity('blob_upload_sessions')
@Index('idx_blob_upload_owner', ['owner_type', 'owner_id'])
@Index('idx_blob_upload_expiry', ['expires_at'])
@Index('idx_blob_upload_status', ['status'])
export class BlobUploadSession {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;

  @Column({ type: 'varchar', length: 32, default: 'user' }) owner_type: string;

  @Column({ type: 'varchar', length: 64 }) owner_id: string;

  @Column({ type: 'int', nullable: true }) user_id: number | null;

  @Column({ type: 'varchar', length: 64 }) namespace: string;

  @Column({ type: 'varchar', length: 255 }) blob_key: string;

  @Column({ type: 'char', length: 64 }) expected_sha256: string;

  @Column({ type: 'bigint', unsigned: true }) expected_size_bytes: string;

  @Column({ type: 'varchar', length: 255 }) file_name: string;

  @Column({ type: 'varchar', length: 100 }) mime_type: string;

  @Column({ type: 'varchar', length: 16, default: 'private' }) visibility: 'private' | 'public';

  @Column({ type: 'json', nullable: true }) metadata_json: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true }) tags_json: string[] | null;

  @Column({ type: 'varchar', length: 32, nullable: true }) ref_type: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true }) ref_id: string | null;

  /** Set when the declared content already exists, so no PUT is required. */
  @Column({ type: 'char', length: 36, nullable: true }) object_id: string | null;

  @Column({ type: 'varchar', length: 512 }) object_key: string;

  @Column({ type: 'varchar', length: 32 }) storage_provider: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: 'pending' | 'uploaded' | 'committed' | 'expired' | 'cancelled' | 'failed';

  @Column({ type: 'datetime' }) expires_at: Date;

  /** Lifetime of the committed blob, decoupled from this session's own expiry. */
  @Column({ type: 'datetime', nullable: true }) record_expires_at: Date | null;

  @Column({ type: 'datetime', nullable: true }) committed_at: Date | null;

  @Column({ type: 'char', length: 36, nullable: true }) committed_blob_id: string | null;

  @Column({ type: 'datetime', nullable: true }) object_deleted_at: Date | null;

  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
