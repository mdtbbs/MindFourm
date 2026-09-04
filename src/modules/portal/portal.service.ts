import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { GameVersion } from '@entities/game-version.entity';

/**
 * Portal Service — builds the homepage module data.
 *
 * Aggregates featured content, latest threads, latest resources, versions,
 * servers, and knowledge. Hides modules when data volume is insufficient.
 */

export type PortalModule = {
  key: string;
  title: string;
  hidden: boolean;
  items: any[];
};

export type PortalData = {
  modules: PortalModule[];
  generated_at: string;
};

@Injectable()
export class PortalService {
  private static readonly MIN_ITEMS_TO_SHOW = 1;

  constructor(
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(KnowledgeArticle) private readonly knowledgeRepo: Repository<KnowledgeArticle>,
    @InjectRepository(GameVersion) private readonly versionRepo: Repository<GameVersion>,
  ) {}

  async getPortalData(): Promise<PortalData> {
    const [resources, threads, knowledge, versions] = await Promise.all([
      this.resourceRepo.find({
        where: { is_public: 1 as any },
        order: { created_at: 'DESC' }, take: 5,
        select: ['id', 'title', 'slug', 'created_at'],
      }),
      this.postRepo.find({
        where: { status: 'published' as any },
        order: { created_at: 'DESC' }, take: 5,
        select: ['id', 'title', 'slug', 'created_at'],
      }),
      this.knowledgeRepo.find({
        where: { status: 'published' as any, is_public: true },
        order: { sort_order: 'ASC' }, take: 5,
        select: ['id', 'title', 'slug', 'category'],
      }),
      this.versionRepo.find({
        order: { released_at: 'DESC' }, take: 5,
        select: ['id', 'version_value', 'display_name', 'game_series'],
      }),
    ]);

    const modules: PortalModule[] = [
      {
        key: 'latest_resources',
        title: '最新资源',
        hidden: resources.length < PortalService.MIN_ITEMS_TO_SHOW,
        items: resources.map(r => ({ id: r.id, title: r.title, slug: r.slug, created_at: (r as any).created_at?.toISOString() || '' })),
      },
      {
        key: 'latest_threads',
        title: '最新讨论',
        hidden: threads.length < PortalService.MIN_ITEMS_TO_SHOW,
        items: threads.map(t => ({ id: t.id, title: t.title, slug: t.slug, created_at: (t as any).created_at?.toISOString() || '' })),
      },
      {
        key: 'knowledge',
        title: '知识文章',
        hidden: knowledge.length < PortalService.MIN_ITEMS_TO_SHOW,
        items: knowledge.map(k => ({ id: k.id, title: k.title, slug: k.slug, category: k.category })),
      },
      {
        key: 'versions',
        title: 'Mindustry 版本',
        hidden: versions.length < PortalService.MIN_ITEMS_TO_SHOW,
        items: versions.map(v => ({ id: v.id, version: v.version_value, display_name: v.display_name, series: v.game_series })),
      },
    ];

    return { modules, generated_at: new Date().toISOString() };
  }
}
