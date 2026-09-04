import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceLegacyProjectionService } from './resource-legacy-projection.service';
import { escapeLike } from '@common/utils/search.util';

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
  resource_kind: string | null;
  visibility: string;
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
  ) {}

  /**
   * Fetch a single resource with its full structured data.
   * Returns null if not found or not visible.
   */
  async getResourceV1(resourceId: number): Promise<V1ResourceDto | null> {
    const resource = await this.resourceRepo.findOne({
      where: { id: resourceId },
    });

    if (!resource || (resource as any).deleted_at) return null;
    if (!resource.is_public) return null;

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

    // Build latest version DTO
    const latestVersion = versions.find(v => v.id === resource.latest_published_version_id) || null;

    return {
      public_id: resource.public_id || null,
      id: resource.id,
      title: resource.title,
      summary: resource.summary || resource.description || '',
      resource_kind: resource.resource_kind || null,
      visibility: resource.visibility || (resource.is_public ? 'public' : 'private'),
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

  async listResourcesV1(params: { limit?: number; offset?: number; search?: string }): Promise<{ items: V1ResourceDto[]; pagination: { limit: number; offset: number; next_offset: number | null; has_more: boolean } }> {
    const limit = Math.max(1, Math.min(params.limit || 20, 50));
    const offset = Math.max(0, params.offset || 0);
    const query = this.resourceRepo.createQueryBuilder('resource')
      .where('resource.deleted_at IS NULL')
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
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
    const items = (await Promise.all(visible.map((row) => this.getResourceV1(row.id)))).filter((row): row is V1ResourceDto => row !== null);
    return { items, pagination: { limit, offset, next_offset: hasMore ? offset + limit : null, has_more: hasMore } };
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
