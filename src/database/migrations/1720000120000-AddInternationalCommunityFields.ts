import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Add verification, locale, and content-language fields without changing legacy rows' access. */
export class AddInternationalCommunityFields1720000120000 implements MigrationInterface {
  name = 'AddInternationalCommunityFields1720000120000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const users = await queryRunner.getTable('users');
    if (users && !users.findColumnByName('email_verified')) {
      await queryRunner.addColumn('users', new TableColumn({ name: 'email_verified', type: 'tinyint', width: 1, isNullable: false, default: 0 }));
      // The previous local schema had no authoritative verification bit. Do not
      // infer verification from an email address or MindAuth link; the next OAuth
      // login syncs the authoritative MindAuth claim before writes are allowed.
    }
    const refreshedUsers = await queryRunner.getTable('users');
    if (refreshedUsers && !refreshedUsers.findColumnByName('preferred_locale')) {
      await queryRunner.addColumn('users', new TableColumn({ name: 'preferred_locale', type: 'varchar', length: '16', isNullable: true }));
    }

    for (const tableName of ['posts', 'resources']) {
      const table = await queryRunner.getTable(tableName);
      if (table && !table.findColumnByName('content_language')) {
        await queryRunner.addColumn(tableName, new TableColumn({ name: 'content_language', type: 'varchar', length: '16', isNullable: false, default: "'unknown'" }));
      }
    }

    const resources = await queryRunner.getTable('resources');
    if (resources && !resources.findColumnByName('origin_site')) {
      await queryRunner.addColumn('resources', new TableColumn({ name: 'origin_site', type: 'varchar', length: '32', isNullable: true }));
    }
    const refreshedResources = await queryRunner.getTable('resources');
    if (refreshedResources && !refreshedResources.findColumnByName('origin_resource_id')) {
      await queryRunner.addColumn('resources', new TableColumn({ name: 'origin_resource_id', type: 'varchar', length: '128', isNullable: true }));
    }
    const latestResources = await queryRunner.getTable('resources');
    if (latestResources && !latestResources.findColumnByName('origin_url')) {
      await queryRunner.addColumn('resources', new TableColumn({ name: 'origin_url', type: 'varchar', length: '500', isNullable: true }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['resources', 'posts']) {
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName('content_language')) await queryRunner.dropColumn(tableName, 'content_language');
    }
    const resources = await queryRunner.getTable('resources');
    for (const column of ['origin_url', 'origin_resource_id', 'origin_site']) {
      if (resources?.findColumnByName(column)) await queryRunner.dropColumn('resources', column);
    }
    const users = await queryRunner.getTable('users');
    if (users?.findColumnByName('preferred_locale')) await queryRunner.dropColumn('users', 'preferred_locale');
    if (users?.findColumnByName('email_verified')) await queryRunner.dropColumn('users', 'email_verified');
  }
}
