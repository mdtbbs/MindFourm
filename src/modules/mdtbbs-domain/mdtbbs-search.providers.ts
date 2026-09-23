import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { GameServer } from '@entities/game-server.entity';
import { GameVersion } from '@entities/game-version.entity';
import { DeveloperFeedEntry } from '@entities/developer-feed-entry.entity';
import { escapeLike } from '../../common/utils/search.util';
import { SearchOptions, SearchProvider, SearchProviderRegistry, SearchResultGroup } from '../search/search-provider.registry';

@Injectable()
export class MdtbbsResourceSearchProvider implements SearchProvider, OnModuleInit {
  readonly key = 'resources';
  constructor(@InjectRepository(Resource) private readonly repo: Repository<Resource>, private readonly registry: SearchProviderRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async search(query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const qb = this.repo.createQueryBuilder('r').leftJoinAndSelect('r.user', 'user').leftJoinAndSelect('r.category', 'category')
      .where('r.status = :status', { status: 'approved' }).andWhere('r.is_public = :public', { public: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :active)', { active: 1 });
    qb.andWhere('(r.title LIKE :query OR r.description LIKE :query)', { query: `%${escapeLike(query)}%` });
    const resources = await qb.orderBy('r.download_count', 'DESC').addOrderBy('r.rating_average', 'DESC')
      .addOrderBy('r.created_at', 'DESC').take(options.limit).getMany();
    return { items: resources.map((r) => ({ id: r.id, title: r.title, description: r.description, resource_type: r.resource_type,
      version: r.version, slug: r.slug, download_count: r.download_count, rating_average: r.rating_average,
      rating_count: r.rating_count, category_name: r.category?.name || null, username: r.user?.username || null,
      user_id: r.user_id, created_at: r.created_at })) };
  }
}

@Injectable()
export class MdtbbsGameServerSearchProvider implements SearchProvider, OnModuleInit {
  readonly key = 'servers';
  constructor(@InjectRepository(GameServer) private readonly repo: Repository<GameServer>, private readonly registry: SearchProviderRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async search(query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const escaped = `%${escapeLike(query)}%`;
    const items = await this.repo.createQueryBuilder('server')
      .select(['server.id', 'server.public_id', 'server.name', 'server.slug', 'server.description', 'server.status'])
      .where('server.is_public = :public', { public: true }).andWhere('server.status = :status', { status: 'active' })
      .andWhere('(server.name LIKE :query OR server.slug LIKE :query OR server.description LIKE :query)', { query: escaped })
      .orderBy('server.name', 'ASC').take(options.limit).getMany();
    return { items };
  }
}

@Injectable()
export class MdtbbsGameVersionSearchProvider implements SearchProvider, OnModuleInit {
  readonly key = 'game_versions';
  constructor(@InjectRepository(GameVersion) private readonly repo: Repository<GameVersion>, private readonly registry: SearchProviderRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async search(query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const exactBuild = query.replace(/^build\s*/i, '');
    const items = await this.repo.find({ where: [
      { is_official: true, build: exactBuild }, { is_official: true, version_value: exactBuild },
      { is_official: true, display_name: Like(`%${escapeLike(query)}%`) },
    ], order: { is_latest: 'DESC', released_at: 'DESC' }, take: options.limit,
    select: ['id', 'public_id', 'build', 'version_value', 'display_name', 'channel', 'is_latest'] });
    return { items };
  }
}

@Injectable()
export class MdtbbsDeveloperFeedSearchProvider implements SearchProvider, OnModuleInit {
  readonly key = 'developer_feed';
  constructor(@InjectRepository(DeveloperFeedEntry) private readonly repo: Repository<DeveloperFeedEntry>, private readonly registry: SearchProviderRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async search(query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const items = await this.repo.createQueryBuilder('feed').select([
      'feed.id', 'feed.provider', 'feed.repository', 'feed.item_type', 'feed.external_id', 'feed.state',
      'feed.summary', 'feed.source_url', 'feed.author_login', 'feed.updated_at',
    ]).where('feed.is_indexable = :indexable', { indexable: true })
      .andWhere('(feed.summary LIKE :query OR feed.repository LIKE :query OR feed.author_login LIKE :query)', { query: `%${escapeLike(query)}%` })
      .orderBy('feed.updated_at', 'DESC').take(options.limit).getMany();
    return { items };
  }
}
