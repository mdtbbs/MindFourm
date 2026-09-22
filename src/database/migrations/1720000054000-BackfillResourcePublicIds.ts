import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public V1 clients identify resources and releases by UUID rather than by the
 * internal auto-incrementing database ID. New rows already receive UUIDs in
 * the service layer; this migration closes the gap for legacy rows created
 * before the public aggregate fields existed.
 */
export class BackfillResourcePublicIds1720000054000 implements MigrationInterface {
  name = 'BackfillResourcePublicIds1720000054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE `resources` SET `public_id` = UUID() WHERE `public_id` IS NULL',
    );
    await queryRunner.query(
      'UPDATE `resource_versions` SET `public_id` = UUID() WHERE `public_id` IS NULL',
    );
  }

  public async down(): Promise<void> {
    // Public IDs are durable identifiers. They must not be removed on rollback
    // because clients may already have persisted them.
  }
}
