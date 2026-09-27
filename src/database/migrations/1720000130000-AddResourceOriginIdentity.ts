import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/** Ensure one imported copy of a given resource exists per source community identity. */
export class AddResourceOriginIdentity1720000130000 implements MigrationInterface {
  name = 'AddResourceOriginIdentity1720000130000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const resources = await queryRunner.getTable('resources');
    if (!resources?.findColumnByName('origin_site') || !resources.findColumnByName('origin_resource_id')) return;
    if (!resources.indices.some((index) => index.name === 'uq_resources_origin_identity')) {
      await queryRunner.createIndex('resources', new TableIndex({
        name: 'uq_resources_origin_identity',
        columnNames: ['origin_site', 'origin_resource_id'],
        isUnique: true,
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const resources = await queryRunner.getTable('resources');
    if (resources?.indices.some((index) => index.name === 'uq_resources_origin_identity')) {
      await queryRunner.dropIndex('resources', 'uq_resources_origin_identity');
    }
  }
}
