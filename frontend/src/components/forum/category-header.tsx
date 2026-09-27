import { Circle, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { Category } from '@/types';
import type { Locale } from '@/i18n';

function categoryIcon(name?: string | null): LucideIcon {
  const icon = name ? (LucideIcons as Record<string, unknown>)[name] : undefined;
  return typeof icon === 'function' ? icon as LucideIcon : Circle;
}

export default function CategoryHeader({ category, locale, descriptionFallback, postCountLabel }: { category: Category; locale: Locale; descriptionFallback: string; postCountLabel: string }) {
  const color = category.color || '#64748b';
  const Icon = categoryIcon(category.icon);
  return (
    <header className="border-b border-[var(--border)] pb-5">
      <div className="flex items-center gap-2" style={{ color }}>
        <Icon className="h-5 w-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{category.description || descriptionFallback}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{postCountLabel.replace('{count}', new Intl.NumberFormat(locale).format(category.post_count || 0))}</p>
    </header>
  );
}
