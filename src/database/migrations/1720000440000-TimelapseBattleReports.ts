import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './migration-utils';

/**
 * 基地延时摄影 & 战报卡（模块四）。
 *
 * `timelapse_reports` 同时承担上传会话与成片元数据：上传阶段保存原始
 * `.mreplay.zip` 对象键，渲染完成后记录 H.264 MP4 / WebP 封面与图表摘要。
 * `timelapse_post_refs` 只记录已发布帖子的引用，用于维护
 * `bound_post_count` 与“随帖子永久保留”的生命周期语义。
 *
 * 与其它迁移一致，建表前检查 `tableExists`：全新数据库会先由 baseline 的
 * synchronize 路径建表，已有数据库在这里补齐，两者都必须无重复建表错误。
 */
export class TimelapseBattleReports1720000440000 implements MigrationInterface {
  name = 'TimelapseBattleReports1720000440000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'timelapse_reports'))) {
      await queryRunner.query(`CREATE TABLE timelapse_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        public_id CHAR(36) NOT NULL UNIQUE,
        author_user_id INT NOT NULL,
        status ENUM('uploading','queued','processing','pending_review','published','rejected','failed') NOT NULL DEFAULT 'uploading',
        visibility ENUM('private','unlisted','public') NOT NULL DEFAULT 'public',
        map_name VARCHAR(160) NOT NULL,
        map_width INT UNSIGNED NULL,
        map_height INT UNSIGNED NULL,
        game_mode VARCHAR(40) NULL,
        game_version VARCHAR(64) NULL,
        is_multiplayer BOOLEAN NOT NULL DEFAULT FALSE,
        max_wave INT UNSIGNED NOT NULL DEFAULT 0,
        duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
        frame_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        source_object_key VARCHAR(512) NULL,
        source_sha256 CHAR(64) NULL,
        source_size_bytes BIGINT UNSIGNED NULL,
        source_purge_after DATETIME NULL,
        video_object_key VARCHAR(512) NULL,
        poster_object_key VARCHAR(512) NULL,
        summary_metrics_json JSON NULL,
        highlights_json JSON NULL,
        bound_post_count INT UNSIGNED NOT NULL DEFAULT 0,
        expires_at DATETIME NULL,
        reviewed_by_user_id INT NULL,
        reviewed_at DATETIME NULL,
        review_reason VARCHAR(500) NULL,
        failure_code VARCHAR(64) NULL,
        failure_reason VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        INDEX idx_tr_author_unbound (author_user_id, bound_post_count, deleted_at),
        INDEX idx_tr_status_created (status, created_at),
        INDEX idx_tr_expiry (expires_at, bound_post_count, deleted_at),
        INDEX idx_tr_source_purge (source_purge_after)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'timelapse_post_refs'))) {
      await queryRunner.query(`CREATE TABLE timelapse_post_refs (
        timelapse_id BIGINT UNSIGNED NOT NULL,
        post_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timelapse_id, post_id),
        INDEX idx_tpr_post (post_id),
        CONSTRAINT fk_tpr_timelapse FOREIGN KEY (timelapse_id) REFERENCES timelapse_reports(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 子表先删除，避免外键约束阻止回滚。
    await queryRunner.query('DROP TABLE IF EXISTS timelapse_post_refs');
    await queryRunner.query('DROP TABLE IF EXISTS timelapse_reports');
  }
}
