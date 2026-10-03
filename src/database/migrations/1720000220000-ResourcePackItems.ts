import { MigrationInterface, QueryRunner } from 'typeorm';

/** Stores a Pack version's fixed references to exact resource versions. */
export class ResourcePackItems1720000220000 implements MigrationInterface {
  name = 'ResourcePackItems1720000220000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_pack_items (
        id INT NOT NULL AUTO_INCREMENT,
        pack_version_id INT NOT NULL,
        member_resource_version_id INT NOT NULL,
        sort_order INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE INDEX uq_resource_pack_items_membership (pack_version_id, member_resource_version_id),
        INDEX idx_resource_pack_items_order (pack_version_id, sort_order, id),
        CONSTRAINT fk_resource_pack_items_pack_version FOREIGN KEY (pack_version_id) REFERENCES resource_versions (id) ON DELETE CASCADE,
        CONSTRAINT fk_resource_pack_items_member_version FOREIGN KEY (member_resource_version_id) REFERENCES resource_versions (id) ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `resource_pack_items`');
  }
}
