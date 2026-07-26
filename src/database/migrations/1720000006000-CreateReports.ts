import { MigrationInterface, QueryRunner } from 'typeorm';
import { addForeignKeyIfMissing, createIndexIfMissing, tableExists } from './migration-utils';

/**
 * Content report queue.
 *
 * The table may already exist before this runs: on an empty database the baseline
 * materialises every entity, including `Report`. So the DDL here has to converge on
 * the same shape rather than assume it is creating the table — the indexes and
 * foreign keys are applied through the information_schema guards, which is also what
 * keeps a re-run from aborting the boot (MySQL 8 has no
 * `CREATE INDEX IF NOT EXISTS`).
 */
export class CreateReports1720000006000 implements MigrationInterface {
  name = 'CreateReports1720000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `reporter_id` and `handled_by` both reference users; without that table there is
    // nothing to hang the foreign keys off and the baseline has not run yet.
    if (!(await tableExists(queryRunner, 'users'))) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT PRIMARY KEY AUTO_INCREMENT,
        reporter_id INT NOT NULL,
        target_type VARCHAR(20) NOT NULL,
        target_id INT NOT NULL,
        reason VARCHAR(30) NOT NULL,
        detail TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        handled_by INT NULL,
        handled_at DATETIME NULL,
        resolution_note TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_reports_status_created (status, created_at),
        INDEX idx_reports_target (target_type, target_id),
        INDEX idx_reports_reporter_target (reporter_id, target_type, target_id),
        INDEX idx_reports_reporter_created (reporter_id, created_at)
      )
    `);

    await createIndexIfMissing(queryRunner, 'reports', 'idx_reports_status_created', ['status', 'created_at']);
    await createIndexIfMissing(queryRunner, 'reports', 'idx_reports_target', ['target_type', 'target_id']);
    await createIndexIfMissing(queryRunner, 'reports', 'idx_reports_reporter_target', [
      'reporter_id',
      'target_type',
      'target_id',
    ]);
    await createIndexIfMissing(queryRunner, 'reports', 'idx_reports_reporter_created', ['reporter_id', 'created_at']);

    await addForeignKeyIfMissing(
      queryRunner,
      'reports',
      'fk_reports_reporter',
      'reporter_id',
      'users',
      'id',
      'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner,
      'reports',
      'fk_reports_handled_by',
      'handled_by',
      'users',
      'id',
      'SET NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS reports');
  }
}
