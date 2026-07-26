import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export const REPORT_TARGET_TYPES = ['post', 'reply', 'resource', 'user'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'spam',
  'abuse',
  'porn',
  'illegal',
  'off_topic',
  'copyright',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['pending', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Statuses a moderator may move a report to; `pending` is only ever the initial one. */
export const REPORT_RESOLUTION_STATUSES = ['resolved', 'dismissed'] as const;
export type ReportResolutionStatus = (typeof REPORT_RESOLUTION_STATUSES)[number];

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return REPORT_TARGET_TYPES.includes(value as ReportTargetType);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return REPORT_STATUSES.includes(value as ReportStatus);
}

// The moderation queue reads `WHERE status = ? ORDER BY created_at`, so one composite
// index serves both halves of that clause.
@Index('idx_reports_status_created', ['status', 'created_at'])
// "How many open reports does this target have?" — asked on every successful report
// to decide whether the auto-hide threshold has been crossed.
@Index('idx_reports_target', ['target_type', 'target_id'])
// Deliberately *not* unique: the duplicate rule only applies to reports still
// pending, and a partial index cannot express that in MySQL. The check lives in
// ReportsService.create instead, and this index is what keeps it cheap.
@Index('idx_reports_reporter_target', ['reporter_id', 'target_type', 'target_id'])
@Index('idx_reports_reporter_created', ['reporter_id', 'created_at'])
@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reporter_id: number;

  @Column({ length: 20 })
  target_type: ReportTargetType;

  /**
   * Row id inside whichever table `target_type` names.
   *
   * Polymorphic, so no foreign key can cover it — a report has to outlive the
   * content it accuses, otherwise deleting the offending post would erase the
   * evidence for it.
   */
  @Column()
  target_id: number;

  @Column({ length: 30 })
  reason: ReportReason;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({ length: 20, default: 'pending' })
  status: ReportStatus;

  @Column({ type: 'int', nullable: true })
  handled_by: number | null;

  @Column({ type: 'datetime', nullable: true })
  handled_at: Date | null;

  @Column({ type: 'text', nullable: true })
  resolution_note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  // SET NULL rather than CASCADE: losing the moderator's account must not delete the
  // report and its resolution note along with them.
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'handled_by' })
  handler: User | null;
}
