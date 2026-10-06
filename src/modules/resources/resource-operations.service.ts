import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceViewEvent } from '@entities/resource-view-event.entity';
import { DownloadEvent } from '@entities/download-event.entity';
import { toPublicResource } from './resource-public.dto';

@Injectable()
export class ResourceOperationsService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceViewEvent) private readonly views: Repository<ResourceViewEvent>,
    @InjectRepository(DownloadEvent) private readonly downloads: Repository<DownloadEvent>,
  ) {}

  async summary(requestedDays = 7) {
    const days = [1, 7, 30, 90].includes(Number(requestedDays)) ? Number(requestedDays) : 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const staleSince = new Date(Date.now() - 3 * 86_400_000);

    const [statusRows, kindRows, viewRows, downloadRows, featured, topViewed, topDownloaded, pendingStale] = await Promise.all([
      this.resources.createQueryBuilder('resource')
        .select('resource.status', 'status').addSelect('COUNT(*)', 'count')
        .where('resource.deleted_at IS NULL').groupBy('resource.status').getRawMany(),
      this.resources.createQueryBuilder('resource')
        .select("COALESCE(resource.resource_kind, resource.resource_type, 'other')", 'kind').addSelect('COUNT(*)', 'count')
        .where('resource.deleted_at IS NULL').groupBy("COALESCE(resource.resource_kind, resource.resource_type, 'other')").getRawMany(),
      this.views.createQueryBuilder('event').select('COUNT(*)', 'count').addSelect('COUNT(DISTINCT event.resource_id)', 'resources')
        .where('event.created_at >= :since', { since }).getRawOne(),
      this.downloads.createQueryBuilder('event').select('COUNT(*)', 'count').addSelect('COUNT(DISTINCT event.resource_id)', 'resources')
        .where('event.created_at >= :since', { since }).andWhere("event.event_type = 'completed'").getRawOne(),
      this.publicQuery('resource').andWhere('resource.is_featured = 1').orderBy('resource.updated_at', 'DESC').take(20).getMany(),
      this.publicQuery('resource').orderBy('CAST(resource.view_count AS UNSIGNED)', 'DESC').take(10).getMany(),
      this.publicQuery('resource').orderBy('resource.download_count', 'DESC').take(10).getMany(),
      this.resources.createQueryBuilder('resource').where('resource.deleted_at IS NULL')
        .andWhere("resource.status = 'pending'").andWhere('resource.updated_at < :staleSince', { staleSince }).getCount(),
    ]);

    return {
      range_days: days,
      generated_at: new Date().toISOString(),
      totals: {
        by_status: Object.fromEntries(statusRows.map((row: any) => [String(row.status || 'unknown'), Number(row.count) || 0])),
        by_kind: Object.fromEntries(kindRows.map((row: any) => [String(row.kind || 'other'), Number(row.count) || 0])),
        stale_pending_over_3d: pendingStale,
      },
      activity: {
        views: Number((viewRows as any)?.count) || 0,
        viewed_resources: Number((viewRows as any)?.resources) || 0,
        completed_downloads: Number((downloadRows as any)?.count) || 0,
        downloaded_resources: Number((downloadRows as any)?.resources) || 0,
      },
      featured: featured.map((resource) => toPublicResource(resource, true)),
      top_viewed: topViewed.map((resource) => toPublicResource(resource, true)),
      top_downloaded: topDownloaded.map((resource) => toPublicResource(resource, true)),
    };
  }

  async setFeatured(publicId: string, featured: boolean) {
    const resource = await this.resources.findOne({ where: { public_id: publicId } });
    if (!resource || resource.deleted_at) throw new NotFoundException('Resource not found');
    resource.is_featured = featured ? 1 : 0;
    await this.resources.save(resource);
    return {
      public_id: resource.public_id,
      is_featured: featured,
      resource: toPublicResource(resource, true),
    };
  }

  private publicQuery(alias: string) {
    return this.resources.createQueryBuilder(alias)
      .where(`${alias}.deleted_at IS NULL`)
      .andWhere(`${alias}.is_public = 1`)
      .andWhere(`${alias}.status IN (:...visibleStatuses)`, { visibleStatuses: ['approved', 'published'] })
      .andWhere(`(${alias}.visibility IS NULL OR ${alias}.visibility = 'public')`)
      .andWhere(`${alias}.public_id IS NOT NULL`);
  }
}
