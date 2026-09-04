import { MigrationInterface, QueryRunner } from 'typeorm';
import { columnExists } from './migration-utils';

/**
 * Adds `terms_accepted_at` to users so the forum can track per-user acceptance
 * of the Terms / Privacy policy, and backfill existing users to NOW() so they
 * are not forced to re-accept on first deploy.
 */
export class AddTermsAcceptedToUsers1720000021000 implements MigrationInterface {
  name = 'AddTermsAcceptedToUsers1720000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await columnExists(queryRunner, 'users', 'terms_accepted_at'))) {
      await queryRunner.query(
        'ALTER TABLE `users` ADD COLUMN `terms_accepted_at` DATETIME NULL AFTER `phone_verified_at`',
      );
      // Backfill existing users: treat them as having accepted at deploy time,
      // so they are not forced to re-accept immediately. Admins can bump the
      // `terms_updated_at` setting later to require a fresh acceptance.
      await queryRunner.query(
        'UPDATE `users` SET `terms_accepted_at` = NOW() WHERE `terms_accepted_at` IS NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'users', 'terms_accepted_at')) {
      await queryRunner.query('ALTER TABLE `users` DROP COLUMN `terms_accepted_at`');
    }
  }
}
