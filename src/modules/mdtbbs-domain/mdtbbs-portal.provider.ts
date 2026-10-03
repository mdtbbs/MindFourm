import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { GameVersion } from '@entities/game-version.entity';
import { PortalSectionProvider, PortalSectionRegistry } from '../portal/portal-section.registry';
import type { HomeDeveloperEntry, HomeResource } from '../portal/portal.service';

@Injectable()
export class MdtbbsPortalSectionProvider implements PortalSectionProvider, OnModuleInit {
  readonly keys = ['resources', 'versions', 'development:issues', 'development:pull_requests'];
  constructor(
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(GameVersion) private readonly versionRepo: Repository<GameVersion>,
    private readonly registry: PortalSectionRegistry,
  ) {}
  onModuleInit(): void { this.registry.register(this); }

  getTitle(key: string): string | undefined { return key === 'versions' ? 'Mindustry 版本' : undefined; }

  async getSection(key: string): Promise<unknown[]> {
    if (key === 'resources') return this.getLatestResources();
    if (key === 'versions') return this.getVersions();
    if (key === 'development:issues') return this.getDeveloperEntries('GITHUB_ISSUE');
    if (key === 'development:pull_requests') return this.getDeveloperEntries('GITHUB_PR');
    return [];
  }

  private async getLatestResources(): Promise<HomeResource[]> {
    const selected = await this.resourceRepo.createQueryBuilder('resource')
      .leftJoin('resource.user', 'user').leftJoin('resource.category', 'category')
      .select(['resource.id', 'resource.title', 'resource.slug', 'resource.resource_kind', 'resource.version', 'resource.updated_at', 'resource.renderer_status', 'user.id', 'user.username', 'category.id', 'category.name'])
      .addSelect("LEFT(COALESCE(NULLIF(resource.summary, ''), resource.description), 360)", 'resource_card_description').maxExecutionTime(2500)
      .where('resource.status IN (:...statuses)', { statuses: ['approved', 'published'] })
      .andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 })
      .orderBy('resource.updated_at', 'DESC').addOrderBy('resource.id', 'DESC').take(6).getRawAndEntities();
    return selected.entities.map((resource, index) => ({ id: resource.id, title: resource.title, slug: resource.slug || null,
      resource_kind: resource.resource_kind || null, version: resource.version || null,
      updated_at: resource.updated_at.toISOString(), author_name: resource.user?.username || null,
      category_name: resource.category?.name || null, description: selected.raw[index]?.resource_card_description || null,
      preview_url: resource.renderer_status === 'ready' ? `/api/resources/${resource.id}/preview` : null }));
  }

  private async getDeveloperEntries(source: 'GITHUB_ISSUE' | 'GITHUB_PR'): Promise<HomeDeveloperEntry[]> {
    const rows = await this.postRepo.find({ where: { status: 'published', source, required_group_id: IsNull() }, relations: ['category'],
      select: { id: true, category_id: true, title: true, slug: true, last_activity_at: true, updated_at: true, category: { id: true, name: true } },
      order: { last_activity_at: 'DESC', id: 'DESC' }, take: 3 });
    return rows.map((row) => {
      const match = row.title.match(/^\[#(\d+)\]\s*/);
      return { id: row.id, category_id: row.category_id ?? null, external_id: match?.[1] || String(row.id),
        title: row.title.replace(/^\[#\d+\]\s*/, '') || `#${row.id}`,
        state: source === 'GITHUB_ISSUE' ? 'Issue' : 'Pull Request',
        url: `/posts/${row.id}${row.slug ? `-${row.slug}` : ''}`,
        repository: row.category?.name || 'GitHub 同步',
        updated_at: (row.last_activity_at || row.updated_at).toISOString() };
    });
  }

  private async getVersions(): Promise<Array<Record<string, string | number | null>>> {
    const versions = await this.versionRepo.find({ where: { is_latest: true }, order: { channel: 'ASC' }, take: 5,
      select: ['id', 'build', 'version_value', 'display_name', 'channel'] });
    return versions.map((version) => ({ id: version.id, version: version.build || version.version_value,
      display_name: version.display_name, channel: version.channel || null }));
  }
}
