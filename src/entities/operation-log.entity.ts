import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

// `created_at` carries the retention sweep as well as the admin log viewer's default
// ordering; `action` and the target pair are its filter facets.
@Index('idx_operation_logs_created_at', ['created_at'])
@Index('idx_operation_logs_action', ['action'])
@Index('idx_operation_logs_target', ['target_type', 'target_id'])
@Entity('operation_logs')
export class OperationLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number;

  @Column({ length: 100 })
  action: string;

  @Column({ length: 100, nullable: true })
  target_type: string;

  @Column({ nullable: true })
  target_id: number;

  @Column({ type: 'text', nullable: true })
  details: string;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
