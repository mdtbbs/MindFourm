import { MigrationInterface, QueryRunner } from 'typeorm';

/** Version-specific RES previews; historical metadata preview_key/PNG remain readable. */
export class ResourceVersionStoragePreviews1720000310000 implements MigrationInterface {
  name = 'ResourceVersionStoragePreviews1720000310000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE resource_versions
      ADD COLUMN renderer_preview_object_id VARCHAR(128) NULL,
      ADD COLUMN renderer_preview_binding_id VARCHAR(128) NULL`);
    await queryRunner.query(`ALTER TABLE resource_upload_drafts
      ADD COLUMN preview_object_id VARCHAR(128) NULL,
      ADD COLUMN preview_binding_id VARCHAR(128) NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE resource_upload_drafts DROP COLUMN preview_binding_id, DROP COLUMN preview_object_id`);
    await queryRunner.query(`ALTER TABLE resource_versions
      DROP COLUMN renderer_preview_binding_id,
      DROP COLUMN renderer_preview_object_id`);
  }
}
