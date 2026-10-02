import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { MultiplayerInvite } from './multiplayer-invite.entity';
import { MultiplayerPeer } from './multiplayer-peer.entity';
import { MultiplayerSession } from './multiplayer-session.entity';

@Entity('multiplayer_join_intents')
@Index('uq_multiplayer_join_intents_invite', ['invite_id'], { unique: true })
@Index('idx_multiplayer_join_intents_user_expiry', ['user_id', 'expires_at'])
@Index('idx_multiplayer_join_intents_peer_recovery', ['consumed_peer_id', 'recovery_expires_at'])
export class MultiplayerJoinIntent {
  /** SHA-256 of the short-lived bearer ID. The bearer itself is never persisted. */
  @PrimaryColumn({ type: 'char', length: 64 })
  intent_hash: string;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  @Column()
  user_id: number;

  /** Null for direct intents; set only for the accepted-invite intent. */
  @Column({ type: 'varchar', length: 48, nullable: true })
  invite_id: string | null;

  /** Whether the user was authorized by an invite, approval, or join code at issuance. */
  @Column({ type: 'boolean', default: false })
  allow_join_policy_bypass: boolean;

  @Column({ type: 'datetime' })
  issued_at: Date;

  @Column({ type: 'datetime' })
  expires_at: Date;

  /** Bound atomically to the first OAuth client that consumes this intent. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  consumed_client_id: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  consumed_peer_id: string | null;

  @Column({ type: 'datetime', nullable: true })
  consumed_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  recovery_expires_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => MultiplayerSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: MultiplayerSession;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => MultiplayerInvite, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invite_id' })
  invite: MultiplayerInvite | null;

  @ManyToOne(() => MultiplayerPeer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'consumed_peer_id' })
  consumed_peer: MultiplayerPeer | null;
}
