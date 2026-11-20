import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 蓝图逻辑静态索引与可视化 Diff 的持久化结构。
 *
 * - `schematic_logic_processors` 增加源码与静态审计投影。源码只作为惰性文本
 *   保存和分析，服务端不会编译或执行 mlog。
 * - `schematic_logic_snippets` 是公开逻辑片段索引。它由“已审核发布的蓝图推荐
 *   版本”派生，资源下架、删除或转私有时必须同步清理，因此不把搜索结果直接
 *   建立在处理器表上。
 * - `resource_version_diffs` 已有 diff_json/status 字段，本迁移不复制表；schema
 *   v2 通过 diff_json.schema_version 区分，状态复用 `metadata_only` 等字符串。
 */
export class SchematicLogicSnippetsAndDiffV21720000420000 implements MigrationInterface {
  name = 'SchematicLogicSnippetsAndDiffV21720000420000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE schematic_logic_processors
      ADD COLUMN source_code MEDIUMTEXT NULL,
      ADD COLUMN source_truncated TINYINT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN source_sha256 CHAR(64) NULL,
      ADD COLUMN instruction_count INT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN estimated_cycle_ticks DECIMAL(10,2) NULL,
      ADD COLUMN audit_findings_json JSON NULL`);

    await queryRunner.query(`CREATE TABLE schematic_logic_snippets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      resource_id INT NOT NULL,
      resource_version_id INT NOT NULL,
      processor_id INT NULL,
      processor_key VARCHAR(128) NOT NULL,
      processor_type VARCHAR(64) NOT NULL,
      position_x INT NULL,
      position_y INT NULL,
      instruction_count INT UNSIGNED NOT NULL DEFAULT 0,
      estimated_cycle_ticks DECIMAL(10,2) NULL,
      opcodes_json JSON NULL,
      referenced_units_json JSON NULL,
      referenced_blocks_json JSON NULL,
      has_warnings TINYINT UNSIGNED NOT NULL DEFAULT 0,
      findings_json JSON NULL,
      source_sha256 CHAR(64) NULL,
      source_excerpt MEDIUMTEXT NULL,
      searchable_text MEDIUMTEXT NOT NULL,
      author_user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schematic_logic_snippets_version_processor (resource_version_id, processor_key),
      KEY idx_schematic_logic_snippets_resource (resource_id, resource_version_id),
      KEY idx_schematic_logic_snippets_processor_type (processor_type),
      KEY idx_schematic_logic_snippets_author (author_user_id),
      FULLTEXT KEY ft_schematic_logic_snippets_searchable (searchable_text)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS schematic_logic_snippets');
    await queryRunner.query(`ALTER TABLE schematic_logic_processors
      DROP COLUMN audit_findings_json,
      DROP COLUMN estimated_cycle_ticks,
      DROP COLUMN instruction_count,
      DROP COLUMN source_sha256,
      DROP COLUMN source_truncated,
      DROP COLUMN source_code`);
  }
}
