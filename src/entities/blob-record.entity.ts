import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * A named, durable blob binding: one business-visible blob on top of one CAS object.
 *
 * Several records may point at the same object, which is what makes the object's
 * `ref_count` meaningful; the bytes are only reclaimable once the last binding is
 * gone and the grace period has passed.
 *
 * `active_slot` exists only to make `blob_key` unique among live rows. MySQL
 * treats NULLs in a unique index as distinct, so a soft-deleted record moves it to
 * NULL and the name becomes reusable immediately, while the tombstone keeps its
 * own key for audit.
 */
@Entity('blob_records')
@Unique('uq_blob_record_owner_key', ['namespace', 'owner_type', 'owner_id', 'blob_key', 'active_slot'])
@Index('idx_blob_records_owner_created', ['owner_type', 'owner_id', 'created_at'])
@Index('idx_blob_records_ref', ['ref_type', 'ref_id'])
@Index('idx_blob_records_expiry', ['expires_at'])
@Index('idx_blob_records_object', ['object_id'])
export class BlobRecord {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;

  @Column({ type: 'varchar', length: 64 }) namespace: string;

  @Column({ type: 'varchar', length: 32, default: 'user' }) owner_type: string;

  @Column({ type: 'varchar', length: 64 }) owner_id: string;

  /** Business-chosen logical name; unique per live owner inside the namespace. */
  @Column({ type: 'varchar', length: 255 }) blob_key: string;

  @Column({ type: 'char', length: 36 }) object_id: string;

  @Column({ type: 'varchar', length: 255 }) file_name: string;

  @Column({ type: 'varchar', length: 100 }) mime_type: string;

  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;

  @Column({ type: 'char', length: 64 }) sha256: string;

  @Column({ type: 'varchar', length: 16, default: 'private' }) visibility: 'private' | 'public';

  @Column({ type: 'varchar', length: 16, default: 'active' }) status: 'active' | 'deleted';

  @Column({ type: 'json', nullable: true }) metadata_json: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true }) tags_json: string[] | null;

  /** Opaque business binding, e.g. `post` / `12345`. Lookup-only, never authoritative. */
  @Column({ type: 'varchar', length: 32, nullable: true }) ref_type: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true }) ref_id: string | null;

  /** Temporary blobs (staging, editor drafts) expire and are reclaimed by maintenance. */
  @Column({ type: 'datetime', nullable: true }) expires_at: Date | null;

  @Column({ type: 'int', nullable: true }) created_by_user_id: number | null;

  /** 1 while live, NULL after deletion; see the class comment for why. */
  @Column({ type: 'smallint', unsigned: true, nullable: true, default: 1 }) active_slot: number | null;

  @CreateDateColumn({ type: 'datetime' }) created_at: Date;

  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;

  @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
