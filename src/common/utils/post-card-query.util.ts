import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { Post } from '@entities/post.entity';

/** Cards read only public author/category fields and a bounded body projection. */
export function selectPostCards<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, post = 'post', user = 'user', category = 'category'): void {
  qb.select([
    ...['id', 'user_id', 'category_id', 'post_type', 'source', 'slug', 'title', 'status',
      'is_pinned', 'is_locked', 'view_count', 'like_count', 'created_at', 'updated_at', 'last_activity_at'].map(field => `${post}.${field}`),
    ...['id', 'mindauth_id', 'username', 'avatar_url', 'role'].map(field => `${user}.${field}`),
    ...['id', 'name', 'slug', 'color', 'icon'].map(field => `${category}.${field}`),
  ]).addSelect(`LEFT(COALESCE(NULLIF(${post}.content_text, ''), ${post}.content), 512)`, 'post_card_excerpt');
}

export function hydratePostCardExcerpts(result: { entities: Post[]; raw: any[] }, alias = 'post'): Post[] {
  const excerpts = new Map(result.raw.map(row => [Number(row[`${alias}_id`]), row.post_card_excerpt]));
  for (const post of result.entities) post.content_text = excerpts.get(post.id) ?? '';
  return result.entities;
}
