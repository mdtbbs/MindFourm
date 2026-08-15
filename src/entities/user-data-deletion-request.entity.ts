import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Index('idx_deletion_request_user_status', ['user_id', 'status'])
@Index('idx_deletion_request_legal_hold', ['legal_hold_until'])
@Entity('user_data_deletion_requests')
export class UserDataDeletionRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'in_review' | 'completed' | 'rejected' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  request_reason: string | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'int', nullable: true })
  reviewed_by: number | null;

  @Column({ type: 'datetime', nullable: true })
  reviewed_at: Date | null;

  /** A documented legal/dispute hold stops the scheduled one-year purge for this account's audit rows. */
  @Column({ type: 'datetime', nullable: true })
  legal_hold_until: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
