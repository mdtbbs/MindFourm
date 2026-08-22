import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, addForeignKeyIfMissing, createIndexIfMissing } from './migration-utils';

/**
 * Makes forum boards first-class navigation data instead of a frontend name/id
 * heuristic. Existing boards remain visible and retain their current ordering.
 */
export class AddForumCategoryPresentation1720000044000 implements MigrationInterface {
  name = 'AddForumCategoryPresentation1720000044000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'categories', 'description', 'TEXT NULL');
    await addColumnIfMissing(queryRunner, 'categories', 'color', 'VARCHAR(7) NULL');
    await addColumnIfMissing(queryRunner, 'categories', 'icon', 'VARCHAR(50) NULL');
    await addColumnIfMissing(queryRunner, 'categories', 'group_key', 'VARCHAR(50) NULL');
    await addColumnIfMissing(queryRunner, 'categories', 'parent_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'categories', 'show_in_sidebar', 'TINYINT(1) NOT NULL DEFAULT 1');
    await createIndexIfMissing(queryRunner, 'categories', 'idx_categories_sidebar_order', [
      'show_in_sidebar', 'group_key', 'sort_order',
    ]);
    await addForeignKeyIfMissing(
      queryRunner,
      'categories',
      'fk_categories_parent',
      'parent_id',
      'categories',
      'id',
      'SET NULL',
    );

    // Existing communities get a sensible, persisted starting presentation. New
    // boards are configured in admin rather than being classified by frontend
    // name matching. Unknown names deliberately remain in the "其他" group.
    await queryRunner.query(`
      UPDATE categories
         SET group_key = CASE
               WHEN name REGEXP 'Mod|MOD|模组|工具|开发' THEN 'creation'
               WHEN name REGEXP '地图|蓝图|创作' THEN 'creation'
               WHEN name REGEXP '联机|游戏' THEN 'game'
               WHEN name REGEXP '公告|站务|意见|反馈' THEN 'meta'
               ELSE 'community'
             END,
             color = CASE
               WHEN name REGEXP '求助|问答' THEN '#F59E42'
               WHEN name REGEXP '教程|攻略' THEN '#10B981'
               WHEN name REGEXP 'Mod|MOD|模组|工具|开发' THEN '#9B7CF6'
               WHEN name REGEXP '地图' THEN '#22C55E'
               WHEN name REGEXP '蓝图' THEN '#3B82F6'
               WHEN name REGEXP '联机|游戏' THEN '#6366F1'
               WHEN name REGEXP '公告' THEN '#EF4444'
               WHEN name REGEXP '意见|反馈' THEN '#8B7AA8'
               ELSE '#64748B'
             END,
             icon = CASE
               WHEN name REGEXP '求助|问答' THEN 'CircleHelp'
               WHEN name REGEXP '教程|攻略' THEN 'BookOpen'
               WHEN name REGEXP 'Mod|MOD|模组|工具|开发' THEN 'Code2'
               WHEN name REGEXP '地图' THEN 'Map'
               WHEN name REGEXP '蓝图' THEN 'Shapes'
               WHEN name REGEXP '联机|游戏' THEN 'Radio'
               WHEN name REGEXP '公告' THEN 'Megaphone'
               ELSE 'MessageCircle'
             END
       WHERE group_key IS NULL
    `);
  }

  async down(): Promise<void> {
    // This additive presentation metadata is intentionally retained on rollback.
  }
}
