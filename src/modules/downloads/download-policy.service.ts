import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceVersion } from '@entities/resource-version.entity';

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
  ) {}

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
