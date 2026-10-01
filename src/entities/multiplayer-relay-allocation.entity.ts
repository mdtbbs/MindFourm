import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { MultiplayerSession } from './multiplayer-session.entity';
import { MultiplayerPeer } from './multiplayer-peer.entity';

@Entity('multiplayer_relay_allocations')
@Index('idx_multiplayer_relay_session_status', ['session_id', 'status'])
@Index('idx_multiplayer_relay_agent_status', ['agent_id', 'status'])
@Index('uq_multiplayer_relay_agent_connection', ['agent_id', 'connection_id'], { unique: true })
export class MultiplayerRelayAllocation {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id: string;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  @Column({ type: 'varchar', length: 48 })
  peer_id: string;

  @Column({ type: 'varchar', length: 96 })
  agent_id: string;

  @Column({ type: 'enum', enum: ['active', 'connected', 'revoked', 'expired'], default: 'active' })
  status: 'active' | 'connected' | 'revoked' | 'expired';

  /** Set once by the trusted Agent after the client presents its Relay credential over WSS. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  connection_id: string | null;

  @Column({ type: 'datetime', nullable: true })
  connected_at: Date | null;

  /** A renewal becomes effective only after the owning Agent confirms it on the same WSS connection. */
  @Column({ type: 'datetime', nullable: true })
  pending_expires_at: Date | null;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => MultiplayerSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: MultiplayerSession;

  @ManyToOne(() => MultiplayerPeer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'peer_id' })
  peer: MultiplayerPeer;
}
