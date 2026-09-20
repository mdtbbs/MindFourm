import { MigrationInterface, QueryRunner } from 'typeorm';
import { classifyLegacyGithubSyncPosts } from './1720000051000-ClassifyLegacyGithubSyncPosts';

/**
 * Repairs installations that recorded the original classification migration
 * before its title-prefix matcher was corrected. The shared update only changes
 * audited GitHub posts in the two dedicated boards, so it is safe to rerun.
 */
export class RepairLegacyGithubSyncPostClassification1720000052000 implements MigrationInterface {
  name = 'RepairLegacyGithubSyncPostClassification1720000052000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await classifyLegacyGithubSyncPosts(queryRunner);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Do not erase durable provenance during rollback.
  }
}
