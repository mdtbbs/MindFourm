import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, columnExists } from './migration-utils';

export class AddResourceVersionContent1720000014000 implements MigrationInterface {
  name = 'AddResourceVersionContent1720000014000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'resource_versions', 'content', 'TEXT NULL');
    await addColumnIfMissing(queryRunner, 'resource_versions', 'content_html', 'TEXT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'resource_versions', 'content_html')) {
      await queryRunner.query('ALTER TABLE `resource_versions` DROP COLUMN `content_html`');
    }
    if (await columnExists(queryRunner, 'resource_versions', 'content')) {
      await queryRunner.query('ALTER TABLE `resource_versions` DROP COLUMN `content`');
    }
  }
}
