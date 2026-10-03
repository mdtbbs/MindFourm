import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

@Index('idx_email_logs_user_id', ['user_id'])
@Index('idx_email_logs_status', ['status'])
@Index('idx_email_logs_queued_at', ['queued_at'])
@Index('idx_email_logs_sent_at', ['sent_at'])
@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number;

  @Column({ length: 50 })
  email_type: string; // 'reply', 'mention', 'message', 'system', 'welcome'

  @Column({ length: 255 })
  to_email: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ length: 20, default: 'queued' })
  status: string; // 'queued', 'sent', 'failed', 'bounced'

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  queued_at: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  sent_at: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  failed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_message_id: string | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
