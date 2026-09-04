import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Immutable proof of a user's acceptance of the exact legal documents that
 * were presented at that moment. `*_version` is derived from the full SHA-256
 * digest, so an admin content edit automatically creates a new document version.
 */
@Index('idx_legal_acceptances_user_accepted', ['user_id', 'accepted_at'])
@Index('idx_legal_acceptances_accepted_at', ['accepted_at'])
@Entity('legal_acceptances')
export class LegalAcceptance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 71 })
  terms_version: string;

  @Column({ type: 'char', length: 64 })
  terms_content_hash: string;

  @Column({ type: 'varchar', length: 71 })
  privacy_version: string;

  @Column({ type: 'char', length: 64 })
  privacy_content_hash: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @CreateDateColumn({ type: 'datetime' })
  accepted_at: Date;

  // Preserve a one-year legal record even when the account is later deleted.
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
