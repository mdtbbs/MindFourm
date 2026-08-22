import { Circle, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { Category } from '@/types';

function categoryIcon(name?: string | null): LucideIcon {
  const icon = name ? (LucideIcons as Record<string, unknown>)[name] : undefined;
  return typeof icon === 'function' ? icon as LucideIcon : Circle;
}

export default function CategoryHeader({ category }: { category: Category }) {
  const color = category.color || '#64748b';
  const Icon = categoryIcon(category.icon);
  return (
    <header className="border-b border-[var(--border)] pb-5">
      <div className="flex items-center gap-2" style={{ color }}>
        <Icon className="h-5 w-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{category.description || '浏览这个板块中的全部主题。'}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{category.post_count || 0} 个主题</p>
    </header>
  );
}
