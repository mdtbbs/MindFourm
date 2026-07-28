import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExternalApiKey } from './external-api-key.entity';
import { User } from './user.entity';

@Index('idx_external_api_audit_key_created', ['api_key_id', 'created_at'])
@Index('idx_external_api_audit_action', ['action'])
@Index('idx_external_api_audit_status', ['status'])
@Index('idx_external_api_audit_actor', ['actor_user_id'])
@Entity('external_api_audit_logs')
export class ExternalApiAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  api_key_id: number | null;

  @Column({ length: 100, nullable: true })
  api_key_name: string | null;

  @Column({ length: 120 })
  action: string;

  @Column({ length: 100, nullable: true })
  scope: string | null;

  @Column({ nullable: true })
  actor_user_id: number | null;

  @Column({ length: 100, nullable: true })
  target_type: string | null;

  @Column({ nullable: true })
  target_id: number | null;

  @Column({ length: 100, nullable: true })
  request_id: string | null;

  @Column({ length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'text', nullable: true })
  details_json: string | null;

  @Column({ length: 20, default: 'success' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ExternalApiKey, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'api_key_id' })
  apiKey: ExternalApiKey | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actor: User | null;
}
