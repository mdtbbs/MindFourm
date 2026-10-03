import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Persist the member's mixed-language feed/search preference independently of UI locale. */
export class AddPreferredContentLanguage1720000210000 implements MigrationInterface {
  name = 'AddPreferredContentLanguage1720000210000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const users = await queryRunner.getTable('users');
    if (users && !users.findColumnByName('preferred_content_language')) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'preferred_content_language', type: 'varchar', length: '16', isNullable: true,
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const users = await queryRunner.getTable('users');
    if (users?.findColumnByName('preferred_content_language')) {
      await queryRunner.dropColumn('users', 'preferred_content_language');
    }
  }
}
