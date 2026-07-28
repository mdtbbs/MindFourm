import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

@Index('idx_email_logs_user_id', ['user_id'])
@Index('idx_email_logs_status', ['status'])
@Index('idx_email_logs_sent_at', ['sent_at'])
@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number;

  @Column({ length: 50 })
  email_type: string; // 'reply', 'mention', 'message', 'system'

  @Column({ length: 255 })
  to_email: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ length: 20, default: 'sent' })
  status: string; // 'sent', 'failed', 'bounced'

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn()
  sent_at: Date;

  // SET NULL keeps the delivery record after an account is removed — it is
  // evidence of what was sent, not user-owned data.
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
