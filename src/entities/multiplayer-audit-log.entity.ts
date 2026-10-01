import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Deliberately excludes candidate addresses, IP data, credentials and user tokens. */
@Entity('multiplayer_audit_logs')
@Index('idx_multiplayer_audit_actor_created', ['actor_user_id', 'created_at'])
@Index('idx_multiplayer_audit_target', ['target_type', 'target_id'])
export class MultiplayerAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32 })
  target_type: string;

  @Column({ type: 'varchar', length: 64 })
  target_id: string;

  @Column({ type: 'json', nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
