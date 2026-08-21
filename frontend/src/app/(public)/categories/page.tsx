import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchApiData } from '@/lib/api/server-fetch';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '分类',
  description: '浏览所有论坛板块',
};

type CategoryWithCount = {
  id: number;
  name: string;
  slug: string;
  post_count: number;
  is_active: boolean;
};

export default async function CategoriesPage() {
  const categories = await fetchApiData<CategoryWithCount[]>('/api/categories', {
    init: { cache: 'no-store' },
    fallback: [],
  });

  const activeCategories = categories.filter((c) => c.is_active);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold mb-8">论坛板块</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {activeCategories.map((cat) => (
          <Link
            key={cat.id}
            href={`/categories/${cat.id}`}
            className="block bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-5 hover:border-[var(--primary)] transition-colors"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">{cat.name}</h2>
              <span className="text-sm text-[var(--text-muted)]">
                {cat.post_count} 帖子
              </span>
            </div>
          </Link>
        ))}
      </div>

      {activeCategories.length === 0 && (
        <div className="text-center text-[var(--text-muted)] py-12">暂无板块</div>
      )}
    </div>
  );
}
