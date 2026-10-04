import {
  BadGatewayException, BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { ResourceStorageService } from '../resource-storage.service';
import { ResourceVersionService } from '../resource-versions.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  ResourceSourceSyncConfigDto, ResourceSourceSyncImportDto,
} from './resource-source-sync.dto';

const MAX_RELEASES = 30;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_GITHUB_JSON_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_TEXT = 50_000;
const MAX_RELEASE_NOTES = 20_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const API_BASE = 'https://api.github.com';
const GITHUB_ASSET_REDIRECT_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-production-release-asset-2e65be.s3.amazonaws.com',
]);

type ResourceRow = {
  id: number | string;
  user_id: number | string;
  public_id: string;
  resource_kind: string;
  status: string | null;
  is_public: number | string | boolean;
};

type SyncRow = {
  id: number | string;
  resource_id: number | string;
  provider: string;
  repository_url: string;
  enabled: number | string | boolean;
  stable_only: number | string | boolean;
  include_prerelease: number | string | boolean;
  asset_include_json: unknown;
  asset_exclude_json: unknown;
  last_polled_at: Date | string | null;
  last_status: string | null;
  last_error: string | null;
  upstream_tag: string | null;
};

type ScheduledSyncRow = SyncRow & {
  resource_public_id: string;
  resource_owner_user_id: number | string;
  resource_title: string;
  resource_kind: string;
};

type ExistingVersionRow = {
  version: string;
  content_hash: string | null;
  file_name: string | null;
};

type GithubRepository = { owner: string; repo: string; canonicalUrl: string };
type GithubAsset = { name: string; size: number; state: string; browser_download_url: string };
type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
  published_at: string | null;
  assets: GithubAsset[];
};

class GithubUpstreamError extends Error {
  constructor(readonly status: number | null, message = 'GitHub request failed', readonly manualReview = false) {
    super(message);
    this.name = 'GithubUpstreamError';
  }
}

class ScheduledSourceDisabledError extends Error {
  constructor() {
    super('Automatic GitHub source sync was disabled before import');
    this.name = 'ScheduledSourceDisabledError';
  }
}

@Injectable()
export class ResourceSourceSyncService {
  private readonly logger = new Logger(ResourceSourceSyncService.name);
  private scheduledPollRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ResourceStorageService,
    private readonly versions: ResourceVersionService,
    private readonly notifications: NotificationsService,
  ) {}

  async upsertGithubConfig(publicId: string, actorId: number, input: ResourceSourceSyncConfigDto) {
    const resource = await this.getResource(publicId);
    this.assertMod(resource);
    await this.assertOwnerOrMaintainer(resource, actorId);
    if (typeof input.enabled !== 'boolean') throw new BadRequestException('enabled must be a boolean');

    const repository = this.parseRepositoryUrl(input.repository_url);
    const stableOnly = input.stable_only ?? true;
    const includePrerelease = input.include_prerelease ?? false;
    if (stableOnly && includePrerelease) {
      throw new BadRequestException('stable_only and include_prerelease cannot both be true');
    }
    const include = this.normalizePatterns(input.asset_include, 'asset_include');
    const exclude = this.normalizePatterns(input.asset_exclude, 'asset_exclude');

    await this.dataSource.transaction(async (manager) => {
      // One active GitHub source per Resource. Keep older configurations as
      // disabled rows so a repository change is reversible and auditable.
      await manager.query(
        `UPDATE resource_source_syncs SET enabled = 0, updated_at = UTC_TIMESTAMP()
         WHERE resource_id = ? AND provider = 'github' AND repository_url <> ?`,
        [Number(resource.id), repository.canonicalUrl],
      );
      await manager.query(
        `INSERT INTO resource_source_syncs
          (resource_id, provider, repository_url, enabled, stable_only, include_prerelease,
           asset_include_json, asset_exclude_json, last_polled_at, last_status, last_error, upstream_tag)
         VALUES (?, 'github', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), stable_only = VALUES(stable_only),
           include_prerelease = VALUES(include_prerelease), asset_include_json = VALUES(asset_include_json),
           asset_exclude_json = VALUES(asset_exclude_json), last_status = NULL, last_error = NULL,
           upstream_tag = NULL, updated_at = UTC_TIMESTAMP()`,
        [
          Number(resource.id), repository.canonicalUrl, input.enabled ? 1 : 0, stableOnly ? 1 : 0,
          includePrerelease ? 1 : 0, include ? JSON.stringify(include) : null,
          exclude ? JSON.stringify(exclude) : null,
        ],
      );
    });

    return {
      resource_public_id: resource.public_id,
      provider: 'github',
      repository_url: repository.canonicalUrl,
      enabled: input.enabled,
      stable_only: stableOnly,
      include_prerelease: includePrerelease,
      asset_include: include,
      asset_exclude: exclude,
      polling: input.enabled ? 'scheduled' : 'manual',
    };
  }

  async listGithubReleases(publicId: string, limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RELEASES) {
      throw new BadRequestException(`limit must be between 1 and ${MAX_RELEASES}`);
    }
    const { resource, sync, repository } = await this.getPublicSync(publicId);
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const repoPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;

    try {
      // Fixed request count (four), one page, shared timeout and bounded body
      // sizes keep unauthenticated GitHub API usage predictable.
      const [rawReleases, repoInfo, readmeInfo, licenseInfo] = await Promise.all([
        this.githubJson(`${repoPath}/releases?per_page=${Math.min(limit, MAX_RELEASES)}&page=1`, signal),
        this.githubJson(repoPath, signal),
        this.githubJson(`${repoPath}/readme`, signal, true),
        this.githubJson(`${repoPath}/license`, signal, true),
      ]);
      if (!Array.isArray(rawReleases)) throw new GithubUpstreamError(null, 'Invalid release response');
      const releases = rawReleases
        .map((value) => this.normalizeRelease(value))
        .filter((release): release is GithubRelease => Boolean(release))
        .filter((release) => this.releaseAllowed(release, sync))
        .slice(0, limit)
        .map((release) => this.projectRelease(release, sync, repository));
      await this.updateSyncStatus(Number(sync.id), 'polled', null).catch(() => undefined);

      return {
        resource_public_id: resource.public_id,
        source: this.projectConfig(sync, repository),
        repository: this.projectRepository(repoInfo, readmeInfo, licenseInfo, repository),
        releases,
      };
    } catch (error) {
      await this.updateSyncStatus(Number(sync.id), 'error', 'GitHub release polling failed', null).catch(() => undefined);
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      throw new BadGatewayException('Unable to fetch GitHub release information');
    }
  }

  async importGithubRelease(
    publicId: string,
    actorId: number,
    input: ResourceSourceSyncImportDto,
    requireEnabled = false,
  ) {
    const { resource, sync, repository } = await this.getPrivateSync(publicId, actorId);
    const tagName = this.normalizeTag(input.tag_name);
    const assetName = this.normalizeAssetName(input.asset_name);
    if (!this.patternsAllow(sync, assetName)) throw new BadRequestException('The selected asset is excluded by the source filters');

    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const repoPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>> | undefined;
    let tempPath: string | undefined;
    try {
      const rawRelease = await this.githubJson(`${repoPath}/releases/tags/${encodeURIComponent(tagName)}`, signal);
      const release = this.normalizeRelease(rawRelease);
      if (!release || release.draft) throw new NotFoundException('Published GitHub release was not found');
      if (!this.releaseAllowed(release, sync)) throw new BadRequestException('This release channel is disabled by the source configuration');
      const matches = release.assets.filter((asset) => asset.name === assetName);
      if (matches.length > 1) throw new ConflictException('The release contains multiple assets with this name');
      const asset = matches[0];
      if (!asset || asset.state !== 'uploaded') throw new NotFoundException('Selected release asset was not found');
      if (!/\.(?:jar|zip)$/i.test(asset.name)) throw new BadRequestException('Mod imports only accept .jar or .zip assets');
      if (!Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_ASSET_BYTES) {
        throw new BadRequestException('GitHub asset exceeds the 50 MiB import limit');
      }
      const initialUrl = this.validateInitialAssetUrl(asset.browser_download_url, repository);
      const bytes = await this.downloadAsset(initialUrl, asset.size, signal);

      const extension = path.extname(asset.name).toLowerCase();
      tempPath = path.join(os.tmpdir(), `resource-github-${randomUUID()}${extension}`);
      await fs.writeFile(tempPath, bytes, { flag: 'wx', mode: 0o600 });
      const multerFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: asset.name,
        encoding: '7bit',
        mimetype: extension === '.jar' ? 'application/java-archive' : 'application/zip',
        destination: os.tmpdir(),
        filename: path.basename(tempPath),
        path: tempPath,
        size: bytes.length,
        stream: createReadStream(tempPath),
        buffer: undefined as unknown as Buffer,
      };
      await assertSafeUploadedFile(multerFile, MAX_ASSET_BYTES);
      storedFile = await this.storage.storeIncoming(multerFile);
      if (!storedFile) throw new BadRequestException('Downloaded GitHub asset could not be quarantined');
      tempPath = undefined; // storeIncoming owns/moves the temp file.

      // Manual imports remain available when automatic polling is disabled.
      // Scheduled imports re-read the persisted flag immediately before the
      // immutable version create so an owner can cancel an in-flight poll.
      if (requireEnabled) await this.assertScheduledSourceEnabled(Number(sync.id));

      const created = await this.versions.create({
        resource_id: Number(resource.id),
        version: tagName,
        version_mode: 'compatibility',
        release_channel: release.prerelease ? 'beta' : 'release',
        content: this.boundedReleaseNotes(release.body),
      }, storedFile, actorId);
      await this.updateSyncStatus(Number(sync.id), 'imported', null, tagName).catch(() => undefined);

      return {
        resource_public_id: resource.public_id,
        source: 'github',
        repository_url: repository.canonicalUrl,
        tag_name: tagName,
        asset_name: asset.name,
        version: {
          public_id: created.public_id,
          version: created.version,
          version_mode: created.version_mode,
          revision: created.revision,
          release_channel: created.release_channel,
          status: created.status,
          published_at: created.published_at || null,
        },
      };
    } catch (error) {
      if (storedFile?.file_path) await this.storage.removeManaged(storedFile.file_path).catch(() => undefined);
      if (!(error instanceof ScheduledSourceDisabledError)) {
        await this.updateSyncStatus(Number(sync.id), 'import_failed', 'GitHub release import failed', null).catch(() => undefined);
      }
      if (error instanceof ScheduledSourceDisabledError) throw error;
      if (error instanceof BadRequestException || error instanceof ConflictException
        || error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      if (error instanceof GithubUpstreamError) throw new BadGatewayException('Unable to retrieve the selected GitHub release asset');
      throw error;
    } finally {
      if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
    }
  }

  @Cron('0 */15 * * * *')
  async pollEnabledGithubSources(): Promise<void> {
    if (this.scheduledPollRunning) return;
    this.scheduledPollRunning = true;
    try {
      const due = await this.dataSource.query(
        `SELECT ss.id, ss.resource_id, ss.provider, ss.repository_url, ss.enabled, ss.stable_only,
                ss.include_prerelease, ss.asset_include_json, ss.asset_exclude_json, ss.last_polled_at,
                ss.last_status, ss.last_error, ss.upstream_tag,
                r.public_id AS resource_public_id, r.user_id AS resource_owner_user_id,
                r.title AS resource_title, r.resource_kind AS resource_kind
         FROM resource_source_syncs ss JOIN resources r ON r.id = ss.resource_id
         WHERE ss.provider = 'github' AND ss.enabled = 1 AND r.resource_kind = 'mod' AND r.deleted_at IS NULL
           AND (ss.last_polled_at IS NULL OR ss.last_polled_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
         ORDER BY ss.last_polled_at ASC, ss.id ASC LIMIT 25`,
      ) as ScheduledSyncRow[];

      for (const row of due) {
        if (!await this.claimScheduledSync(Number(row.id))) continue;
        try {
          await this.processScheduledSource(row);
        } catch (error) {
          const status = error instanceof GithubUpstreamError && error.status ? ` (HTTP ${error.status})` : '';
          this.logger.warn(`Scheduled GitHub sync failed for source ${row.id}${status}`);
          await this.updateSyncStatus(Number(row.id), 'error', `GitHub automatic polling failed${status}`, null).catch(() => undefined);
        }
      }
    } catch {
      this.logger.warn('Scheduled GitHub sync scan failed; the next interval will retry.');
    } finally {
      this.scheduledPollRunning = false;
    }
  }

  private async claimScheduledSync(syncId: number): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id FROM resource_source_syncs
         WHERE id = ? AND provider = 'github' AND enabled = 1
           AND (last_polled_at IS NULL OR last_polled_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
         FOR UPDATE`,
        [syncId],
      );
      if (!rows.length) return false;
      await manager.query(
        `UPDATE resource_source_syncs SET last_polled_at = UTC_TIMESTAMP(), last_status = 'polling',
         last_error = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
        [syncId],
      );
      return true;
    });
  }

  private async processScheduledSource(row: ScheduledSyncRow): Promise<void> {
    const repository = this.parseRepositoryUrl(row.repository_url);
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const repoPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
    const rawReleases = await this.githubJson(`${repoPath}/releases?per_page=${MAX_RELEASES}&page=1`, signal);
    if (!Array.isArray(rawReleases)) throw new GithubUpstreamError(null, 'Invalid release response');
    const releases = rawReleases
      .map((value) => this.normalizeRelease(value))
      .filter((release): release is GithubRelease => Boolean(release))
      .filter((release) => this.releaseAllowed(release, row));
    if (!releases.length) {
      await this.updateSyncStatus(Number(row.id), 'up_to_date', null, null);
      return;
    }

    let baselineTag = row.upstream_tag?.trim() || null;
    let baselineVersion: ExistingVersionRow | null = null;
    if (baselineTag) {
      baselineVersion = await this.getVersionForTag(Number(row.resource_id), baselineTag);
      if (!baselineVersion) {
        await this.stopForManualConfirmation(row, baselineTag, 'The remembered upstream tag has no matching local version.');
        return;
      }
    }

    let baselineRelease: GithubRelease | null = null;
    if (baselineTag && baselineVersion) {
      baselineRelease = releases.find((release) => release.tag_name === baselineTag) || null;
      if (!baselineRelease) {
        const rawBaseline = await this.githubJson(`${repoPath}/releases/tags/${encodeURIComponent(baselineTag)}`, signal, true);
        baselineRelease = this.normalizeRelease(rawBaseline);
      }
      if (!baselineRelease || !this.releaseAllowed(baselineRelease, row)) {
        await this.stopForManualConfirmation(row, baselineTag, 'The imported release is missing or no longer matches the channel filters.');
        return;
      }
      const baselineAssets = this.scheduledAssetCandidates(baselineRelease, row);
      if (baselineAssets.length !== 1) {
        await this.stopForManualConfirmation(row, baselineTag, 'The imported release no longer has exactly one asset selected by the configured filters.');
        return;
      }
      let remoteHash: string;
      try {
        const bytes = await this.downloadScheduledAsset(baselineAssets[0], repository, signal);
        remoteHash = createHash('sha256').update(bytes).digest('hex');
      } catch (error) {
        if (error instanceof GithubUpstreamError && !error.manualReview) throw error;
        await this.stopForManualConfirmation(row, baselineTag, 'The imported release asset can no longer be verified safely.');
        return;
      }
      if (!baselineVersion.content_hash || remoteHash !== baselineVersion.content_hash.toLowerCase()) {
        await this.stopForManualConfirmation(row, baselineTag, 'The upstream asset changed after import. Manual review is required before importing it again.');
        return;
      }
      if (!row.upstream_tag) row.upstream_tag = baselineTag;
    }

    let pendingReleases: GithubRelease[];
    if (!baselineTag) {
      // First opt-in imports only the newest matching release; it does not
      // silently backfill a repository's entire historical release list.
      pendingReleases = releases;
    } else {
      const baselineIndex = releases.findIndex((release) => release.tag_name === baselineTag);
      if (baselineIndex >= 0) {
        // GitHub returns releases newest-first. Import one release per interval,
        // oldest-to-newest, so latest_published_version_id stays monotonic.
        pendingReleases = releases.slice(0, baselineIndex).reverse();
      } else {
        const baselineTime = Date.parse(baselineRelease?.published_at || '');
        if (!Number.isFinite(baselineTime)) {
          await this.stopForManualConfirmation(row, baselineTag, 'The baseline release is outside the current page and has no usable timestamp.');
          return;
        }
        pendingReleases = releases
          .filter((release) => Date.parse(release.published_at || '') > baselineTime)
          .sort((left, right) => Date.parse(left.published_at || '') - Date.parse(right.published_at || ''));
      }
    }

    let nextRelease: GithubRelease | null = null;
    let selectedAssets: GithubAsset[] = [];
    for (const release of pendingReleases) {
      const matching = this.scheduledAssetCandidates(release, row);
      if (!matching.length) continue;
      nextRelease = release;
      selectedAssets = matching;
      break;
    }
    if (!nextRelease) {
      await this.updateSyncStatus(Number(row.id), 'up_to_date', null, baselineTag);
      return;
    }
    if (selectedAssets.length !== 1) {
      await this.stopForManualConfirmation(row, nextRelease.tag_name, 'More than one release asset matches the configured filters.');
      return;
    }

    const existing = await this.getVersionForTag(Number(row.resource_id), nextRelease.tag_name);
    if (existing) {
      let remoteHash: string;
      try {
        const bytes = await this.downloadScheduledAsset(selectedAssets[0], repository, signal);
        remoteHash = createHash('sha256').update(bytes).digest('hex');
      } catch (error) {
        if (error instanceof GithubUpstreamError && !error.manualReview) throw error;
        await this.stopForManualConfirmation(row, nextRelease.tag_name, 'An existing release asset can no longer be verified safely.');
        return;
      }
      if (!existing.content_hash || remoteHash !== existing.content_hash.toLowerCase()) {
        await this.stopForManualConfirmation(row, nextRelease.tag_name, 'An existing version tag now points to changed asset content. Manual review is required.');
        return;
      }
      await this.updateSyncStatus(Number(row.id), 'up_to_date', null, nextRelease.tag_name);
      return;
    }

    const asset = selectedAssets[0];
    try {
      await this.importGithubRelease(row.resource_public_id, Number(row.resource_owner_user_id), {
        tag_name: nextRelease.tag_name,
        asset_name: asset.name,
      }, true);
    } catch (error) {
      if (error instanceof ScheduledSourceDisabledError) return;
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        await this.stopForManualConfirmation(row, nextRelease.tag_name, 'Automatic import was rejected by duplicate or archive safety checks.');
        return;
      }
      throw error;
    }
  }

  private scheduledAssetCandidates(release: GithubRelease, sync: SyncRow): GithubAsset[] {
    return release.assets.filter((asset) => this.patternsAllow(sync, asset.name) && /\.(?:jar|zip)$/i.test(asset.name));
  }

  private async downloadScheduledAsset(asset: GithubAsset, repository: GithubRepository, signal: AbortSignal): Promise<Buffer> {
    if (asset.state !== 'uploaded') throw new GithubUpstreamError(null, 'Selected asset is not uploaded', true);
    if (!Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_ASSET_BYTES) {
      throw new GithubUpstreamError(null, 'Selected asset size is outside the import limit', true);
    }
    const url = this.validateInitialAssetUrl(asset.browser_download_url, repository);
    return this.downloadAsset(url, asset.size, signal);
  }

  private async getVersionForTag(resourceId: number, tag: string): Promise<ExistingVersionRow | null> {
    const rows = await this.dataSource.query(
      `SELECT version, content_hash, file_name FROM resource_versions
       WHERE resource_id = ? AND version = ? ORDER BY revision DESC, id DESC LIMIT 1`,
      [resourceId, tag],
    ) as ExistingVersionRow[];
    return rows[0] || null;
  }

  private async assertScheduledSourceEnabled(syncId: number): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT enabled FROM resource_source_syncs WHERE id = ? AND provider = 'github' LIMIT 1`,
      [syncId],
    ) as Array<{ enabled: number | string | boolean }>;
    if (!rows[0] || !this.asBoolean(rows[0].enabled)) throw new ScheduledSourceDisabledError();
  }

  private async stopForManualConfirmation(row: ScheduledSyncRow, tag: string, reason: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE resource_source_syncs SET enabled = 0, last_polled_at = UTC_TIMESTAMP(),
       last_status = 'manual_confirmation', last_error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [reason.slice(0, 500), Number(row.id)],
    );
    const tagForMessage = tag.replace(/[<>`\r\n]/g, '').slice(0, 100);
    const content = `自动 GitHub Release 同步已暂停，需要人工确认。仓库：${row.repository_url}；标签：${tagForMessage}。原因：${reason}`;
    const dedupeSuffix = createHash('sha256').update(`${row.id}:${tag}:${reason}`).digest('hex').slice(0, 36);
    try {
      await this.notifications.create({
        user_id: Number(row.resource_owner_user_id),
        type: 'system',
        content,
        emailEvent: 'system',
        deduplicationKey: `resource-source-sync-manual:${row.id}:${dedupeSuffix}`,
      });
    } catch {
      this.logger.warn(`Could not notify owner for GitHub source ${row.id}; automation remains paused.`);
    }
  }

  private async getResource(publicId: string): Promise<ResourceRow> {
    this.assertUuid(publicId, 'Resource');
    const rows = await this.dataSource.query(
      `SELECT id, user_id, public_id, resource_kind, status, is_public
       FROM resources WHERE public_id = ? AND deleted_at IS NULL LIMIT 1`,
      [publicId],
    ) as ResourceRow[];
    if (!rows[0]) throw new NotFoundException('Resource does not exist');
    return rows[0];
  }

  private assertMod(resource: ResourceRow): void {
    if (resource.resource_kind !== 'mod') throw new BadRequestException('GitHub Release Sync is only available for Mod resources');
  }

  private async assertOwnerOrMaintainer(resource: ResourceRow, actorId: number): Promise<void> {
    if (Number(resource.user_id) === actorId) return;
    const rows = await this.dataSource.query(
      `SELECT role FROM resource_members
       WHERE resource_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner', 'maintainer') LIMIT 1`,
      [Number(resource.id), actorId],
    ) as Array<{ role: string }>;
    if (!rows.length) throw new ForbiddenException('Only an active Resource owner or maintainer can manage GitHub sync');
  }

  private async getSync(resourceId: number): Promise<SyncRow> {
    const rows = await this.dataSource.query(
      `SELECT id, resource_id, provider, repository_url, enabled, stable_only, include_prerelease,
              asset_include_json, asset_exclude_json, last_polled_at, last_status, last_error, upstream_tag
       FROM resource_source_syncs WHERE resource_id = ? AND provider = 'github'
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [resourceId],
    ) as SyncRow[];
    if (!rows[0]) throw new NotFoundException('GitHub source is not configured');
    return rows[0];
  }

  private async getPublicSync(publicId: string): Promise<{ resource: ResourceRow; sync: SyncRow; repository: GithubRepository }> {
    const resource = await this.getResource(publicId);
    this.assertMod(resource);
    if (!this.isPublicResource(resource)) throw new NotFoundException('Public Resource does not exist');
    const sync = await this.getSync(Number(resource.id));
    return { resource, sync, repository: this.parseRepositoryUrl(sync.repository_url) };
  }

  private async getPrivateSync(publicId: string, actorId: number): Promise<{ resource: ResourceRow; sync: SyncRow; repository: GithubRepository }> {
    const resource = await this.getResource(publicId);
    this.assertMod(resource);
    await this.assertOwnerOrMaintainer(resource, actorId);
    const sync = await this.getSync(Number(resource.id));
    return { resource, sync, repository: this.parseRepositoryUrl(sync.repository_url) };
  }

  private isPublicResource(resource: ResourceRow): boolean {
    return this.asBoolean(resource.is_public) && ['approved', 'published'].includes(resource.status || '');
  }

  private projectConfig(sync: SyncRow, repository: GithubRepository) {
    return {
      provider: 'github',
      repository_url: repository.canonicalUrl,
      enabled: this.asBoolean(sync.enabled),
      stable_only: this.asBoolean(sync.stable_only),
      include_prerelease: this.asBoolean(sync.include_prerelease),
      asset_include: this.readPatterns(sync.asset_include_json),
      asset_exclude: this.readPatterns(sync.asset_exclude_json),
      last_polled_at: sync.last_polled_at || null,
      last_status: sync.last_status || null,
      upstream_tag: sync.upstream_tag || null,
    };
  }

  private projectRepository(repoInfo: unknown, readmeInfo: unknown, licenseInfo: unknown, repository: GithubRepository) {
    const repo = this.asRecord(repoInfo) || {};
    const readme = this.asRecord(readmeInfo);
    const licenseFile = this.asRecord(licenseInfo);
    const licenseMeta = this.asRecord(repo.license);
    const readmeText = this.decodeGithubText(readme);
    const licenseText = this.decodeGithubText(licenseFile);
    return {
      canonical_url: repository.canonicalUrl,
      full_name: this.safeText(repo.full_name, 255),
      description: this.safeText(repo.description, 2_000),
      default_branch: this.safeText(repo.default_branch, 255),
      readme: {
        available: Boolean(readme),
        content: readmeText?.content ?? null,
        truncated: readmeText?.truncated ?? false,
      },
      license: {
        available: Boolean(licenseMeta || licenseFile),
        key: this.safeText(licenseMeta?.key, 100),
        name: this.safeText(licenseMeta?.name || licenseFile?.name, 255),
        spdx_id: this.safeText(licenseMeta?.spdx_id, 100),
        content: licenseText?.content ?? null,
        truncated: licenseText?.truncated ?? false,
      },
    };
  }

  private normalizeRelease(value: unknown): GithubRelease | null {
    const release = this.asRecord(value);
    if (!release || typeof release.tag_name !== 'string' || !release.tag_name.trim() || release.tag_name.length > 191) return null;
    const rawAssets = Array.isArray(release.assets) ? release.assets.slice(0, 200) : [];
    const assets = rawAssets.map((value) => {
      const asset = this.asRecord(value);
      if (!asset || typeof asset.name !== 'string' || asset.name.length < 1 || asset.name.length > 255) return null;
      return {
        name: asset.name,
        size: Number(asset.size),
        state: typeof asset.state === 'string' ? asset.state : '',
        browser_download_url: typeof asset.browser_download_url === 'string' ? asset.browser_download_url : '',
      };
    }).filter((asset): asset is GithubAsset => Boolean(asset));
    return {
      tag_name: release.tag_name,
      name: typeof release.name === 'string' ? release.name.slice(0, 255) : null,
      body: typeof release.body === 'string' ? release.body.slice(0, MAX_RELEASE_NOTES + 1) : null,
      prerelease: release.prerelease === true,
      draft: release.draft === true,
      published_at: typeof release.published_at === 'string' ? release.published_at.slice(0, 40) : null,
      assets,
    };
  }

  private projectRelease(release: GithubRelease, sync: SyncRow, repository: GithubRepository) {
    return {
      tag_name: release.tag_name,
      name: release.name,
      body: release.body,
      prerelease: release.prerelease,
      published_at: release.published_at,
      assets: release.assets
        .filter((asset) => this.patternsAllow(sync, asset.name))
        .slice(0, 200)
        .map((asset) => {
          let downloadUrl: string | null = null;
          try { downloadUrl = this.validateInitialAssetUrl(asset.browser_download_url, repository).toString(); } catch { /* keep non-importable metadata only */ }
          return {
            name: asset.name,
            size_bytes: Number.isSafeInteger(asset.size) && asset.size >= 0 ? asset.size : null,
            content_type: null,
            download_url: downloadUrl,
            importable: Boolean(downloadUrl && asset.state === 'uploaded'
              && /\.(?:jar|zip)$/i.test(asset.name) && Number.isSafeInteger(asset.size)
              && asset.size > 0 && asset.size <= MAX_ASSET_BYTES),
          };
        }),
    };
  }

  private releaseAllowed(release: GithubRelease, sync: SyncRow): boolean {
    if (release.draft) return false;
    if (!release.prerelease) return true;
    return !this.asBoolean(sync.stable_only) && this.asBoolean(sync.include_prerelease);
  }

  private async githubJson(pathOrUrl: string, signal: AbortSignal, notFoundAllowed = false): Promise<unknown> {
    const url = new URL(pathOrUrl.startsWith('https://') ? pathOrUrl : `${API_BASE}${pathOrUrl}`);
    if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.port || url.username || url.password) {
      throw new GithubUpstreamError(null, 'Unsafe GitHub API URL');
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal,
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MindFourm-ResourceCenter' },
      });
    } catch {
      throw new GithubUpstreamError(null, 'GitHub API request failed');
    }
    if (notFoundAllowed && response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new GithubUpstreamError(response.status);
    }
    let bytes: Buffer;
    try { bytes = await this.readBoundedBody(response, MAX_GITHUB_JSON_BYTES); }
    catch { throw new GithubUpstreamError(response.status, 'GitHub API response exceeded bounds'); }
    try { return JSON.parse(bytes.toString('utf8')) as unknown; }
    catch { throw new GithubUpstreamError(response.status, 'GitHub API returned malformed JSON'); }
  }

  private async downloadAsset(initialUrl: URL, expectedSize: number, signal: AbortSignal): Promise<Buffer> {
    let current = initialUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let response: Response;
      try {
        response = await fetch(current, {
          method: 'GET', redirect: 'manual', signal,
          headers: { Accept: 'application/octet-stream', 'User-Agent': 'MindFourm-ResourceCenter' },
        });
      } catch {
        throw new GithubUpstreamError(null, 'GitHub asset request failed');
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location || redirects >= MAX_REDIRECTS) throw new GithubUpstreamError(response.status, 'Too many or invalid asset redirects', true);
        let next: URL;
        try { next = new URL(location, current); }
        catch { throw new GithubUpstreamError(response.status, 'Invalid asset redirect', true); }
        this.validateRedirectUrl(next);
        current = next;
        continue;
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw new GithubUpstreamError(response.status, 'GitHub asset download failed', [403, 404, 410].includes(response.status));
      }
      let bytes: Buffer;
      try { bytes = await this.readBoundedBody(response, MAX_ASSET_BYTES); }
      catch { throw new GithubUpstreamError(response.status, 'GitHub asset exceeded the download limit', true); }
      if (bytes.length !== expectedSize) throw new GithubUpstreamError(response.status, 'GitHub asset size did not match release metadata', true);
      return bytes;
    }
    throw new GithubUpstreamError(null, 'Too many asset redirects', true);
  }

  private async readBoundedBody(response: Response, maximumBytes: number): Promise<Buffer> {
    const contentLength = response.headers.get('content-length');
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Body too large');
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > maximumBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error('Body too large');
        }
        chunks.push(Buffer.from(next.value));
      }
      return Buffer.concat(chunks, total);
    } finally {
      reader.releaseLock();
    }
  }

  private validateInitialAssetUrl(raw: string, repository: GithubRepository): URL {
    let url: URL;
    try { url = new URL(raw); }
    catch { throw new BadRequestException('GitHub release asset URL is invalid'); }
    const prefix = `/${repository.owner}/${repository.repo}/releases/download/`;
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port
      || url.username || url.password || url.search || url.hash || !url.pathname.toLowerCase().startsWith(prefix.toLowerCase())
      || /%(?:2f|5c)/i.test(url.pathname) || url.pathname.length <= prefix.length) {
      throw new BadRequestException('GitHub release asset URL is not a canonical GitHub download URL');
    }
    return url;
  }

  private validateRedirectUrl(url: URL): void {
    if (url.protocol !== 'https:' || !GITHUB_ASSET_REDIRECT_HOSTS.has(url.hostname.toLowerCase())
      || url.port || url.username || url.password || url.hash || /%(?:0d|0a)/i.test(url.href)) {
      throw new GithubUpstreamError(null, 'GitHub asset redirected to an unsafe URL', true);
    }
  }

  private parseRepositoryUrl(value: string): GithubRepository {
    if (typeof value !== 'string' || value.length > 500 || /[%\\\u0000-\u001f]/.test(value)) {
      throw new BadRequestException('repository_url must be a canonical github.com owner/repository URL');
    }
    let url: URL;
    try { url = new URL(value); }
    catch { throw new BadRequestException('repository_url must be a canonical github.com owner/repository URL'); }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port
      || url.username || url.password || url.search || url.hash) {
      throw new BadRequestException('Only HTTPS github.com repository URLs are supported');
    }
    const match = url.pathname.match(/^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/);
    if (!match || match[2] === '.' || match[2] === '..' || match[2].includes('..')) {
      throw new BadRequestException('repository_url must contain exactly one GitHub owner and repository');
    }
    const owner = match[1].toLowerCase();
    const repo = match[2].replace(/\.git$/i, '').toLowerCase();
    if (!repo || repo === '.' || repo === '..') throw new BadRequestException('GitHub repository name is invalid');
    return { owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}` };
  }

  private normalizePatterns(input: string[] | undefined, fieldName: string): string[] | null {
    if (input === undefined) return null;
    if (!Array.isArray(input) || input.length > 50) throw new BadRequestException(`${fieldName} must contain at most 50 patterns`);
    const values = input.map((pattern) => {
      if (typeof pattern !== 'string' || pattern.length < 1 || pattern.length > 255
        || /[\/\\\u0000-\u001f]/.test(pattern)) {
        throw new BadRequestException(`${fieldName} contains an invalid filename pattern`);
      }
      return pattern.trim();
    });
    if (values.some((pattern) => !pattern)) throw new BadRequestException(`${fieldName} cannot contain empty patterns`);
    return [...new Set(values)];
  }

  private normalizeTag(value: string): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 50 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new BadRequestException('tag_name must be a printable string up to 50 characters');
    }
    return value.trim();
  }

  private normalizeAssetName(value: string): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\/\\\u0000-\u001f\u007f]/.test(value)) {
      throw new BadRequestException('asset_name must be a single safe filename');
    }
    return value.trim();
  }

  private patternsAllow(sync: SyncRow, assetName: string): boolean {
    const include = this.readPatterns(sync.asset_include_json);
    const exclude = this.readPatterns(sync.asset_exclude_json);
    if (include.length && !include.some((pattern) => this.globMatches(pattern, assetName))) return false;
    return !exclude.some((pattern) => this.globMatches(pattern, assetName));
  }

  private globMatches(pattern: string, value: string): boolean {
    let source = '^';
    for (const character of pattern) {
      if (character === '*') source += '.*';
      else if (character === '?') source += '.';
      else source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
    try { return new RegExp(`${source}$`, 'i').test(value); }
    catch { return false; }
  }

  private readPatterns(value: unknown): string[] {
    let parsed = value;
    if (typeof value === 'string') {
      try { parsed = JSON.parse(value) as unknown; } catch { return []; }
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0 && entry.length <= 255).slice(0, 50);
  }

  private boundedReleaseNotes(value: string | null): string | undefined {
    if (!value?.trim()) return undefined;
    if (value.length <= MAX_RELEASE_NOTES) return value;
    return `${value.slice(0, MAX_RELEASE_NOTES - 34)}\n\n[Release notes truncated]`;
  }

  private decodeGithubText(value: Record<string, unknown> | null): { content: string; truncated: boolean } | null {
    if (!value || typeof value.content !== 'string' || value.content.length > MAX_GITHUB_JSON_BYTES) return null;
    const encoding = value.encoding;
    let content: string;
    if (encoding === 'base64') {
      const encoded = value.content.replace(/\s+/g, '');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
      content = Buffer.from(encoded, 'base64').toString('utf8');
    } else if (encoding === 'utf-8' || encoding === 'utf8') {
      content = value.content;
    } else {
      return null;
    }
    const apiTruncated = value.truncated === true;
    return { content: content.slice(0, MAX_PREVIEW_TEXT), truncated: apiTruncated || content.length > MAX_PREVIEW_TEXT };
  }

  private safeText(value: unknown, maximum: number): string | null {
    return typeof value === 'string' ? value.slice(0, maximum) : null;
  }

  private asRecord(value: unknown): Record<string, any> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
  }

  private asBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
  }

  private assertUuid(value: string, label: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException(`${label} public ID must be a UUID`);
    }
  }

  private async updateSyncStatus(syncId: number, status: string, error: string | null, tag: string | null = null): Promise<void> {
    await this.dataSource.query(
      `UPDATE resource_source_syncs SET last_polled_at = UTC_TIMESTAMP(), last_status = ?, last_error = ?,
       upstream_tag = COALESCE(?, upstream_tag), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [status, error, tag, syncId],
    );
  }
}
