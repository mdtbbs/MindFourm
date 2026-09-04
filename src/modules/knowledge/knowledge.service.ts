import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';

export type KnowledgeArticleDto = {
  id: number; public_id: string; title: string; slug: string | null;
  summary: string | null; status: string; category: string | null;
  is_public: boolean; related_resource_id: number | null; related_thread_id: number | null;
  created_at: string; updated_at: string;
};

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeArticle) private readonly articleRepo: Repository<KnowledgeArticle>,
  ) {}

  async listPublished(): Promise<KnowledgeArticleDto[]> {
    const articles = await this.articleRepo.find({
      where: { status: 'published' as any, is_public: true },
      order: { sort_order: 'ASC', title: 'ASC' },
    });
    return articles.map(a => this.toDto(a));
  }

  async getArticle(id: number): Promise<KnowledgeArticleDto | null> {
    const article = await this.articleRepo.findOne({ where: { id } });
    if (!article || !article.is_public) return null;
    return this.toDto(article);
  }

  private toDto(a: KnowledgeArticle): KnowledgeArticleDto {
    return {
      id: a.id, public_id: a.public_id, title: a.title, slug: a.slug || null,
      summary: a.summary || null, status: a.status, category: a.category || null,
      is_public: a.is_public, related_resource_id: a.related_resource_id || null,
      related_thread_id: a.related_thread_id || null,
      created_at: a.created_at?.toISOString() || '', updated_at: a.updated_at?.toISOString() || '',
    };
  }
}
