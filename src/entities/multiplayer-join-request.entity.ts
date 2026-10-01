import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { MultiplayerSession } from './multiplayer-session.entity';

@Entity('multiplayer_join_requests')
@Index('idx_multiplayer_join_requests_session_status_expiry', ['session_id', 'status', 'expires_at'])
@Index('idx_multiplayer_join_requests_target_status', ['target_user_id', 'status'])
export class MultiplayerJoinRequest {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  @Column()
  requester_user_id: number;

  @Column()
  target_user_id: number;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' })
  status: 'pending' | 'approved' | 'rejected' | 'expired';

  @Column({ type: 'datetime' })
  expires_at: Date;

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
