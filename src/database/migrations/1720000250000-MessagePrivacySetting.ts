import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds an opt-in inbound-message policy while preserving existing open-message behavior by default. */
export class MessagePrivacySetting1720000250000 implements MigrationInterface {
  name = 'MessagePrivacySetting1720000250000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query("SHOW COLUMNS FROM social_privacy_settings LIKE 'allow_messages'");
    if (columns.length) return;
    await queryRunner.query(`
      ALTER TABLE social_privacy_settings
      ADD COLUMN allow_messages ENUM('everyone', 'friends', 'nobody') NOT NULL DEFAULT 'everyone'
    `);
  }

  async down(): Promise<void> {
    // Keep users' privacy choice when rolling back an older application binary.
    // The extra column is additive and safely ignored by binaries that predate it.
  }
}
