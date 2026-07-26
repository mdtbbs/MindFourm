import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

// This table grows without bound and had no indexes at all, so the audit lookups
// and the retention sweep both scanned every row ever written.
@Index('idx_session_audit_session_token', ['session_token'])
@Index('idx_session_audit_user_id', ['user_id'])
@Index('idx_session_audit_created_at', ['created_at'])
@Entity('session_audit')
export class SessionAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number;

  /**
   * SHA-256 digest of the session token — never the token itself.
   *
   * Nothing looks rows up by this value; it exists so two audit entries can be
   * correlated to one session. Storing the raw 96-char bearer token (as this used
   * to) meant any database read, backup or replica leak yielded a set of directly
   * replayable live sessions.
   */
  @Column({ length: 255 })
  session_token: string;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @CreateDateColumn()
  created_at: Date;

  // SET NULL rather than CASCADE: an audit trail that deletes itself along with the
  // account it recorded is not an audit trail.
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
