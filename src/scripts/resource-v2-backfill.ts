import AppDataSource from '../database/data-source';
import { runResourceV2Backfill, type BackfillMode } from '../database/backfills/resource-v2.backfill';
import { runResourceV2Reconciliation } from '../database/backfills/resource-v2.reconciliation';

function readMode(argv: readonly string[]): BackfillMode {
  const value = argv.find((argument) => argument.startsWith('--mode='))?.slice('--mode='.length);
  if (value === 'dry-run' || value === 'write') return value;
  throw new Error('Usage: resource-v2-backfill --mode=dry-run|write');
}

async function main(): Promise<void> {
  const mode = readMode(process.argv.slice(2));
  await AppDataSource.initialize();
  try {
    const backfill = await runResourceV2Backfill(AppDataSource, mode);
    const reconciliation = await runResourceV2Reconciliation(AppDataSource, new Date());
    process.stdout.write(`${JSON.stringify({ mode, backfill, reconciliation }, null, 2)}\n`);
    if (backfill.errors.length > 0) throw new Error(`Resource V2 backfill completed with ${backfill.errors.length} errors`);
    if (mode === 'write' && (reconciliation.resources_missing_attribution > 0 || reconciliation.resources_missing_version > 0 || reconciliation.resources_missing_file > 0)) {
      throw new Error('Resource V2 reconciliation failed; do not enable V2 traffic');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
