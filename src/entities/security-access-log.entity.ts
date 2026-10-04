import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('idx_security_access_logs_created_at', ['created_at'])
@Index('idx_security_access_logs_request_id', ['request_id'])
@Index('idx_security_access_logs_user_created', ['user_id', 'created_at'])
@Index('idx_security_access_logs_resource', ['resource_type', 'resource_id', 'created_at'])
@Index('idx_security_access_logs_status_created', ['status_code', 'created_at'])
@Index('idx_security_access_logs_ip_created', ['ip_address', 'created_at'])
@Entity('security_access_logs')
export class SecurityAccessLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 80 })
  request_id: string;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ length: 12 })
  method: string;

  @Column({ length: 255 })
  route: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  resource_type: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource_id: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  user_agent: string | null;

  @Column({ type: 'smallint', unsigned: true })
  status_code: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;
}
