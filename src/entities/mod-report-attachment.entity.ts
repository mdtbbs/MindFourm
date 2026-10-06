import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Private binary evidence attached to a Mod issue or compatibility report. */
@Entity('mod_report_attachments')
@Index('uq_mod_report_attachments_public_id', ['public_id'], { unique: true })
@Index('idx_mod_report_attachments_issue', ['issue_report_id', 'created_at'])
@Index('idx_mod_report_attachments_compatibility', ['compatibility_report_id', 'created_at'])
export class ModReportAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36 })
  public_id: string;

  @Column({ type: 'int', nullable: true })
  issue_report_id: number | null;

  @Column({ type: 'int', nullable: true })
  compatibility_report_id: number | null;

  @Column({ type: 'varchar', length: 16 })
  kind: 'log' | 'image';

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  /** Absolute forum-managed quarantine path. Never include it in API DTOs. */
  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'int', unsigned: true })
  file_size: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'int', nullable: true })
  uploaded_by_user_id: number | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;
}
