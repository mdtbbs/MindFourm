import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class CreateContentRelations1720000059000 implements MigrationInterface {
  name = 'CreateContentRelations1720000059000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS content_relations (
        id INT NOT NULL AUTO_INCREMENT,
        source_type VARCHAR(32) NOT NULL,
        source_id INT NOT NULL,
        target_type VARCHAR(64) NOT NULL,
        target_id VARCHAR(191) NOT NULL,
        relation_type VARCHAR(32) NOT NULL DEFAULT 'related',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_content_relation (source_type, source_id, target_type, target_id, relation_type),
        INDEX idx_content_relation_target (target_type, target_id, relation_type),
        INDEX idx_content_relation_source (source_type, source_id, relation_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Expand first and retain the legacy column during the compatibility window.
    await queryRunner.query(`
      INSERT IGNORE INTO content_relations
        (source_type, source_id, target_type, target_id, relation_type, created_at)
      SELECT 'post', id, 'game_server', CAST(server_id AS CHAR), 'related', CURRENT_TIMESTAMP
        FROM posts WHERE server_id IS NOT NULL
    `);
    const posts = await queryRunner.getTable('posts');
    if (posts?.findColumnByName('server_id')) {
      if (posts.indices.some((index) => index.name === 'idx_posts_server_id')) {
        await queryRunner.dropIndex('posts', 'idx_posts_server_id');
      }
      await queryRunner.dropColumn('posts', 'server_id');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const posts = await queryRunner.getTable('posts');
    if (posts && !posts.findColumnByName('server_id')) {
      await queryRunner.addColumn('posts', new TableColumn({ name: 'server_id', type: 'int', isNullable: true }));
      await queryRunner.createIndex('posts', new TableIndex({ name: 'idx_posts_server_id', columnNames: ['server_id'] }));
      if (await queryRunner.hasTable('content_relations')) {
        await queryRunner.query(`
          UPDATE posts p
          JOIN content_relations cr ON cr.source_type = 'post' AND cr.source_id = p.id
            AND cr.target_type = 'game_server' AND cr.relation_type = 'related'
          SET p.server_id = CAST(cr.target_id AS UNSIGNED)
          WHERE cr.target_id REGEXP '^[0-9]+$'
        `);
      }
    }
    // Keep relation rows through rollback; an older binary ignores the additive table.
  }
}
