import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { MultiplayerSession } from './multiplayer-session.entity';

@Entity('multiplayer_join_requests')
@Index('idx_multiplayer_join_requests_session_status_expiry', ['session_id', 'status', 'expires_at'])
@Index('idx_multiplayer_join_requests_target_status', ['target_user_id', 'status'])
@Index('uq_multiplayer_join_requests_intent_hash', ['join_intent_hash'], { unique: true })
@Index('idx_multiplayer_join_requests_realtime_pending', ['requester_user_id', 'requester_client_id', 'status', 'realtime_acknowledged_at'])
export class MultiplayerJoinRequest {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  @Column()
  requester_user_id: number;

  @Column({ type: 'varchar', length: 128, default: 'forum_web' })
  requester_client_id: string;

  @Column()
  target_user_id: number;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' })
  status: 'pending' | 'approved' | 'rejected' | 'expired';

  @Column({ type: 'datetime' })
  expires_at: Date;

  /** Hash of the deterministic, short-lived approved-join bearer ID. */
  @Column({ type: 'char', length: 64, nullable: true })
  join_intent_hash: string | null;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  join_intent_expires_at: Date | null;

  /** Durable consume result. The resume bearer itself is derived, never stored. */
  @Column({ type: 'varchar', length: 48, nullable: true })
  consumed_peer_id: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  consumed_client_id: string | null;

  @Column({ type: 'datetime', nullable: true })
  consumed_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  recovery_expires_at: Date | null;

  /** Realtime ACK state doubles as the durable approval-event outbox state. */
  @Column({ type: 'datetime', nullable: true })
  realtime_acknowledged_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  realtime_last_published_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => MultiplayerSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: MultiplayerSession;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_user_id' })
  requester: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_user_id' })
  target: User;
}
