import { MigrationInterface, QueryRunner } from 'typeorm';

/** Email is an optional OAuth claim; a forum identity only requires profile scope. */
export class AllowUsersWithoutEmail1720000100000 implements MigrationInterface {
  name = 'AllowUsersWithoutEmail1720000100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const email = table?.findColumnByName('email');
    if (email && !email.isNullable) {
      const nullableEmail = email.clone();
      nullableEmail.isNullable = true;
      await queryRunner.changeColumn('users', email, nullableEmail);
    }
  }

  async down(): Promise<void> {
    // Existing OAuth-created users may not have granted email. Keep those accounts usable on rollback.
  }
}
