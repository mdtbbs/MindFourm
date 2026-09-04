import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLegacyFooterBrand1720000043000 implements MigrationInterface {
  name = 'FixLegacyFooterBrand1720000043000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE settings
          SET value = REPLACE(value, '社区论坛', 'MDTBBS')
        WHERE \`key\` IN ('footer_copyright', 'site_footer')
          AND value LIKE '%社区论坛%'`,
    );
  }

  async down(): Promise<void> {
    // Branding changes are content edits and must not be guessed during rollback.
  }
}
