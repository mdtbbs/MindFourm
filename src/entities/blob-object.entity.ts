import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Content-addressed blob object (the bytes).
 *
 * Forum-side rows keep the same 1 MiB `express.json` body limit and the same
 * "never trust the uploader" rules as cloud saves: size and SHA-256 are declared,
 * then re-verified from the stored object.
 *
 * Deduplication is deliberately scoped to one owner inside one namespace rather
 * than global. A global CAS would let two accounts in the same deployment share
 * bytes, which makes an erasure request ambiguous — the other holder's file would
 * change identity. Scoping the unique key to (namespace, owner, sha256, size)
 * keeps dedup within data that one owner may already read.
 *
 * `owner_id` is a string without a foreign key on purpose: today every owner is a
 * user, but a namespace may later be served by a service account (External API)
 * without a schema migration.
 */
@Entity('blob_objects')
@Unique('uq_blob_object_owner_content', ['namespace', 'owner_type', 'owner_id', 'sha256', 'size_bytes'])
@Index('idx_blob_objects_ref_gc', ['ref_count', 'pending_delete_at'])
@Index('idx_blob_objects_namespace_created', ['namespace', 'created_at'])
export class BlobObject {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;

  @Column({ type: 'varchar', length: 64 }) namespace: string;

  @Column({ type: 'varchar', length: 32, default: 'user' }) owner_type: string;

  @Column({ type: 'varchar', length: 64 }) owner_id: string;

  @Column({ type: 'char', length: 64 }) sha256: string;

  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;

  @Column({ type: 'varchar', length: 100 }) mime_type: string;

  @Column({ type: 'varchar', length: 32 }) storage_provider: string;

  @Column({ type: 'varchar', length: 512 }) object_key: string;

  @Column({ type: 'int', unsigned: true, default: 0 }) ref_count: number;

  @Column({ type: 'boolean', default: false }) gc_in_progress: boolean;

  @CreateDateColumn({ type: 'datetime' }) created_at: Date;

  @UpdateDateColumn({ type: 'datetime' }) last_referenced_at: Date;

  @Column({ type: 'datetime', nullable: true }) pending_delete_at: Date | null;
}
