import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Index('idx_lanlink_quick_codes_user', ['user_id'], { unique: true })
@Index('idx_lanlink_quick_codes_hash', ['code_hash'], { unique: true })
@Index('idx_lanlink_quick_codes_prefix', ['code_prefix'])
@Index('idx_lanlink_quick_codes_enabled', ['enabled'])
@Entity('lanlink_quick_codes')
export class LanLinkQuickCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ length: 24 })
  code_prefix: string;

  @Column({ length: 64 })
  code_hash: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 1 })
  token_version: number;

  @Column({ type: 'datetime', nullable: true })
  rotated_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  last_used_at: Date | null;

  @Column({ type: 'int', default: 0 })
  use_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
