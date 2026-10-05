import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive RES references; existing MFL integers and managed paths are untouched. */
export class AddResourceStorageReferences1720000290000 implements MigrationInterface {
  name = 'AddResourceStorageReferences1720000290000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE resource_files
      ADD COLUMN provider_object_id VARCHAR(128) NULL AFTER provider_file_id,
      ADD COLUMN provider_binding_id VARCHAR(128) NULL AFTER provider_object_id`);
    await queryRunner.query(`ALTER TABLE resources
      ADD COLUMN renderer_preview_object_id VARCHAR(128) NULL AFTER renderer_preview_key,
      ADD COLUMN renderer_preview_binding_id VARCHAR(128) NULL AFTER renderer_preview_object_id`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE resources
      DROP COLUMN renderer_preview_binding_id,
      DROP COLUMN renderer_preview_object_id`);
    await queryRunner.query(`ALTER TABLE resource_files
      DROP COLUMN provider_binding_id,
      DROP COLUMN provider_object_id`);
  }
}
