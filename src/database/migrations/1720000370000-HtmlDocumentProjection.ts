import { MigrationInterface, QueryRunner } from 'typeorm';

/** HTML srcdoc projections can exceed MySQL TEXT's 64KB limit. */
export class HtmlDocumentProjection1720000370000 implements MigrationInterface {
  name = 'HtmlDocumentProjection1720000370000';
  transaction = false;
  private readonly columns = [['posts', 'content_html'], ['replies', 'content_html'], ['resources', 'content_html'], ['resource_versions', 'release_notes_html']] as const;

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of this.columns) {
      await queryRunner.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` MEDIUMTEXT NULL`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Check every table before changing any: a rollback must not truncate published HTML.
    for (const [table, column] of this.columns) {
      const rows = await queryRunner.query(`SELECT 1 FROM \`${table}\` WHERE OCTET_LENGTH(\`${column}\`) > 65535 LIMIT 1`);
      if (rows.length) throw new Error(`Cannot shrink ${table}.${column}: HTML documents exceed TEXT capacity`);
    }
    for (const [table, column] of this.columns) {
      await queryRunner.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` TEXT NULL`);
    }
  }
}
