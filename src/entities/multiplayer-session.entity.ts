import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * Discovery scope: who may find this Session in a lobby or friend list. It never
 * decides whether a user is allowed to join — that is `join_policy` alone.
 */
export type MultiplayerSessionVisibility = 'private' | 'friends' | 'public';

/**
 * Join eligibility: which users may become a Peer. Single-select by design; the
 * entry path a client used (room code, invite link, lobby button) is transport,
 * not permission.
 */
export type MultiplayerSessionJoinPolicy = 'invite_only' | 'friends' | 'public';

@Entity('multiplayer_sessions')
@Index('idx_multiplayer_sessions_owner_status', ['owner_user_id', 'status'])
@Index('idx_multiplayer_sessions_expiry', ['expires_at', 'status'])
@Index('idx_multiplayer_sessions_discovery', ['visibility', 'status', 'expires_at'])
export class MultiplayerSession {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column()
  owner_user_id: number;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  code_hash: string | null;

  @Column({ type: 'enum', enum: ['private', 'friends', 'public'], default: 'private' })
  visibility: MultiplayerSessionVisibility;

  @Column({ type: 'enum', enum: ['invite_only', 'friends', 'public'], default: 'friends' })
  join_policy: MultiplayerSessionJoinPolicy;

  /**
   * Orthogonal to `join_policy`: the user is already inside the join scope but
   * the owner still approves each join through the existing Join Request flow.
   * Replaces the removed `join_policy = request` value without a second ACL.
   */
  @Column({ type: 'boolean', default: false })
  require_approval: boolean;

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
