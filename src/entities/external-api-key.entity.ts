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

@Index('idx_external_api_keys_prefix', ['key_prefix'], { unique: true })
@Index('idx_external_api_keys_enabled', ['enabled'])
@Entity('external_api_keys')
export class ExternalApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 32 })
  key_prefix: string;

  @Column({ length: 64 })
  key_hash: string;

  @Column({ type: 'text' })
  scopes_json: string;

  @Column({ type: 'text', nullable: true })
  allowed_ips_json: string | null;

  @Column({ type: 'int', nullable: true })
  default_user_id: number | null;

  @Column({ type: 'int', default: 120 })
  rate_limit_per_minute: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'datetime', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  last_used_at: Date | null;

  @Column({ type: 'int', nullable: true })
  created_by: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_user_id' })
  defaultUser: User | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;
}
