import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('resource_submission_idempotency')
@Unique('uq_resource_submission_user_key', ['user_id', 'idempotency_key'])
@Index('idx_resource_submission_expiry', ['expires_at'])
export class ResourceSubmissionIdempotency {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 128 }) idempotency_key: string;
  @Column({ type: 'char', length: 64 }) request_fingerprint: string;
  @Column({ type: 'char', length: 64 }) payload_fingerprint: string;
  @Column({ type: 'int', nullable: true }) resource_id: number | null;
  @Column({ type: 'datetime' }) expires_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
