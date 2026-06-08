import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

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
  error_message: string;

  @CreateDateColumn()
  sent_at: Date;
}
