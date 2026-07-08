import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('admin_notifications')
export class AdminNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ length: 100 })
  event_key: string;

  @Column({ length: 50 })
  category: string;

  @Column({ length: 30, default: 'info' })
  level: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ length: 500, nullable: true })
  action_url: string | null;

  @Column({ type: 'text', nullable: true })
  metadata_json: string | null;

  @Column({ default: 0 })
  is_read: number;

  @Column({ type: 'datetime', nullable: true })
  read_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
