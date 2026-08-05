import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, columnExists } from './migration-utils';

export class AddResourceRejectReason1720000015000 implements MigrationInterface {
  name = 'AddResourceRejectReason1720000015000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'resources', 'reject_reason', 'VARCHAR(500) NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'resources', 'reject_reason')) {
      await queryRunner.query('ALTER TABLE `resources` DROP COLUMN `reject_reason`');
    }
  }
}
