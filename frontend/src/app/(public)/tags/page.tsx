import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchApiData } from '@/lib/api/server-fetch';

export const metadata: Metadata = {
  title: '标签',
  description: '浏览所有标签',
};

type Tag = {
  id: number;
  name: string;
  slug: string;
  post_count: number;
};

export default async function TagsPage() {
  const tags = await fetchApiData<Tag[]>('/api/tags', {
    init: { cache: 'no-store' },
    fallback: [],
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold mb-8">标签</h1>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/tags/${tag.slug}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            <span>{tag.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{tag.post_count}</span>
          </Link>
        ))}
      </div>

      {tags.length === 0 && (
        <div className="text-center text-[var(--text-muted)] py-12">暂无标签</div>
      )}
    </div>
  );
}
