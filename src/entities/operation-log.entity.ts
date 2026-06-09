import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

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
