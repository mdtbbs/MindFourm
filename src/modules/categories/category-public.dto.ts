import { Category } from '@entities/category.entity';

/** One public forum-category shape shared by V1 reads and navigation snapshots. */
export type PublicCategoryDto = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  color: string | null;
  icon: string | null;
  group_key: string | null;
  parent_id: number | null;
  show_in_sidebar: boolean;
  created_at: Date;
  post_count: number;
};

export function publicCategoryFromRow(row: Record<string, unknown>): PublicCategoryDto {
  return {
    id: Number(row.category_id), name: String(row.category_name || ''), slug: String(row.category_slug || ''),
    sort_order: Number(row.category_sort_order) || 0, is_active: Boolean(row.category_is_active),
    description: row.category_description == null ? null : String(row.category_description),
    color: row.category_color == null ? null : String(row.category_color), icon: row.category_icon == null ? null : String(row.category_icon),
    group_key: row.category_group_key == null ? null : String(row.category_group_key),
    parent_id: row.category_parent_id == null ? null : Number(row.category_parent_id),
    show_in_sidebar: Boolean(row.category_show_in_sidebar), created_at: row.category_created_at as Date,
    post_count: Number.parseInt(String(row.post_count ?? 0), 10) || 0,
  };
}

export function publicCategoryFromEntity(category: Category, postCount: number): PublicCategoryDto {
  return {
    id: category.id, name: category.name, slug: category.slug, sort_order: category.sort_order,
    is_active: Boolean(category.is_active), description: category.description ?? null, color: category.color ?? null,
    icon: category.icon ?? null, group_key: category.group_key ?? null, parent_id: category.parent_id ?? null,
    show_in_sidebar: Boolean(category.show_in_sidebar), created_at: category.created_at, post_count: postCount,
  };
}
