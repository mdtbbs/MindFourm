import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, tableExists, addForeignKeyIfMissing } from './migration-utils';

export class AddCategoryParentId1720000033000 implements MigrationInterface {
  name = 'AddCategoryParentId1720000033000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'resource_categories')) {
      await addColumnIfMissing(queryRunner, 'resource_categories', 'parent_id', 'INT NULL');
      await addForeignKeyIfMissing(
        queryRunner,
        'resource_categories',
        'fk_resource_categories_parent',
        'parent_id',
        'resource_categories',
        'id',
        'SET NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Column removal not needed for additive migration
  }
}
