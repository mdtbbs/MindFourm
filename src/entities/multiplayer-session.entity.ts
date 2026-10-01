import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('multiplayer_sessions')
@Index('idx_multiplayer_sessions_owner_status', ['owner_user_id', 'status'])
@Index('idx_multiplayer_sessions_expiry', ['expires_at', 'status'])
export class MultiplayerSession {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column()
  owner_user_id: number;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  code_hash: string | null;

  @Column({ type: 'enum', enum: ['private', 'friends', 'unlisted'], default: 'private' })
  visibility: 'private' | 'friends' | 'unlisted';

  @Column({ type: 'enum', enum: ['open', 'friends', 'request', 'invite_only'], default: 'friends' })
  join_policy: 'open' | 'friends' | 'request' | 'invite_only';

  @Column({ type: 'varchar', length: 128 })
  game_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  game_version: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  activity_name: string | null;

  @Column({ type: 'smallint', unsigned: true, default: 8 })
  max_players: number;

  @Column({ type: 'enum', enum: ['active', 'closing', 'closed'], default: 'active' })
  status: 'active' | 'closing' | 'closed';

  @Column({ type: 'datetime', nullable: true })
  close_after: Date | null;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  owner: User;
}
