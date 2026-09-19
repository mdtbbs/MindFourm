import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameVersion } from '@entities/game-version.entity';
import { GameVersionBuild } from '@entities/game-version-build.entity';
import { randomUUID } from 'crypto';
import { MindustryVersionValue } from '@common/versioning/mindustry-version-value';
import { MindustryVersionComparator } from '@common/versioning/mindustry-version-comparator';

type ManifestAsset = { platform?: string; download_url?: string; size?: number; sha256?: string | null };
type ManifestRelease = { tag?: string; channel?: string; published_at?: string | null; source_repository?: string | null; source_repositories?: string[]; assets?: ManifestAsset[] };
type Manifest = { schema_version?: number; games?: Array<{ id?: string; releases?: ManifestRelease[] }> };

/**
 * Imports only the explicit Mindustry manifest contract. It never scrapes an
 * HTML page or treats a resource release version as a game build. The caller
 * must configure GAME_VERSION_MANIFEST_URL; unavailable production manifests
 * leave existing version facts untouched.
 */
@Injectable()
export class MindustryManifestImportService {
  private readonly logger = new Logger(MindustryManifestImportService.name);

  constructor(
    @InjectRepository(GameVersion) private readonly versions: Repository<GameVersion>,
    @InjectRepository(GameVersionBuild) private readonly builds: Repository<GameVersionBuild>,
  ) {}

  async importConfiguredManifest(): Promise<number> {
    const url = process.env.GAME_VERSION_MANIFEST_URL;
    if (!url) return 0;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Game version manifest request failed: ${response.status}`);
    return this.importManifest(await response.json() as Manifest);
  }

  async importManifest(manifest: Manifest): Promise<number> {
    if (manifest.schema_version !== 1 || !Array.isArray(manifest.games)) {
      throw new Error('Unsupported Mindustry manifest schema');
    }
    const game = manifest.games.find((entry) => entry.id === 'mindustry');
    if (!game) return 0; // Classic is a separate game and must not share this table implicitly.
    let imported = 0;
    const latestByChannel = new Map<string, GameVersion>();
    for (const release of game.releases || []) {
      const build = this.parseBuild(release.tag);
      const channel = release.channel === 'prerelease' ? 'beta' : 'stable';
      if (!build) continue;
      const publishedAt = release.published_at ? new Date(release.published_at) : null;
      if (publishedAt && Number.isNaN(publishedAt.getTime())) continue;
      let version = await this.versions.findOne({ where: { build, channel } });
      version = await this.versions.save(Object.assign(version || this.versions.create(), {
        public_id: version?.public_id || randomUUID(),
        build, channel, version_value: build, game_series: channel,
        release_channel: channel, display_name: `v${build}`, released_at: publishedAt,
        is_official: release.source_repository === 'Anuken/Mindustry' || release.source_repositories?.includes('Anuken/Mindustry') || false,
        is_stable: channel === 'stable', is_latest: false,
      }));
      imported += 1;
      if (!latestByChannel.has(channel) || this.isNewer(version, latestByChannel.get(channel)!)) latestByChannel.set(channel, version);
      for (const asset of release.assets || []) await this.upsertBuild(version.id, asset);
    }
    for (const [channel, latest] of latestByChannel) {
      await this.versions.update({ channel }, { is_latest: false });
      await this.versions.update(latest.id, { is_latest: true });
    }
    return imported;
  }

  private parseBuild(tag?: string): string | null {
    const value = tag?.trim().replace(/^v/i, '') || '';
    return MindustryVersionValue.parse(value)?.toString() || null;
  }

  private isNewer(candidate: GameVersion, current: GameVersion): boolean {
    const compared = MindustryVersionComparator.compareRaw(candidate.build || candidate.version_value, current.build || current.version_value);
    return compared !== null && compared > 0;
  }

  private async upsertBuild(gameVersionId: number, asset: ManifestAsset): Promise<void> {
    if (!asset.download_url?.startsWith('http')) return;
    const existing = await this.builds.findOne({ where: { game_version_id: gameVersionId, download_url: asset.download_url } });
    await this.builds.save(Object.assign(existing || this.builds.create(), {
      game_version_id: gameVersionId, platform_key: asset.platform || 'advanced', download_url: asset.download_url,
      size_bytes: Number(asset.size) || null, hash_algorithm: asset.sha256 ? 'sha256' : null, content_hash: asset.sha256 || null,
    }));
  }
}
