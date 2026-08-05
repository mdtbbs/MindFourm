import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('login_log')
@Index(['user_id'])
@Index(['login_time'])
@Index(['login_type'])
export class LoginLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  user_id: number;

  @Column({ length: 50 })
  login_type: string;

  @Column({ length: 50, nullable: true })
  platform: string;

  @Column({ length: 255, nullable: true })
  device_id: string;

  @Column({ length: 45, nullable: true })
  ip: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @CreateDateColumn()
  login_time: Date;
}
