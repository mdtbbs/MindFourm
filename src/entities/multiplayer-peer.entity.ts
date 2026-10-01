import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { MultiplayerSession } from './multiplayer-session.entity';

@Entity('multiplayer_peers')
@Index('idx_multiplayer_peers_session_status', ['session_id', 'status'])
@Index('idx_multiplayer_peers_session_user_status', ['session_id', 'user_id', 'status'])
export class MultiplayerPeer {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  @Column()
  user_id: number;

  @Column({ type: 'varchar', length: 128 })
  client_id: string;

  @Column({ type: 'enum', enum: ['owner', 'member'], default: 'member' })
  role: 'owner' | 'member';

  @Column({ type: 'enum', enum: ['joining', 'active', 'disconnected', 'left', 'expired'], default: 'joining' })
  status: 'joining' | 'active' | 'disconnected' | 'left' | 'expired';

  @Column({ type: 'json', nullable: true })
  capabilities: Record<string, unknown> | null;

  @Column({ type: 'datetime', nullable: true })
  last_seen_at: Date | null;

  @CreateDateColumn({ name: 'joined_at' })
  joined_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => MultiplayerSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: MultiplayerSession;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
