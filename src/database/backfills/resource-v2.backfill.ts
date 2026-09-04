import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

/**
 * Legacy Resource → structured aggregate backfill.
 *
 * Reads each non-deleted resource and deterministically creates:
 * - ResourceAttribution (submitter)
 * - ResourceVersion (legacy root release)
 * - ResourceFile (primary file)
 *
 * Idempotent: checks for existing records before inserting.
 */

export type BackfillMode = 'dry-run' | 'write';

export type BackfillResult = {
  resources_scanned: number;
  attributions_created: number;
  attributions_skipped: number;
  versions_created: number;
  versions_skipped: number;
  files_created: number;
  files_skipped: number;
  errors: Array<{ resource_id: number; message: string }>;
};

export async function runResourceV2Backfill(
  dataSource: DataSource,
  mode: BackfillMode,
): Promise<BackfillResult> {
  const result: BackfillResult = {
    resources_scanned: 0,
    attributions_created: 0,
    attributions_skipped: 0,
    versions_created: 0,
    versions_skipped: 0,
    files_created: 0,
    files_skipped: 0,
    errors: [],
  };

  // Fetch all non-deleted resources
  const resources = await dataSource.query(
    `SELECT * FROM \`resources\` WHERE \`deleted_at\` IS NULL ORDER BY \`id\` ASC`,
  );

  result.resources_scanned = resources.length;

  for (const resource of resources) {
    try {
      await backfillOneResource(dataSource, mode, resource, result);
    } catch (error) {
      result.errors.push({
        resource_id: resource.id,
        message: (error as Error).message,
      });
    }
  }

  return result;
}

async function backfillOneResource(
  dataSource: DataSource,
  mode: BackfillMode,
  resource: Record<string, any>,
  result: BackfillResult,
): Promise<void> {
  const resourceId = resource.id;

  // --- Step 1: Create or find the legacy root release version ---
  const existingVersion = await dataSource.query(
    `SELECT * FROM \`resource_versions\` WHERE \`resource_id\` = ? AND \`is_legacy_root_release\` = 1 LIMIT 1`,
    [resourceId],
  );

  let versionId: number;

  if (existingVersion.length > 0) {
    versionId = existingVersion[0].id;
    result.versions_skipped++;
  } else {
    const versionString = (resource.version || '').trim() || `legacy-${resourceId}`;

    if (mode === 'write') {
      const insertResult = await dataSource.query(
        `INSERT INTO \`resource_versions\`
          (\`resource_id\`, \`version\`, \`public_id\`, \`status\`, \`release_channel\`,
           \`is_legacy_root_release\`, \`created_at\`)
         VALUES (?, ?, ?, 'published', 'stable', 1, NOW())`,
        [resourceId, versionString, randomUUID()],
      );
      versionId = insertResult.insertId;
    } else {
      versionId = -1; // dry-run placeholder
    }
    result.versions_created++;
  }

  // --- Step 2: Create or find the submitter attribution ---
  const existingAttribution = await dataSource.query(
    `SELECT * FROM \`resource_attributions\` WHERE \`resource_id\` = ? AND \`role\` = 'submitter' LIMIT 1`,
    [resourceId],
  );

  if (existingAttribution.length > 0) {
    result.attributions_skipped++;
  } else {
    if (mode === 'write') {
      await dataSource.query(
        `INSERT INTO \`resource_attributions\`
          (\`resource_id\`, \`role\`, \`subject_type\`, \`user_id\`, \`sort_order\`, \`created_at\`)
         VALUES (?, 'submitter', 'local_user', ?, 0, NOW())`,
        [resourceId, resource.user_id],
      );
    }
    result.attributions_created++;
  }

  // --- Step 3: Create or find the primary file ---
  const existingFile = await dataSource.query(
    `SELECT * FROM \`resource_files\` WHERE \`resource_version_id\` = ? AND \`role\` = 'primary' LIMIT 1`,
    [versionId],
  );

  if (existingFile.length > 0) {
    result.files_skipped++;
  } else {
    const { deliveryMode, externalUrl, availabilityStatus } = resolveFileDelivery(resource);

    if (mode === 'write') {
      await dataSource.query(
        `INSERT INTO \`resource_files\`
          (\`public_id\`, \`resource_version_id\`, \`role\`, \`delivery_mode\`,
           \`original_filename\`, \`mime_type\`, \`size_bytes\`,
           \`integrity_status\`, \`storage_backend\`, \`external_url\`,
           \`availability_status\`, \`sort_order\`, \`created_at\`)
         VALUES (?, ?, 'primary', ?, ?, ?, ?, 'unverified_legacy', ?, ?, ?, 0, NOW())`,
        [
          randomUUID(),
          versionId,
          deliveryMode,
          resource.file_name || null,
          resource.mime_type || null,
          resource.file_size || null,
          resolveStorageBackend(deliveryMode),
          externalUrl,
          availabilityStatus,
        ],
      );
    }
    result.files_created++;
  }

  // --- Step 4: Update resource summary from description if empty ---
  if (resource.summary === null && resource.description && resource.description.trim()) {
    if (mode === 'write') {
      await dataSource.query(
        `UPDATE \`resources\` SET \`summary\` = ? WHERE \`id\` = ?`,
        [resource.description, resourceId],
      );
    }
  }

  // --- Step 5: Link latest_published_version_id if not set ---
  if (resource.latest_published_version_id === null && versionId > 0) {
    if (mode === 'write') {
      await dataSource.query(
        `UPDATE \`resources\` SET \`latest_published_version_id\` = ? WHERE \`id\` = ?`,
        [versionId, resourceId],
      );
    }
  }
}

function resolveFileDelivery(resource: Record<string, any>): {
  deliveryMode: string;
  externalUrl: string | null;
  availabilityStatus: string;
} {
  if (resource.resource_type === 'external') {
    const url = resource.external_url || '';
    const isValid = url.startsWith('http://') || url.startsWith('https://');
    return {
      deliveryMode: 'external',
      externalUrl: url || null,
      availabilityStatus: isValid ? 'available' : 'unavailable',
    };
  }

  if (resource.use_mfl === 1 || resource.use_mfl === true) {
    return {
      deliveryMode: 'mfl',
      externalUrl: resource.mfl_download_url || null,
      availabilityStatus: resource.mfl_file_id ? 'available' : 'unavailable',
    };
  }

  // Local upload
  return {
    deliveryMode: 'managed',
    externalUrl: null,
    availabilityStatus: resource.file_path ? 'available' : 'unavailable',
  };
}

function resolveStorageBackend(deliveryMode: string): string | null {
  switch (deliveryMode) {
    case 'managed': return 'local';
    case 'mfl': return 'mfl';
    case 'external': return null;
    default: return null;
  }
}
