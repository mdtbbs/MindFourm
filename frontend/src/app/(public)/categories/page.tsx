import type { Metadata } from 'next';
import Link from 'next/link';
import { getCategories } from '@/lib/api/v1/categories';
import { getForumCategoryColor, groupForumCategories } from '@/lib/navigation/forum-categories';
import type { Category } from '@/types';
import { getRequestLocale } from '@/i18n/server';
import { translate, type Locale } from '@/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'categoriesPage.title'), description: translate(locale, 'categoriesPage.description') };
}

export default async function CategoriesPage() {
  const locale = await getRequestLocale();
  // `values` must be forwarded: CategoryLink calls this with { count }, and a
  // one-argument wrapper silently drops it, rendering the literal "{count} 个主题".
  // `values` must be forwarded: CategoryLink calls this with { count }, and a
  // one-argument wrapper silently drops it, rendering the literal "{count} 个主题".
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const categories = await getCategories({ init: { cache: 'no-store' } }).catch(() => [] as Category[]);

  const groups = groupForumCategories(categories);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 border-b border-[var(--border)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{t('categoriesPage.header')}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('categoriesPage.browseDescription')}</p>
      </header>

      <div className="space-y-7">
        {groups.map((group) => <section key={group.key}>
          <h2 className="mb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{t(`categoriesPage.groups.${group.key}`)}</h2>
          <div className="border-y border-[var(--border)] bg-[var(--bg-card)]">
            {group.boards.map(({ category, children }) => <div key={category.id}>
              <CategoryLink category={category} locale={locale} t={t} />
              {children.map((child) => <CategoryLink key={child.id} category={child} nested locale={locale} t={t} />)}
            </div>)}
          </div>
        </section>)}
      </div>

      {groups.length === 0 && (
        <div className="text-center text-[var(--text-muted)] py-12">{t('categoriesPage.empty')}</div>
      )}
    </div>
  );
}

function CategoryLink({ category, nested = false, locale, t }: { category: Category; nested?: boolean; locale: Locale; t: (key: string, values?: Record<string, string | number>) => string }) {
  const color = getForumCategoryColor(category);
  return <Link href={`/categories/${category.id}`} className={`flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-4 last:border-b-0 transition-colors hover:bg-[var(--bg-elevated)] ${nested ? 'pl-9' : ''}`}>
    <span className="min-w-0"><span className="flex items-center gap-2 font-medium text-[var(--text)]"><i aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />{category.name}</span>{category.description && <span className="mt-1 block truncate text-sm text-[var(--text-secondary)]">{category.description}</span>}</span>
    <span className="shrink-0 text-xs text-[var(--text-muted)]">{t('categoriesPage.postCount', { count: new Intl.NumberFormat(locale).format(category.post_count || 0) })}</span>
  </Link>;
}
