import { MigrationInterface, QueryRunner } from 'typeorm';

/** Stores private, quarantined binary evidence separately from public report DTOs. */
export class ModReportAttachments1720000280000 implements MigrationInterface {
  name = 'ModReportAttachments1720000280000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS mod_report_attachments (
      id INT NOT NULL AUTO_INCREMENT,
      public_id CHAR(36) NOT NULL,
      issue_report_id INT NULL,
      compatibility_report_id INT NULL,
      kind VARCHAR(16) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INT UNSIGNED NOT NULL,
      sha256 CHAR(64) NOT NULL,
      uploaded_by_user_id INT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_mod_report_attachments_public_id (public_id),
      KEY idx_mod_report_attachments_issue (issue_report_id,created_at),
      KEY idx_mod_report_attachments_compatibility (compatibility_report_id,created_at),
      CONSTRAINT chk_mod_report_attachments_exactly_one_parent CHECK (
        (issue_report_id IS NOT NULL AND compatibility_report_id IS NULL)
        OR (issue_report_id IS NULL AND compatibility_report_id IS NOT NULL)
      ),
      CONSTRAINT fk_mod_report_attachments_issue FOREIGN KEY (issue_report_id) REFERENCES mod_issue_reports(id) ON DELETE CASCADE,
      CONSTRAINT fk_mod_report_attachments_compat FOREIGN KEY (compatibility_report_id) REFERENCES mod_compatibility_reports(id) ON DELETE CASCADE,
      CONSTRAINT fk_mod_report_attachments_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS mod_report_attachments');
  }
}
