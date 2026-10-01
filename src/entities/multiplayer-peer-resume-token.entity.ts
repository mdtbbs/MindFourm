import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MultiplayerPeer } from './multiplayer-peer.entity';

@Entity('multiplayer_peer_resume_tokens')
@Index('idx_multiplayer_resume_peer_expiry', ['peer_id', 'expires_at'])
export class MultiplayerPeerResumeToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 48 })
  peer_id: string;

  @Column({ type: 'char', length: 64, unique: true })
  token_hash: string;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  consumed_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => MultiplayerPeer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'peer_id' })
  peer: MultiplayerPeer;
}
