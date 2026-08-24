import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves the legacy settings JSON into first-class, independently addressable
 * notices. The legacy value remains untouched so a deployment can roll back
 * without losing the only pre-migration source of truth.
 */
export class CreateNotices1720000046000 implements MigrationInterface {
  name = 'CreateNotices1720000046000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS notices (
      id INT NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, slug VARCHAR(255) NULL,
      title VARCHAR(255) NOT NULL, excerpt VARCHAR(500) NULL, content_markdown TEXT NOT NULL,
      content_html TEXT NULL, notice_type VARCHAR(32) NOT NULL DEFAULT 'system',
      status VARCHAR(32) NOT NULL DEFAULT 'draft', author_user_id INT NULL,
      is_pinned TINYINT NOT NULL DEFAULT 0, pinned_at DATETIME NULL, published_at DATETIME NULL,
      edited_at DATETIME NULL, view_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      deleted_at DATETIME(6) NULL, PRIMARY KEY (id),
      UNIQUE KEY uq_notices_public_id (public_id), UNIQUE KEY uq_notices_slug (slug),
      KEY idx_notices_public_feed (deleted_at, status, is_pinned, published_at, id),
      KEY idx_notices_public_type_feed (deleted_at, status, notice_type, published_at, id),
      KEY idx_notices_author_created (author_user_id, created_at),
      CONSTRAINT fk_notices_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS notice_revisions (
      id INT NOT NULL AUTO_INCREMENT, notice_id INT NOT NULL, editor_id INT NULL,
      title VARCHAR(255) NOT NULL, content_markdown TEXT NOT NULL, excerpt VARCHAR(500) NULL,
      notice_type VARCHAR(32) NOT NULL, change_summary VARCHAR(255) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      KEY idx_notice_revisions_notice_created (notice_id, created_at, id),
      CONSTRAINT fk_notice_revisions_notice FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE,
      CONSTRAINT fk_notice_revisions_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const rows = await queryRunner.query("SELECT value FROM settings WHERE `key` = 'notices_content' LIMIT 1").catch(() => []);
    if (!rows[0]?.value) return;
    let records: unknown;
    try { records = JSON.parse(rows[0].value); } catch { return; }
    if (!Array.isArray(records)) return;
    for (const value of records.slice(0, 50)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if (typeof item.title !== 'string' || !item.title.trim() || typeof item.content !== 'string') continue;
      const publishedAt = typeof item.published_at === 'string' && !Number.isNaN(Date.parse(item.published_at))
        ? new Date(item.published_at) : new Date();
      const publicId = await queryRunner.query('SELECT UUID() AS id');
      await queryRunner.query(
        `INSERT INTO notices (public_id, title, excerpt, content_markdown, notice_type, status, is_pinned, pinned_at, published_at)
         VALUES (?, ?, ?, ?, 'system', 'published', ?, ?, ?)`,
        [publicId[0].id, item.title.trim().slice(0, 255), item.content.replace(/[#*_>\[\]()`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || null,
          item.content, item.pinned === true ? 1 : 0, item.pinned === true ? publishedAt : null, publishedAt],
      );
    }
  }

  async down(): Promise<void> {
    // Deliberately non-destructive: imported notices are operational content and
    // the preserved settings JSON permits application rollback without data loss.
  }
}
