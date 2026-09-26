import AppDataSource from '../database/data-source';
import { groupResourceFingerprints, ResourceFingerprintRow } from './resource-duplicate-report.util';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.query(`
      SELECT id, public_id, title, status, content_hash, structure_hash, normalized_structure_hash
      FROM resources
      WHERE deleted_at IS NULL
        AND (merged_into_resource_id IS NULL)
        AND status IN ('pending', 'pending_review', 'approved', 'published')
      ORDER BY id ASC
    `) as ResourceFingerprintRow[];

    const contentHashRows = await AppDataSource.query(`
      SELECT r.id, r.id AS resource_id, r.public_id, r.title, r.status,
        r.content_hash, NULL AS structure_hash, NULL AS normalized_structure_hash
      FROM resources r
      WHERE r.deleted_at IS NULL AND r.merged_into_resource_id IS NULL
        AND r.status IN ('pending', 'pending_review', 'approved', 'published')
        AND r.content_hash REGEXP '^[A-Fa-f0-9]{64}$'
      UNION ALL
      SELECT r.id, r.id AS resource_id, r.public_id, r.title, r.status,
        rv.content_hash, NULL AS structure_hash, NULL AS normalized_structure_hash
      FROM resource_versions rv
      INNER JOIN resources r ON r.id = rv.resource_id
      WHERE r.deleted_at IS NULL AND r.merged_into_resource_id IS NULL
        AND r.status IN ('pending', 'pending_review', 'approved', 'published')
        AND (rv.status IS NULL OR rv.status IN ('pending', 'pending_review', 'published'))
        AND rv.content_hash REGEXP '^[A-Fa-f0-9]{64}$'
      UNION ALL
      SELECT r.id, r.id AS resource_id, r.public_id, r.title, r.status,
        rf.content_hash, NULL AS structure_hash, NULL AS normalized_structure_hash
      FROM resource_files rf
      INNER JOIN resource_versions rv ON rv.id = rf.resource_version_id
      INNER JOIN resources r ON r.id = rv.resource_id
      WHERE rf.availability_status = 'available'
        AND r.deleted_at IS NULL AND r.merged_into_resource_id IS NULL
        AND r.status IN ('pending', 'pending_review', 'approved', 'published')
        AND (rv.status IS NULL OR rv.status IN ('pending', 'pending_review', 'published'))
        AND rf.content_hash REGEXP '^[A-Fa-f0-9]{64}$'
      ORDER BY resource_id ASC
    `) as ResourceFingerprintRow[];

    const exactFiles = groupResourceFingerprints(contentHashRows, 'content_hash');
    const exactStructures = groupResourceFingerprints(rows, 'structure_hash');
    const normalizedStructures = groupResourceFingerprints(rows, 'normalized_structure_hash');
    process.stdout.write(`${JSON.stringify({
      read_only: true,
      active_resource_count: rows.length,
      active_file_fingerprint_rows: contentHashRows.length,
      exact_file_duplicates: { group_count: exactFiles.length, groups: exactFiles },
      exact_structure_duplicates: { group_count: exactStructures.length, groups: exactStructures },
      normalized_structure_candidates: { group_count: normalizedStructures.length, groups: normalizedStructures },
    }, null, 2)}\n`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Resource duplicate report failed:', error);
  process.exitCode = 1;
});
