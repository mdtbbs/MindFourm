import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Idempotency/expiry guard for one metadata-first ResourceVersion upload. */
@Entity('resource_direct_upload_drafts')
@Index('uq_resource_direct_upload_draft_version', ['resource_version_id'], { unique: true })
@Index('uq_resource_direct_upload_draft_user_key', ['user_id', 'idempotency_key_hash'], { unique: true })
@Index('idx_resource_direct_upload_draft_expiry', ['status', 'expires_at'])
export class ResourceDirectUploadDraft {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column()
  resource_version_id: number;

  @Column()
  user_id: number;

  @Column({ type: 'char', length: 64 })
  idempotency_key_hash: string;

  @Column({ type: 'char', length: 64 })
  request_fingerprint: string;

  /** The normalized metadata submitted before bytes; never contains browser analysis. */
  @Column({ type: 'json', nullable: true })
  request_metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: 'open' | 'completed' | 'expired';

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
