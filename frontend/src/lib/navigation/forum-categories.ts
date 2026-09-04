import type { Category } from '@/types';

export const FORUM_CATEGORY_GROUPS = [
  { key: 'community', label: '社区' },
  { key: 'creation', label: '创作' },
  { key: 'game', label: '游戏' },
  { key: 'meta', label: '站务' },
] as const;

export interface ForumCategoryTree {
  category: Category;
  children: Category[];
}

export interface ForumCategoryGroup {
  key: string;
  label: string;
  boards: ForumCategoryTree[];
}

export function getForumCategoryColor(category: Category): string {
  return category.color || '#64748b';
}

/**
 * A single source of truth for desktop and mobile board navigation. The API owns
 * grouping and visibility; this only turns that data into an ordered tree.
 */
export function groupForumCategories(categories: Category[]): ForumCategoryGroup[] {
  const visible = categories.filter((category) => category.is_active && category.show_in_sidebar !== false);
  const byParent = new Map<number, Category[]>();
  for (const category of visible) {
    if (category.parent_id) {
      const children = byParent.get(category.parent_id) || [];
      children.push(category);
      byParent.set(category.parent_id, children);
    }
  }

  const roots = visible.filter((category) => !category.parent_id || !visible.some((parent) => parent.id === category.parent_id));
  const allGroups = [...FORUM_CATEGORY_GROUPS, { key: 'other', label: '其他' }];

  return allGroups
    .map((group) => ({
      ...group,
      boards: roots
        .filter((category) => (category.group_key || 'other') === group.key)
        .map((category) => ({
          category,
          children: (byParent.get(category.id) || []).sort((a, b) => a.sort_order - b.sort_order),
        })),
    }))
    .filter((group) => group.boards.length > 0);
}
