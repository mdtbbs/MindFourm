import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { MultiplayerSession } from './multiplayer-session.entity';

@Entity('multiplayer_invites')
@Index('idx_multiplayer_invites_target_status_expiry', ['target_user_id', 'status', 'expires_at'])
@Index('idx_multiplayer_invites_session_status', ['session_id', 'status'])
export class MultiplayerInvite {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  @Column()
  sender_user_id: number;

  @Column()
  target_user_id: number;

  @Column({ type: 'enum', enum: ['pending', 'accepted', 'declined', 'revoked', 'expired'], default: 'pending' })
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

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
  @JoinColumn({ name: 'sender_user_id' })
  sender: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_user_id' })
  target: User;
}
