import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('mobile_sessions')
@Index('idx_mobile_sessions_user_active', ['user_id', 'revoked_at'])
export class MobileSession {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column() user_id: number;
  @Column({ length: 128 }) device_name: string;
  // Union types reflect as Object at runtime; MySQL needs an explicit column type.
  @Column({ type: 'varchar', length: 45, nullable: true }) ip_address: string | null;
  @Column({ type: 'text', nullable: true }) user_agent: string | null;
  @Column({ type: 'datetime', nullable: true }) last_seen_at: Date | null;
  @Column({ type: 'datetime', nullable: true }) revoked_at: Date | null;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
}
