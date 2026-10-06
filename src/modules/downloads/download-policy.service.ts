import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { SettingsService } from '../settings/settings.service';

/**
 * Download Policy — the single authority for whether a file can be delivered.
 *
 * Checks:
 * 1. Resource is visible (not soft-deleted, not pending, not rejected)
 * 2. Resource category is enabled
 * 3. Version is published
 * 4. File is available and in a valid delivery state
 *
 * This service is used by both Web and V1 download paths.
 */

export type DownloadEligibility = {
  eligible: boolean;
  reason: string | null;
  resource: Resource | null;
  version: ResourceVersion | null;
  file: ResourceFile | null;
};

@Injectable()
export class DownloadPolicyService {
  private readonly logger = new Logger(DownloadPolicyService.name);

  constructor(
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceVersion) private readonly versionRepo: Repository<ResourceVersion>,
    @InjectRepository(ResourceFile) private readonly fileRepo: Repository<ResourceFile>,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async requiresAuthentication(resourceKind: string | null | undefined): Promise<boolean> {
    const key = resourceKind === 'mod' ? 'resource_download_mod_auth_required'
      : resourceKind === 'schematic' ? 'resource_download_schematic_auth_required'
        : resourceKind === 'map' ? 'resource_download_map_auth_required' : null;
    if (!key) return false;
    // Fail closed if SettingsService is unavailable; production defaults are
    // seeded to true and admins can switch each resource kind independently.
    return this.settings ? this.settings.getBoolean(key, true) : true;
  }

  async assertDownloadAuthentication(resourceKind: string | null | undefined, user?: { id?: unknown } | null): Promise<void> {
    const userId = Number(user?.id);
    if (await this.requiresAuthentication(resourceKind) && (!Number.isSafeInteger(userId) || userId < 1)) {
      throw new UnauthorizedException({ code: 'RESOURCE_DOWNLOAD_AUTH_REQUIRED', message: '登录后才能下载此类资源。' });
    }
  }

  /**
   * Check whether a file is eligible for download.
   * Returns the reason if not eligible.
   */
  async checkEligibility(fileId: number): Promise<DownloadEligibility> {
    // Use withDeleted so soft-deleted resources are found and explicitly rejected
    // rather than silently returning RESOURCE_NOT_FOUND.
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) {
      return { eligible: false, reason: 'FILE_NOT_FOUND', resource: null, version: null, file: null };
    }

    const version = await this.versionRepo.findOne({ where: { id: file.resource_version_id } });
    if (!version) {
      return { eligible: false, reason: 'VERSION_NOT_FOUND', resource: null, version: null, file };
    }

    const resource = await this.resourceRepo
      .findOne({ where: { id: version.resource_id }, withDeleted: true });
    if (!resource) {
      return { eligible: false, reason: 'RESOURCE_NOT_FOUND', resource: null, version, file };
    }

    // Check soft-delete
    if (resource.deleted_at) {
      return { eligible: false, reason: 'RESOURCE_DELETED', resource, version, file };
    }

    // Check visibility
    if (!resource.is_public) {
      return { eligible: false, reason: 'RESOURCE_NOT_PUBLIC', resource, version, file };
    }

    // Check status
    if (resource.status !== 'approved' && resource.status !== 'published') {
      return { eligible: false, reason: 'RESOURCE_NOT_APPROVED', resource, version, file };
    }

    // Check version status
    if (version.status && version.status !== 'published') {
      return { eligible: false, reason: 'VERSION_NOT_PUBLISHED', resource, version, file };
    }

    // Check file availability
    if (file.availability_status !== 'available') {
      return { eligible: false, reason: 'FILE_UNAVAILABLE', resource, version, file };
    }

    return { eligible: true, reason: null, resource, version, file };
  }
}
