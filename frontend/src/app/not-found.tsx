import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchApiData } from '@/lib/api/server-fetch';
import type { Category } from '@/types';

export const metadata: Metadata = {
  title: '页面不存在',
  robots: { index: false, follow: true },
};

async function fetchCategories(): Promise<Category[]> {
  return fetchApiData<Category[]>('/api/categories', {
    init: { next: { revalidate: 300 } },
    fallback: [],
  });
}

/**
 * 404 page. Now that deleted posts correctly answer 404 instead of rendering a
 * 200 "帖子不存在" body, this is reached far more often — so it offers real routes
 * onward (search and categories) rather than a single link home.
 *
 * The heading is an `h1`; it was an `h2`, leaving the page with no top-level heading.
 * Copy is Chinese to match the rest of the UI, which was English here only.
 */
export default async function NotFound() {
  const categories = await fetchCategories();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-16">
      <p className="mb-2 text-sm font-semibold tracking-widest text-[var(--text-muted)]">404</p>
      <h1 className="mb-3 text-2xl font-bold text-[var(--text)]">页面不存在</h1>
      <p className="mb-6 text-[var(--text-secondary)]">
        这个页面可能已被删除、尚未通过审核，或者链接有误。
      </p>

      <form action="/search" method="get" className="mb-8 flex gap-2">
        <input
          type="search"
          name="q"
          placeholder="搜索帖子…"
          aria-label="搜索帖子"
          className="flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
        <button
          type="submit"
          className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          搜索
        </button>
      </form>

      {categories.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">浏览分类</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.id}`}
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Link href="/" className="text-sm text-[var(--primary)] hover:underline">
        ← 返回首页
      </Link>
    </div>
  );
}
