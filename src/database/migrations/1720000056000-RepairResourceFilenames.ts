import { MigrationInterface, QueryRunner } from 'typeorm';
import { repairMojibakeFilename } from '../../common/utils/filename.util';

type FilenameRow = { id: number; value: string | null };

/** Repairs filenames persisted from multipart Latin-1/UTF-8 decoding drift. */
export class RepairResourceFilenames1720000056000 implements MigrationInterface {
  name = 'RepairResourceFilenames1720000056000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.repairColumn(queryRunner, 'resources', 'file_name');
    await this.repairColumn(queryRunner, 'resource_versions', 'file_name');
    await this.repairColumn(queryRunner, 'resource_files', 'display_name');
    await this.repairColumn(queryRunner, 'resource_files', 'original_filename');
  }

  private async repairColumn(queryRunner: QueryRunner, table: string, column: string): Promise<void> {
    if (!await queryRunner.hasTable(table)) return;

    const rows = await queryRunner.query(
      `SELECT id, \`${column}\` AS value FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`,
    ) as FilenameRow[];
    for (const row of rows) {
      const repaired = repairMojibakeFilename(row.value);
      if (repaired !== row.value) {
        await queryRunner.query(
          `UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`,
          [repaired, row.id],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Filename repair is intentionally not reversible: restoring mojibake would
    // reintroduce broken download names and corrupt newly uploaded records.
  }
}
