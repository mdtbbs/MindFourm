import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { MobileSession } from './mobile-session.entity';

@Entity('mobile_refresh_tokens')
@Index('uq_mobile_refresh_tokens_hash', ['token_hash'], { unique: true })
@Index('idx_mobile_refresh_tokens_family_active', ['family_id', 'revoked_at'])
export class MobileRefreshToken {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) session_id: string;
  @Column({ type: 'char', length: 36 }) family_id: string;
  @Column({ type: 'char', length: 64 }) token_hash: string;
  @Column({ type: 'char', length: 36, nullable: true }) replaced_by_id: string | null;
  @Column({ type: 'datetime' }) expires_at: Date;
  @Column({ type: 'datetime', nullable: true }) revoked_at: Date | null;
  @CreateDateColumn() created_at: Date;
  @ManyToOne(() => MobileSession, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'session_id' }) session: MobileSession;
}
