import AppDataSource from '../database/data-source';
import { buildResourceMigrationAudit } from './resource-migration-audit.report';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const report = await buildResourceMigrationAudit(
      (sql, parameters) => AppDataSource.query(sql, parameters),
      new Date(),
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error('Resource migration audit failed:', error);
  process.exitCode = 1;
});
