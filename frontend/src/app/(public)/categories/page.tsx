import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchApiData } from '@/lib/api/server-fetch';
import { getForumCategoryColor, groupForumCategories } from '@/lib/navigation/forum-categories';
import type { Category } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '分类',
  description: '浏览所有论坛板块',
};

export default async function CategoriesPage() {
  const categories = await fetchApiData<Category[]>('/api/categories', {
    init: { cache: 'no-store' },
    fallback: [],
  });

  const groups = groupForumCategories(categories);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 border-b border-[var(--border)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">所有板块</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">按社区、创作、游戏和站务浏览讨论。</p>
      </header>

      <div className="space-y-7">
        {groups.map((group) => <section key={group.key}>
          <h2 className="mb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{group.label}</h2>
          <div className="border-y border-[var(--border)] bg-[var(--bg-card)]">
            {group.boards.map(({ category, children }) => <div key={category.id}>
              <CategoryLink category={category} />
              {children.map((child) => <CategoryLink key={child.id} category={child} nested />)}
            </div>)}
          </div>
        </section>)}
      </div>

      {groups.length === 0 && (
        <div className="text-center text-[var(--text-muted)] py-12">暂无板块</div>
      )}
    </div>
  );
}

function CategoryLink({ category, nested = false }: { category: Category; nested?: boolean }) {
  const color = getForumCategoryColor(category);
  return <Link href={`/categories/${category.id}`} className={`flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-4 last:border-b-0 transition-colors hover:bg-[var(--bg-elevated)] ${nested ? 'pl-9' : ''}`}>
    <span className="min-w-0"><span className="flex items-center gap-2 font-medium text-[var(--text)]"><i aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />{category.name}</span>{category.description && <span className="mt-1 block truncate text-sm text-[var(--text-secondary)]">{category.description}</span>}</span>
    <span className="shrink-0 text-xs text-[var(--text-muted)]">{category.post_count || 0} 个主题</span>
  </Link>;
}
