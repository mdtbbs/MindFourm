import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  backfillResourceVersionStructure, emptyResourceV2StructureResult, ResourceV2StructureResult,
} from './resource-v2-structure.backfill';

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
  owner_members_created: number;
  owner_members_skipped: number;
  owner_warnings: Array<{ resource_id: number; warning: string }>;
  structure: ResourceV2StructureResult;
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
    owner_members_created: 0,
    owner_members_skipped: 0,
    owner_warnings: [],
    structure: emptyResourceV2StructureResult(),
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

  // The legacy resource owner becomes an active member on the aggregate. The
  // unique resource/user key and INSERT IGNORE make reruns safe.
  const ownerUserId = Number(resource.user_id);
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
    result.owner_warnings.push({ resource_id: resourceId, warning: 'missing_or_invalid_user_id' });
  } else {
    const existingOwner = await dataSource.query(
      `SELECT id FROM \`resource_members\` WHERE \`resource_id\` = ? AND \`user_id\` = ? AND \`role\` = 'owner' LIMIT 1`,
      [resourceId, ownerUserId],
    );
    if (existingOwner.length > 0) {
      result.owner_members_skipped++;
    } else if (mode === 'write') {
      const inserted = await dataSource.query(
        `INSERT IGNORE INTO \`resource_members\` (\`resource_id\`,\`user_id\`,\`role\`,\`status\`,\`accepted_at\`)
         VALUES (?, ?, 'owner', 'active', NOW(6))`,
        [resourceId, ownerUserId],
      );
      const packet = Array.isArray(inserted) && inserted.length === 1 ? inserted[0] : inserted;
      if (Number(packet?.affectedRows ?? packet?.affected ?? 1) > 0) result.owner_members_created++;
      else result.owner_members_skipped++;
    } else {
      result.owner_members_created++;
    }
  }

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
    const { deliveryMode, externalUrl, storageBackend, storageKey, providerFileId, availabilityStatus } = resolveFileDelivery(resource);

    if (mode === 'write') {
      await dataSource.query(
        `INSERT INTO \`resource_files\`
          (\`public_id\`, \`resource_version_id\`, \`role\`, \`delivery_mode\`,
           \`original_filename\`, \`mime_type\`, \`size_bytes\`,
           \`integrity_status\`, \`storage_backend\`, \`storage_key\`, \`provider_file_id\`, \`external_url\`,
           \`availability_status\`, \`sort_order\`, \`created_at\`)
         VALUES (?, ?, 'primary', ?, ?, ?, ?, 'unverified_legacy', ?, ?, ?, ?, ?, 0, NOW())`,
        [
          randomUUID(),
          versionId,
          deliveryMode,
          resource.file_name || null,
          resource.mime_type || null,
          resource.file_size || null,
          storageBackend,
          storageKey,
          providerFileId,
          externalUrl,
          availabilityStatus,
        ],
      );
    }
    result.files_created++;
  }

  // Map and schematic renderer data belongs to the release file/version. Move
  // the legacy JSON into version-level rows without creating another Resource.
  const structure = await backfillResourceVersionStructure(dataSource, resource, versionId, mode);
  for (const key of Object.keys(result.structure) as Array<keyof ResourceV2StructureResult>) {
    result.structure[key] += structure[key];
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
  storageBackend: string | null;
  storageKey: string | null;
  providerFileId: number | null;
  availabilityStatus: string;
} {
  if (resource.resource_type === 'external') {
    const url = resource.external_url || '';
    const isValid = url.startsWith('http://') || url.startsWith('https://');
    return {
      deliveryMode: 'external',
      externalUrl: url || null,
      storageBackend: null,
      storageKey: null,
      providerFileId: null,
      availabilityStatus: isValid ? 'available' : 'unavailable',
    };
  }

  if (resource.use_mfl === 1 || resource.use_mfl === true) {
    return {
      deliveryMode: 'mfl',
      externalUrl: null,
      storageBackend: 'mfl',
      storageKey: resource.mfl_download_url || null,
      providerFileId: resource.mfl_file_id || null,
      availabilityStatus: resource.mfl_file_id ? 'available' : 'unavailable',
    };
  }

  // Local upload
  return {
    deliveryMode: 'managed',
    externalUrl: null,
    storageBackend: 'local',
    storageKey: resource.file_path || null,
    providerFileId: null,
    availabilityStatus: resource.file_path ? 'available' : 'unavailable',
  };
}
