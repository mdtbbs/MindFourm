import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceVersionDependency } from '@entities/resource-version-dependency.entity';
import { ResourceVersionCompatibility } from '@entities/resource-version-compatibility.entity';
import { ResourceMember } from '@entities/resource-center-v2.entity';
import { ResourceLegacyProjectionService } from './resource-legacy-projection.service';
import { escapeLike } from '@common/utils/search.util';
import {
  V1MapMetadata,
  V1ModMetadata,
  V1ResourceListItem,
  V1ResourceMetadata,
  V1SchematicMetadata,
  V1ManifestDependency,
  V1ResourceManifest,
} from './v1/resources-v1.dto';

/**
 * V1 Resource Read Adapter.
 *
 * Reads from the new structured aggregate (resources + resource_versions +
 * resource_attributions + resource_files) and produces V1-compatible DTOs.
 *
 * When V1 flag is off, falls back to legacy projection via
 * ResourceLegacyProjectionService.
 */

export type V1ResourceDto = {
  public_id: string | null;
  id: number;
  title: string;
  summary: string;
  content: string | null;
  content_json: Record<string, unknown> | null;
  content_schema_version: number;
  content_html: string | null;
  content_text: string | null;
  resource_kind: string | null;
  visibility: string;
  metadata: V1ResourceMetadata;
  latest_version: V1VersionDto | null;
  attributions: V1AttributionDto[];
  download_count: number;
};

export type V1VersionDto = {
  public_id: string | null;
  id: number;
  version: string;
  display_version: string;
  status: string;
  is_legacy_root_release: boolean;
  files: V1FileDto[];
};

export type V1FileDto = {
  public_id: string;
  id: number;
  role: string;
  delivery_mode: string;
  display_name: string | null;
  integrity_status: string;
  availability_status: string;
  downloadable: boolean;
  installable: boolean;
};

export type V1AttributionDto = {
  id: number;
  role: string;
  subject_type: string;
  display_name: string | null;
  user_id: number | null;
};

@Injectable()
export class ResourceReadAdapterService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceVersion)
    private readonly versionRepo: Repository<ResourceVersion>,
    @InjectRepository(ResourceAttribution)
    private readonly attributionRepo: Repository<ResourceAttribution>,
    @InjectRepository(ResourceFile)
    private readonly fileRepo: Repository<ResourceFile>,
    private readonly legacyProjection: ResourceLegacyProjectionService,
    @Optional()
    @InjectRepository(ResourceVersionDependency)
    private readonly dependencyRepo?: Repository<ResourceVersionDependency>,
    @Optional()
    @InjectRepository(ResourceVersionCompatibility)
    private readonly compatibilityRepo?: Repository<ResourceVersionCompatibility>,
    @Optional()
    @InjectRepository(ResourceMember)
    private readonly memberRepo?: Repository<ResourceMember>,
  ) {}

  /**
   * Fetch a single resource with its full structured data.
   * Returns null if not found or not visible.
   */
  async getResourceV1(resourceId: number): Promise<V1ResourceDto | null> {
    const resource = await this.resourceRepo.findOne({
      where: { id: resourceId },
    });

    if (!resource || (resource as any).deleted_at || !resource.is_public
      || !['approved', 'published'].includes(String(resource.status || ''))) return null;

    const [versions, attributions] = await Promise.all([
      this.versionRepo.find({
        where: { resource_id: resourceId },
        order: { created_at: 'DESC' },
      }),
      this.attributionRepo.find({
        where: { resource_id: resourceId },
        order: { sort_order: 'ASC' },
      }),
    ]);

    // Get files for all versions
    const versionIds = versions.map(v => v.id);
    const files = versionIds.length > 0
      ? await this.fileRepo.find({
          where: { resource_version_id: In(versionIds) },
          order: { sort_order: 'ASC' },
        })
      : [];

    // Public projections must never trust a stale pointer to a pending binary.
    const publishedVersions = versions.filter((version) => version.status === 'published');
    const pointedPublishedVersion = publishedVersions.find(v => v.id === resource.latest_published_version_id) || null;
    const latestVersion = pointedPublishedVersion
      || publishedVersions[0]
      || null;

    return {
      public_id: resource.public_id || null,
      id: resource.id,
      title: resource.title,
      summary: resource.summary || resource.description || '',
      content: resource.content || null,
      content_json: resource.content_json || null,
      content_schema_version: resource.content_schema_version || 2,
      content_html: resource.content_html || null,
      content_text: resource.content_text || null,
      resource_kind: resource.resource_kind || null,
      visibility: resource.visibility || (resource.is_public ? 'public' : 'private'),
      metadata: this.buildMetadata(resource, Boolean(pointedPublishedVersion)),
      latest_version: latestVersion ? this.buildVersionDto(latestVersion, files) : null,
      attributions: attributions.map(a => ({
        id: a.id,
        role: a.role,
        subject_type: a.subject_type,
        display_name: a.display_name || null,
        user_id: a.user_id || null,
      })),
      download_count: resource.download_count || 0,
    };
  }

  async getResourceByPublicId(publicId: string): Promise<V1ResourceDto | null> {
    const resource = await this.resourceRepo.findOne({ where: { public_id: publicId } });
    if (!resource) return null;
    return this.getResourceV1(resource.id);
  }

  async getMergedCanonicalPublicId(publicId: string): Promise<string | null> {
    const source = await this.resourceRepo.findOne({ where: { public_id: publicId } });
    if (!source?.merged_into_resource_id) return null;
    let currentId = Number(source.merged_into_resource_id);
    const visited = new Set<number>([Number(source.id)]);
    for (let depth = 0; depth < 12; depth += 1) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);
      const target = await this.resourceRepo.findOne({ where: { id: currentId } });
      if (!target) return null;
      if (!target.merged_into_resource_id) {
        if (!target.public_id || Number(target.is_public) !== 1 || !['approved', 'published'].includes(target.status)) return null;
        return target.public_id;
      }
      currentId = Number(target.merged_into_resource_id);
    }
    return null;
  }

  async getPublicResourceEntityByPublicId(publicId: string): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { public_id: publicId } });
    if (!resource || (resource as any).deleted_at || !resource.is_public
      || !['approved', 'published'].includes(String(resource.status || ''))) return null;
    if (typeof resource.file_path === 'string' && /[\\/]\.quarantine[\\/]/.test(resource.file_path)) {
      const publishedVersion = await this.versionRepo.findOne({
        where: { resource_id: resource.id, status: 'published' },
        order: { published_at: 'DESC', created_at: 'DESC', revision: 'DESC', id: 'DESC' },
      });
      if (!publishedVersion) {
        resource.renderer_status = 'unavailable';
        resource.renderer_preview_key = null;
      }
    }
    return resource;
  }

  async getManifestByPublicId(publicId: string): Promise<V1ResourceManifest | null> {
    const resource = await this.resourceRepo.findOne({ where: { public_id: publicId } });
    if (!resource || (resource as any).deleted_at || !resource.is_public || !resource.public_id
      || !['approved', 'published'].includes(String(resource.status || ''))) return null;

    const versions = await this.versionRepo.find({
      where: { resource_id: resource.id, status: 'published' },
      order: { published_at: 'DESC', created_at: 'DESC' },
    });
    const versionIds = versions.map((version) => version.id);
    if (versionIds.length === 0) {
      return {
        schema_version: 1,
        type: resource.resource_kind || 'other',
        resource: { public_id: resource.public_id, name: resource.title },
        resource_public_id: resource.public_id,
        resource_kind: resource.resource_kind || 'other',
        versions: [],
      };
    }

    const [files, dependencies, compatibilities] = await Promise.all([
      this.fileRepo.find({ where: { resource_version_id: In(versionIds) }, order: { sort_order: 'ASC' } }),
      this.dependencyRepo?.find({ where: { resource_version_id: In(versionIds) }, order: { sort_order: 'ASC' } }) || Promise.resolve([]),
      this.compatibilityRepo?.find({ where: { resource_version_id: In(versionIds) }, order: { created_at: 'ASC' } }) || Promise.resolve([]),
    ]);
    const targetIds = dependencies.map((dependency) => dependency.target_resource_id).filter((id): id is number => Number.isInteger(id));
    const targetResources = targetIds.length ? await this.resourceRepo.find({ where: { id: In(targetIds) } }) : [];
    const targetPublicIds = new Map(targetResources.map((target) => [target.id, target.public_id || null]));

    return {
      schema_version: 1,
      type: resource.resource_kind || 'other',
      resource: { public_id: resource.public_id, name: resource.title },
      resource_public_id: resource.public_id,
      resource_kind: resource.resource_kind || 'other',
      versions: versions
        .filter((version): version is ResourceVersion & { public_id: string } => typeof version.public_id === 'string' && version.public_id.length > 0)
        .map((version) => ({
          public_id: version.public_id,
          version: version.version,
          display_version: this.resolveDisplayVersion(version.version, resource.id),
          release_channel: version.release_channel || 'stable',
          published_at: version.published_at?.toISOString() || null,
          compatibility: compatibilities
            .filter((item) => item.resource_version_id === version.id)
            .map((item) => ({
              runtime: item.runtime,
              game_series: item.game_series,
              min_version: item.min_version_value,
              max_version: item.max_version_value,
              channel: item.channel,
              platform: item.platform_key,
              provenance: item.provenance,
              confidence: item.confidence,
            })),
          dependencies: dependencies
            .filter((item) => item.resource_version_id === version.id)
            .map((item): V1ManifestDependency => ({
              dependency_type: item.dependency_type,
              resource_public_id: item.target_resource_id ? targetPublicIds.get(item.target_resource_id) || null : null,
              external_identifier: item.external_identifier,
              version_constraint: item.version_constraint,
              notes: item.notes,
            })),
          files: files
            .filter((file) => file.resource_version_id === version.id)
            .map((file) => ({
              public_id: file.public_id,
              role: file.role,
              delivery_mode: file.delivery_mode,
              platform: file.platform_key,
              architecture: file.architecture_key,
              package_type: file.package_type,
              display_name: file.display_name,
              original_filename: file.original_filename,
              mime_type: file.mime_type,
              size_bytes: file.size_bytes,
              hash_algorithm: file.hash_algorithm,
              content_hash: file.content_hash,
              integrity_status: file.integrity_status,
              availability_status: file.availability_status,
              downloadable: file.availability_status === 'available',
              installable: file.integrity_status === 'verified' && file.availability_status === 'available' && file.delivery_mode === 'managed',
              download_url: `/api/v1/resources/${resource.public_id}/versions/${version.public_id}/files/${file.public_id}/download`,
            })),
        })),
    };
  }

  async getPublicFileByPublicIds(resourcePublicId: string, versionPublicId: string, filePublicId: string, viewer?: { id: number; role?: string }) {
    const resource = await this.resourceRepo.findOne({ where: { public_id: resourcePublicId } });
    if (!resource || (resource as any).deleted_at || resource.merged_into_resource_id) return null;
    const publicResource = Boolean(resource.is_public) && ['approved', 'published'].includes(String(resource.status || ''));
    const canManage = await this.canManageResource(resource, viewer);
    if (!publicResource && !canManage) return null;
    const version = await this.versionRepo.findOne({
      where: {
        public_id: versionPublicId,
        resource_id: resource.id,
        ...(publicResource && !canManage ? { status: 'published' } : {}),
      },
    });
    if (!version || (version.status !== 'published' && !canManage)) return null;
    const file = await this.fileRepo.findOne({ where: { public_id: filePublicId, resource_version_id: version.id } });
    return file ? { resource, version, file } : null;
  }

  private async canManageResource(resource: Resource, viewer?: { id: number; role?: string }): Promise<boolean> {
    if (!viewer || !Number.isSafeInteger(Number(viewer.id)) || Number(viewer.id) < 1) return false;
    if (['admin', 'moderator'].includes(String(viewer.role || '').toLowerCase())) return true;
    if (Number(resource.user_id) === Number(viewer.id)) return true;
    const member = await this.memberRepo?.findOne({
      where: { resource_id: resource.id, user_id: Number(viewer.id), status: 'active' },
    });
    return ['owner', 'maintainer', 'publisher'].includes(String(member?.role || ''));
  }

  async incrementDownload(resourceId: number): Promise<void> {
    await this.resourceRepo.increment({ id: resourceId }, 'download_count', 1);
  }

  async listResourcesV1(params: { limit?: number; offset?: number; search?: string }): Promise<{ items: V1ResourceListItem[]; pagination: { limit: number; offset: number; next_offset: number | null; has_more: boolean } }> {
    const limit = Math.max(1, Math.min(params.limit || 20, 50));
    const offset = Math.max(0, params.offset || 0);
    const query = this.resourceRepo.createQueryBuilder('resource')
      .where('resource.deleted_at IS NULL')
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere("resource.status IN ('approved','published')")
      .andWhere('resource.merged_into_resource_id IS NULL')
      .orderBy('resource.created_at', 'DESC')
      .addOrderBy('resource.id', 'DESC')
      .skip(offset)
      .take(limit + 1);
    if (params.search?.trim()) {
      query.andWhere('(resource.title LIKE :search OR resource.description LIKE :search)', { search: `%${escapeLike(params.search.trim())}%` });
    }
    const rows = await query.getMany();
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const details = (await Promise.all(visible.map((row) => this.getResourceV1(row.id)))).filter(
      (row): row is V1ResourceDto & { public_id: string } => row !== null && typeof row.public_id === 'string' && row.public_id.length > 0,
    );
    const items: V1ResourceListItem[] = details.map((item) => ({
      public_id: item.public_id,
      title: item.title,
      summary: item.summary,
      resource_kind: item.resource_kind || 'other',
      visibility: item.visibility,
      metadata: item.metadata,
      latest_version: item.latest_version ? this.toVersionSummary(item.latest_version) : null,
      download_count: item.download_count,
    }));
    return { items, pagination: { limit, offset, next_offset: hasMore ? offset + limit : null, has_more: hasMore } };
  }

  private buildMetadata(resource: Resource, hasPublishedVersion = false): V1ResourceMetadata {
    const publisher = this.parseObject(resource.metadata_json);
    const unreviewedQuarantinedBinary = !hasPublishedVersion
      && typeof resource.file_path === 'string'
      && /[\\/]\.quarantine[\\/]/.test(resource.file_path);
    const renderer = unreviewedQuarantinedBinary ? {} : this.parseObject(resource.renderer_metadata_json);
    const rendererStatus = unreviewedQuarantinedBinary ? 'unavailable' : resource.renderer_status || 'none';
    const metadata: V1ResourceMetadata = {
      schema_version: 1,
      tags: this.stringList(publisher.tags),
      supported_versions: this.stringList(publisher.supported_versions),
      compatibility: this.stringList(publisher.compatibility),
      preview: {
        url: rendererStatus === 'ready'
          ? (resource.public_id ? `/api/v1/resources/${resource.public_id}/preview` : `/api/resources/${resource.id}/preview`)
          : null,
        status: rendererStatus,
      },
    };

    if (resource.resource_kind === 'map') metadata.map = this.mapMetadata(renderer, publisher);
    if (resource.resource_kind === 'schematic') metadata.schematic = this.schematicMetadata(renderer, publisher);
    if (resource.resource_kind === 'mod') metadata.mod = this.modMetadata(renderer, publisher);
    return metadata;
  }

  private mapMetadata(renderer: Record<string, unknown>, publisher: Record<string, unknown>): V1MapMetadata {
    const buildMetadata = this.objectValue(renderer.map_build_metadata);
    const storedBuild = buildMetadata.source === 'file_metadata'
      ? this.buildValue(buildMetadata.stored_game_build)
      : null;
    return {
      name: this.stringValue(renderer.name),
      author: this.stringValue(renderer.author),
      description: this.stringValue(renderer.description),
      width: this.numberValue(renderer.width),
      height: this.numberValue(renderer.height),
      spawns: this.numberValue(renderer.spawns),
      version: this.numberValue(renderer.version),
      build: storedBuild,
      save_format_version: this.numberValue(renderer.save_format_version ?? renderer.version),
      stored_game_build: storedBuild,
      build_source: buildMetadata.source === 'file_metadata' && storedBuild !== null ? 'file_metadata' : 'unknown',
      parser_runtime: this.objectValue(renderer.parser_runtime),
      planets: this.uniqueStrings([
        ...this.stringList(publisher.planets ?? publisher.planet),
        ...this.stringList(renderer.planet),
      ]),
      game_modes: this.uniqueStrings([
        ...this.stringList(publisher.game_modes ?? publisher.gamemodes),
        ...this.stringList(renderer.game_modes),
      ]),
      tags: this.stringList(renderer.tags ?? publisher.tags),
      teams: this.stringList(renderer.teams),
      rules: this.objectValue(renderer.rules),
      waves: typeof renderer.waves === 'boolean' ? renderer.waves : null,
      wave_groups: this.safeArray(renderer.wave_groups),
      banned_blocks: this.stringList(renderer.banned_blocks),
      banned_units: this.stringList(renderer.banned_units),
      core_count: this.numberValue(renderer.core_count),
      cores: this.safeArray(renderer.cores),
      core_teams: this.stringList(renderer.core_teams),
      tile_layers: this.objectValue(renderer.tile_layers),
      tile_layers_truncated: renderer.tile_layers_truncated === true,
      required_mods: this.uniqueStrings([
        ...this.stringList(publisher.required_mods),
        ...this.stringList(renderer.mod_dependencies),
      ]),
    };
  }

  private schematicMetadata(renderer: Record<string, unknown>, publisher: Record<string, unknown>): V1SchematicMetadata {
    const compatibility = this.objectValue(renderer.compatibility);
    const source = compatibility.source === 'inferred' ? 'inferred' : 'unknown';
    const confidence = ['low', 'medium', 'high'].includes(String(compatibility.confidence))
      ? compatibility.confidence as 'low' | 'medium' | 'high' : 'low';
    return {
      name: this.stringValue(renderer.name),
      description: this.stringValue(renderer.description),
      width: this.numberValue(renderer.width),
      height: this.numberValue(renderer.height),
      blocks: this.numberValue(renderer.blocks),
      block_types: this.safeArray(renderer.block_types),
      block_positions: this.safeArray(renderer.block_positions),
      block_positions_truncated: renderer.block_positions_truncated === true,
      requirements: this.safeArray(renderer.requirements ?? publisher.requirements),
      power_production: this.numberValue(renderer.power_production),
      power_consumption: this.numberValue(renderer.power_consumption),
      net_power: this.numberValue(renderer.net_power),
      planet: this.stringValue(renderer.planet),
      labels: this.stringList(renderer.labels),
      required_mods: this.stringList(renderer.mod_dependencies),
      schematic_format_version: this.numberValue(renderer.schematic_format_version),
      parser_runtime: this.objectValue(renderer.parser_runtime),
      compatibility_inference: {
        minimum_supported_build: this.numberValue(compatibility.minimum_supported_build),
        source,
        confidence,
        unknown_content: this.stringList(renderer.unknown_content),
      },
      structure_hashes: {
        exact: this.stringValue(renderer.structure_hash),
        normalized: this.stringValue(renderer.normalized_structure_hash),
      },
    };
  }

  private modMetadata(renderer: Record<string, unknown>, publisher: Record<string, unknown>): V1ModMetadata {
    return {
      mod_id: this.stringValue(renderer.mod_id ?? publisher.mod_id),
      version: this.stringValue(renderer.version ?? publisher.mod_version),
      game_versions: this.stringList(renderer.game_versions ?? publisher.game_versions ?? publisher.supported_versions),
      dependencies: this.safeArray(renderer.dependencies ?? publisher.dependencies),
    };
  }

  private parseObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return {}; }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
  }

  private numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private buildValue(value: unknown): number | null {
    const number = this.numberValue(value);
    return number !== null && number > 1 ? number : null;
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private stringList(value: unknown): string[] {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
    return values
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100);
  }

  private safeArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value.slice(0, 100) : [];
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values)].slice(0, 100);
  }

  private toVersionSummary(version: V1VersionDto) {
    return {
      public_id: version.public_id || '',
      id: version.id,
      version: version.version,
      display_version: version.display_version,
      status: version.status,
      is_legacy_root_release: version.is_legacy_root_release,
      file_count: version.files.length,
    };
  }

  private buildVersionDto(version: ResourceVersion, allFiles: ResourceFile[]): V1VersionDto {
    const versionFiles = allFiles.filter(f => f.resource_version_id === version.id);
    const versionStr = (version as any).version || '';
    const displayVersion = this.resolveDisplayVersion(versionStr, version.resource_id);

    return {
      public_id: (version as any).public_id || null,
      id: version.id,
      version: versionStr,
      display_version: displayVersion,
      status: (version as any).status || 'published',
      is_legacy_root_release: !!(version as any).is_legacy_root_release,
      files: versionFiles.map(f => ({
        public_id: f.public_id,
        id: f.id,
        role: f.role,
        delivery_mode: f.delivery_mode,
        display_name: f.display_name || null,
        integrity_status: f.integrity_status,
        availability_status: f.availability_status,
        downloadable: f.availability_status === 'available',
        installable: f.integrity_status === 'verified' && f.availability_status === 'available' && f.delivery_mode === 'managed',
      })),
    };
  }

  private resolveDisplayVersion(version: string, resourceId: number): string {
    if (!version || !version.trim()) return '版本未知';
    if (/^legacy-\d+$/.test(version)) return '版本未知';
    return version;
  }
}
