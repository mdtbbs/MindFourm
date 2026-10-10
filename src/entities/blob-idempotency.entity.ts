import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Replay store for create/commit keys. Rows are dropped once they expire. */
@Entity('blob_idempotency')
@Unique('uq_blob_idempotency_scope', ['owner_type', 'owner_id', 'operation', 'idempotency_key'])
@Index('idx_blob_idempotency_expiry', ['expires_at'])
export class BlobIdempotency {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, default: 'user' }) owner_type: string;

  @Column({ type: 'varchar', length: 64 }) owner_id: string;

  @Column({ type: 'varchar', length: 64 }) operation: string;

  @Column({ type: 'varchar', length: 128 }) idempotency_key: string;

  @Column({ type: 'char', length: 64 }) request_sha256: string;

  @Column({ type: 'longtext', nullable: true }) response_json: string | null;

  @Column({ type: 'datetime' }) expires_at: Date;

  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
