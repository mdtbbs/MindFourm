import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { ResourceStorageService } from './resource-storage.service';

export interface ResourceStorageCleanupResult {
  quarantined_orphans: number;
  retired_resource_files: number;
  retired_version_files: number;
}

/** Delayed, auditable cleanup for resources that cannot be served any more. */
@Injectable()
export class ResourceLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceLifecycleService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceVersion) private readonly versions: Repository<ResourceVersion>,
    private readonly storage: ResourceStorageService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
  ) {}

  private async retentionDays(): Promise<number> {
    const configured = await this.settings.getNumber('resource_file_retention_days');
    return Math.max(1, Math.min(3650, configured || 30));
  }

  onModuleInit(): void {
    // Keep the task inside the existing single-instance forum process. The timer
    // is deliberately not started under Jest, where it would retain open handles.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.scheduledCleanup(), 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async cleanup(now = new Date()): Promise<ResourceStorageCleanupResult> {
    const cutoff = new Date(now.getTime() - await this.retentionDays() * 24 * 60 * 60 * 1000);
    const resources = await this.resources.createQueryBuilder('resource')
      .withDeleted().select(['resource.id', 'resource.file_path', 'resource.status', 'resource.updated_at', 'resource.deleted_at']).getMany();
    const versions = await this.versions.find({ select: ['id', 'resource_id', 'file_path'] });
    const byResource = new Map<number, ResourceVersion[]>();
    for (const version of versions) byResource.set(version.resource_id, [...(byResource.get(version.resource_id) || []), version]);
    const referenced = new Set<string>();
    for (const resource of resources) {
      if (resource.file_path) referenced.add(require('path').resolve(resource.file_path));
      for (const version of byResource.get(resource.id) || []) if (version.file_path) referenced.add(require('path').resolve(version.file_path));
    }
    let retiredResourceFiles = 0, retiredVersionFiles = 0;
    for (const resource of resources) {
      const retired = (!!resource.deleted_at && resource.deleted_at < cutoff)
        || (resource.status === 'rejected' && resource.updated_at < cutoff);
      if (!retired) continue;
      if (await this.storage.removeManaged(resource.file_path)) {
        retiredResourceFiles += 1;
        await this.resources.update(resource.id, { file_path: '' });
      }
      for (const version of byResource.get(resource.id) || []) {
        if (await this.storage.removeManaged(version.file_path)) {
          retiredVersionFiles += 1;
          await this.versions.update(version.id, { file_path: '' });
        }
      }
    }
    const quarantinedOrphans = await this.storage.cleanupOrphanedQuarantine(cutoff, referenced);
    return { quarantined_orphans: quarantinedOrphans, retired_resource_files: retiredResourceFiles, retired_version_files: retiredVersionFiles };
  }

  async scheduledCleanup(): Promise<void> {
    try {
      const result = await this.cleanup();
      if (Object.values(result).some(Boolean)) await this.logs.log({ action: 'resource.storage_cleanup', target_type: 'resource_storage', details: JSON.stringify(result) });
    } catch (error) {
      this.logger.error(`Resource storage cleanup failed: ${(error as Error).message}`);
    }
  }
}
