import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { isValidDeliveryIntegrityCombo } from './resource-aggregate.types';

/**
 * Resource Aggregate Service.
 *
 * Owns cross-entity business rules for the Resource aggregate:
 * - Version selection (choosing newest published version after withdraw)
 * - File integrity validation
 *
 * No controller reads the new schema through this service yet.
 * It is internal infrastructure for later V1 read endpoints.
 */
@Injectable()
export class ResourceAggregateService {
  private readonly logger = new Logger(ResourceAggregateService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceVersion)
    private readonly versionRepo: Repository<ResourceVersion>,
  ) {}

  /**
   * Choose the newest published version for a resource.
   *
   * Used when the current latest_published_version is withdrawn or archived.
   * Returns null when no published version exists.
   *
   * Selection order: newest published_at first, then newest id as tiebreaker.
   */
  async resolveLatestPublishedVersion(resourceId: number): Promise<ResourceVersion | null> {
    const versions = await this.versionRepo.find({
      where: { resource_id: resourceId, status: 'published' as any },
      order: { published_at: 'DESC', id: 'DESC' },
      take: 1,
    });

    return versions[0] ?? null;
  }

  /**
   * Update the resource's latest_published_version_id to match
   * the current newest published version. Called after a version is
   * withdrawn or archived.
   *
   * Returns the new latest version (or null if none remain).
   */
  async refreshLatestPublishedVersion(resourceId: number): Promise<ResourceVersion | null> {
    const latest = await this.resolveLatestPublishedVersion(resourceId);

    await this.resourceRepo.update(resourceId, {
      latest_published_version_id: (latest?.id ?? null) as any,
    });

    return latest;
  }

  /**
   * Validate that a delivery_mode + integrity_status combination is valid.
   *
   * Returns true if the combination is allowed by the policy matrix.
   * Logs a warning for invalid combinations.
   */
  validateFileIntegrity(deliveryMode: string, integrityStatus: string): boolean {
    const valid = isValidDeliveryIntegrityCombo(deliveryMode, integrityStatus);
    if (!valid) {
      this.logger.warn(
        `Invalid delivery/integrity combination: delivery_mode=${deliveryMode}, integrity_status=${integrityStatus}`,
      );
    }
    return valid;
  }
}
