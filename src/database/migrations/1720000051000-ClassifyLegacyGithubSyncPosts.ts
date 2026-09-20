import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './migration-utils';

/**
 * The former GitHub polling integration created ordinary posts under its bot
 * account. The title marker, board name, and successful external API audit are
 * all required so a member's unrelated topic is never silently reclassified.
 */
export class ClassifyLegacyGithubSyncPosts1720000051000 implements MigrationInterface {
  name = 'ClassifyLegacyGithubSyncPosts1720000051000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!await tableExists(queryRunner, 'posts') || !await tableExists(queryRunner, 'categories') || !await tableExists(queryRunner, 'external_api_audit_logs')) return;
    await queryRunner.query(`
      UPDATE posts post
      INNER JOIN categories category ON category.id = post.category_id
      SET post.source = CASE category.name
        WHEN 'iss问题动态' THEN 'GITHUB_ISSUE'
        WHEN 'PR合并请求' THEN 'GITHUB_PR'
        ELSE post.source
      END
      WHERE post.source = 'USER'
        AND category.name IN ('iss问题动态', 'PR合并请求')
        AND post.title LIKE '[#%]'
        AND EXISTS (
          SELECT 1 FROM external_api_audit_logs audit
          WHERE audit.target_type = 'post'
            AND audit.target_id = post.id
            AND audit.action = 'posts.create'
            AND audit.status = 'success'
        )
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Do not erase durable provenance during rollback.
  }
}
