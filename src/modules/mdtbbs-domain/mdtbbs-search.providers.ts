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
    const qb = this.repo.createQueryBuilder('r').leftJoin('r.user', 'user').leftJoin('r.category', 'category')
      .select(['r.id', 'r.title', 'r.resource_type', 'r.version', 'r.content_language', 'r.slug', 'r.download_count', 'r.rating_average', 'r.rating_count', 'r.user_id', 'r.created_at', 'user.id', 'user.username', 'category.id', 'category.name'])
      .addSelect("LEFT(COALESCE(NULLIF(r.summary, ''), r.description), 360)", 'resource_card_description')
      .maxExecutionTime(2500)
      .where('r.status = :status', { status: 'approved' }).andWhere('r.is_public = :public', { public: 1 })
      .andWhere('(r.visibility IS NULL OR r.visibility = :visibility)', { visibility: 'public' })
      .andWhere('r.deleted_at IS NULL')
      .andWhere('(category.id IS NULL OR category.is_active = :active)', { active: 1 });
    qb.andWhere(`(r.title LIKE :query OR r.description LIKE :query OR r.summary LIKE :query
      OR MATCH(r.title, r.description, r.summary) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE)
      OR category.name LIKE :query OR category.slug LIKE :query
      OR MATCH(category.name, category.slug, category.description) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE)
      OR EXISTS (
        SELECT 1 FROM resource_versions search_version
        WHERE search_version.resource_id = r.id AND search_version.status = 'published'
          AND (search_version.version LIKE :query OR search_version.release_notes_markdown LIKE :query
            OR search_version.content LIKE :query
            OR MATCH(search_version.version, search_version.release_notes_markdown, search_version.content)
              AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))
      )
      OR EXISTS (
        SELECT 1 FROM mod_contents search_mod_content
        INNER JOIN resource_versions search_mod_version ON search_mod_version.id = search_mod_content.resource_version_id
        WHERE search_mod_version.resource_id = r.id AND search_mod_version.status = 'published'
          AND (search_mod_content.internal_name LIKE :query OR search_mod_content.display_name LIKE :query
            OR search_mod_content.description LIKE :query
            OR MATCH(search_mod_content.internal_name, search_mod_content.display_name, search_mod_content.description)
              AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))
      ))`, { query: `%${escapeLike(query)}%`, fullTextQuery: query.trim() });
    if (options.viewer?.id) {
      qb.andWhere(`NOT EXISTS (
        SELECT 1 FROM user_blocks search_block
        WHERE (search_block.blocker_id = :searchViewerId AND search_block.blocked_id = r.user_id)
           OR (search_block.blocker_id = r.user_id AND search_block.blocked_id = :searchViewerId)
      )`, { searchViewerId: options.viewer.id });
    }
    if (options.category) qb.andWhere('category.slug = :category', { category: options.category });
    if (options.resource_kind) qb.andWhere('r.resource_kind = :resourceKind', { resourceKind: options.resource_kind });
    if (options.content_language) qb.andWhere('r.content_language = :contentLanguage', { contentLanguage: options.content_language });
    if (options.preferred_content_language) {
      qb.addSelect('CASE WHEN r.content_language = :preferredContentLanguage THEN 1 ELSE 0 END', 'search_language_match')
        .setParameter('preferredContentLanguage', options.preferred_content_language);
    }
    if (options.preferred_content_language) qb.orderBy('search_language_match', 'DESC');
    if (options.sort === 'oldest') qb.addOrderBy('r.created_at', 'ASC');
    else if (options.sort === 'newest') qb.addOrderBy('r.created_at', 'DESC');
    else if (options.sort === 'rating') qb.addOrderBy('r.rating_average', 'DESC').addOrderBy('r.rating_count', 'DESC').addOrderBy('r.created_at', 'DESC');
    else if (options.sort === 'downloads') qb.addOrderBy('r.download_count', 'DESC').addOrderBy('r.created_at', 'DESC');
    else qb.addOrderBy('r.download_count', 'DESC').addOrderBy('r.rating_average', 'DESC').addOrderBy('r.created_at', 'DESC');
    qb.addOrderBy('r.id', 'DESC').skip(((options.page || 1) - 1) * options.limit).take(options.limit);
    const [selected, total] = await Promise.all([qb.getRawAndEntities(), qb.getCount()]);
    return { total, items: selected.entities.map((r, index) => ({ id: r.id, title: r.title, description: selected.raw[index]?.resource_card_description || null, resource_type: r.resource_type,
      resource_kind: r.resource_kind,
      version: r.version, slug: r.slug, download_count: r.download_count, rating_average: r.rating_average,
      rating_count: r.rating_count, content_language: r.content_language || 'unknown', category_name: r.category?.name || null, username: r.user?.username || null,
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
    const [items, total] = await this.repo.createQueryBuilder('server')
      .select(['server.id', 'server.public_id', 'server.name', 'server.slug', 'server.description', 'server.status']).maxExecutionTime(2500)
      .where('server.is_public = :public', { public: true }).andWhere('server.status = :status', { status: 'active' })
      .andWhere(`(server.name LIKE :query OR server.slug LIKE :query OR server.description LIKE :query
        OR MATCH(server.name, server.slug, server.description) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))`, { query: escaped, fullTextQuery: query.trim() })
      .orderBy('server.name', 'ASC').skip(((options.page || 1) - 1) * options.limit).take(options.limit).getManyAndCount();
    return { items, total };
  }
}

@Injectable()
export class MdtbbsGameVersionSearchProvider implements SearchProvider, OnModuleInit {
  readonly key = 'game_versions';
  constructor(@InjectRepository(GameVersion) private readonly repo: Repository<GameVersion>, private readonly registry: SearchProviderRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async search(query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const exactBuild = query.replace(/^build\s*/i, '');
    const [items, total] = await this.repo.createQueryBuilder('version')
      .select(['version.id', 'version.public_id', 'version.build', 'version.version_value', 'version.display_name', 'version.channel', 'version.is_latest'])
      .maxExecutionTime(2500).where('version.is_official = :official', { official: true })
      .andWhere(`(version.build = :exactBuild OR version.version_value = :exactBuild
        OR version.display_name LIKE :query OR version.changelog LIKE :query
        OR MATCH(version.version_value, version.build, version.display_name, version.changelog)
          AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))`, {
        exactBuild, query: `%${escapeLike(query)}%`, fullTextQuery: query.trim(),
      })
      .orderBy('version.is_latest', 'DESC').addOrderBy('version.released_at', 'DESC')
      .skip(((options.page || 1) - 1) * options.limit).take(options.limit).getManyAndCount();
    return { items, total };
  }
}

@Injectable()
export class MdtbbsDeveloperFeedSearchProvider implements SearchProvider, OnModuleInit {
  readonly key = 'developer_feed';
  constructor(@InjectRepository(DeveloperFeedEntry) private readonly repo: Repository<DeveloperFeedEntry>, private readonly registry: SearchProviderRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async search(query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const [items, total] = await this.repo.createQueryBuilder('feed').select([
      'feed.id', 'feed.provider', 'feed.repository', 'feed.item_type', 'feed.external_id', 'feed.state',
      'feed.summary', 'feed.source_url', 'feed.author_login', 'feed.updated_at',
    ]).maxExecutionTime(2500).where('feed.is_indexable = :indexable', { indexable: true })
      .andWhere(`(feed.summary LIKE :query OR feed.repository LIKE :query OR feed.author_login LIKE :query
        OR MATCH(feed.repository, feed.author_login, feed.summary) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))`, {
        query: `%${escapeLike(query)}%`, fullTextQuery: query.trim(),
      })
      .orderBy('feed.updated_at', 'DESC').skip(((options.page || 1) - 1) * options.limit).take(options.limit).getManyAndCount();
    return { items, total };
  }
}
