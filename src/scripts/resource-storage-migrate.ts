import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ResourceFile } from '../entities/resource-file.entity';
import { Setting } from '../entities/setting.entity';
import { appConfig } from '../config/app.config';
import AppDataSource from '../database/data-source';
import { MflClientService } from '../modules/resources/mfl-client.service';
import { ResourceStorageClientService } from '../modules/resources/resource-storage-client.service';
import { ResourceStorageService } from '../modules/resources/resource-storage.service';

export type MigrationOptions = { dryRun: boolean; backend: 'managed' | 'mfl'; limit: number; resourceId?: number };
type Candidate = ResourceFile & {
  resource_status: string | null;
  version_status: string | null;
  resource_public?: number;
  resource_visibility?: string | null;
};

export function parseMigrationOptions(argv: string[]): MigrationOptions {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--(dry-run|backend|limit|resource-id)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}`);
    values.set(match[1], match[2] ?? 'true');
  }
  const backend = values.get('backend') || 'managed';
  const limit = Number(values.get('limit') || '100');
  const resourceId = values.has('resource-id') ? Number(values.get('resource-id')) : undefined;
  if (backend !== 'managed' && backend !== 'mfl') throw new Error('--backend must be managed or mfl');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('--limit must be 1..10000');
  if (resourceId !== undefined && (!Number.isSafeInteger(resourceId) || resourceId < 1)) throw new Error('--resource-id must be a positive integer');
  return { dryRun: values.has('dry-run'), backend, limit, resourceId };
}

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), async function* (source) {
    for await (const chunk of source) hash.update(chunk);
  });
  return hash.digest('hex');
}

async function acquireCandidate(
  file: ResourceFile,
  storage: ResourceStorageService,
  mfl: MflClientService,
): Promise<{ path: string; size: number; cleanup: () => Promise<void> }> {
  if (file.storage_backend === 'managed' || file.storage_backend === 'local') {
    if (!file.storage_key) throw new Error('managed storage_key missing');
    const local = await storage.statManagedFile(file.storage_key);
    return { path: local.path, size: local.size, cleanup: async () => undefined };
  }
  if (file.storage_backend !== 'mfl' || !file.provider_file_id) throw new Error('MFL file ID missing');
  const metadata = await mfl.getFileMetadata(file.provider_file_id);
  const url = mfl.getDownloadUrl(file.provider_file_id, metadata.file_path);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`MFL download failed (${response.status})`);
  const directory = await mkdtemp(join(tmpdir(), 'mindforum-res-migration-'));
  const path = join(directory, 'source');
  try {
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
    return { path, size: (await stat(path)).size, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function migrateOneResourceFile(
  db: DataSource,
  file: Candidate,
  client: ResourceStorageClientService,
  storage: ResourceStorageService,
  mfl: MflClientService,
  dryRun: boolean,
): Promise<'planned' | 'migrated' | 'skipped'> {
  if (!['managed', 'local', 'mfl'].includes(file.storage_backend || '')) return 'skipped';
  const acquired = await acquireCandidate(file, storage, mfl);
  try {
    const sha256 = await digest(acquired.path);
    if (file.content_hash && file.hash_algorithm === 'sha256' && file.content_hash.toLowerCase() !== sha256) {
      throw new Error('Existing SHA-256 does not match source bytes');
    }
    if (acquired.size < 1 || !Number.isSafeInteger(acquired.size)) throw new Error('Invalid source size');
    if (dryRun) return 'planned';
    const object = await client.uploadServerGeneratedObject({
      body: createReadStream(acquired.path), sizeBytes: acquired.size, sha256,
      mimeType: file.mime_type || 'application/octet-stream',
      filename: basename(file.original_filename || file.display_name || 'resource.bin'),
      purpose: 'resource_migration',
    });
    const confirmed = await client.getObject(object.public_id);
    if (confirmed.state !== 'verified' || confirmed.sha256 !== sha256 || confirmed.size_bytes !== acquired.size) {
      throw new Error('RES object verification failed');
    }
    let bindingId: string | undefined;
    let updated: boolean;
    try {
    updated = await db.transaction(async (manager) => {
      const current = await manager.findOne(ResourceFile, { where: { id: file.id }, lock: { mode: 'pessimistic_write' } });
      if (!current || current.storage_backend !== file.storage_backend) return false;
      const state = await manager.query(`SELECT r.status AS resource_status,r.is_public AS resource_public,r.visibility AS resource_visibility,v.status AS version_status
        FROM resource_versions v JOIN resources r ON r.id=v.resource_id
        WHERE v.id=? AND r.deleted_at IS NULL FOR UPDATE`, [current.resource_version_id]);
      if (!state[0]) return false;
      const visibility = ['approved', 'published'].includes(state[0].resource_status)
        && Number(state[0].resource_public) === 1
        && state[0].resource_visibility !== 'private'
        && state[0].version_status === 'published'
        && current.availability_status === 'available' ? 'public' : 'private';
      const binding = await client.createBinding(confirmed.public_id, {
        namespace: 'mindforum', owner_type: 'resource_file', owner_id: file.public_id, visibility,
      });
      bindingId = binding.id;
      current.storage_backend = 'res';
      current.provider_object_id = confirmed.public_id;
      current.provider_binding_id = binding.id;
      current.storage_key = `sha256:${sha256}`;
      current.content_hash = sha256;
      current.hash_algorithm = 'sha256';
      current.integrity_status = 'verified';
      current.size_bytes = acquired.size;
      current.mime_type = confirmed.mime_type;
      // Retain the historic provider_file_id for audit and rollback provenance.
      await manager.save(ResourceFile, current);
      return true;
    });
    } catch (error) {
      if (bindingId) await client.deleteBinding(confirmed.public_id, bindingId).catch(() => undefined);
      throw error;
    }
    return updated ? 'migrated' : 'skipped';
  } finally {
    await acquired.cleanup();
  }
}

export async function runResourceStorageMigration(
  db: DataSource, client: ResourceStorageClientService, storage: ResourceStorageService,
  mfl: MflClientService, options: MigrationOptions,
) {
  const query = db.getRepository(ResourceFile).createQueryBuilder('file')
    .innerJoin('file.resource_version', 'version')
    .innerJoin('version.resource', 'resource')
    .addSelect('resource.status', 'resource_status')
    .addSelect('version.status', 'version_status')
    .addSelect('resource.is_public', 'resource_public')
    .addSelect('resource.visibility', 'resource_visibility')
    .where('file.storage_backend IN (:...backends)', { backends: options.backend === 'managed' ? ['managed', 'local'] : ['mfl'] })
    .orderBy('file.id', 'ASC').take(options.limit);
  if (options.resourceId) query.andWhere('version.resource_id = :resourceId', { resourceId: options.resourceId });
  const rows = await query.getRawAndEntities();
  const results = { scanned: rows.entities.length, planned: 0, migrated: 0, skipped: 0, failed: 0, errors: [] as { file_id: number; error: string }[] };
  for (let i = 0; i < rows.entities.length; i++) {
    const file = Object.assign(rows.entities[i], {
      resource_status: rows.raw[i]?.resource_status ?? null,
      version_status: rows.raw[i]?.version_status ?? null,
      resource_public: Number(rows.raw[i]?.resource_public || 0),
      resource_visibility: rows.raw[i]?.resource_visibility ?? null,
    }) as Candidate;
    try { results[await migrateOneResourceFile(db, file, client, storage, mfl, options.dryRun)]++; }
    catch (error) {
      results.failed++;
      results.errors.push({ file_id: file.id, error: (error as Error).message });
    }
  }
  return results;
}

async function main(): Promise<void> {
  const options = parseMigrationOptions(process.argv.slice(2));
  const config = new ConfigService(appConfig());
  const client = new ResourceStorageClientService(config);
  const storage = new ResourceStorageService({ get: async (key: string) => (await AppDataSource.getRepository(Setting).findOne({ where: { key } }))?.value } as any);
  const mfl = new MflClientService(config);
  await AppDataSource.initialize();
  try {
    const result = await runResourceStorageMigration(AppDataSource, client, storage, mfl, options);
    process.stdout.write(`${JSON.stringify({ options, ...result }, null, 2)}\n`);
    if (result.failed) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
