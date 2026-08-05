'use client';

import { useState } from 'react';
import { Resource } from '@/types';
import ResourceCard from './resource-card';
import { resourceApi } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';

interface ResourceLoadMoreProps {
  initialResources: Resource[];
  initialCursor: string | null;
  hasMore: boolean;
  categoryId?: number;
  search?: string;
  sort?: string;
}

export default function ResourceLoadMore({
  initialResources,
  initialCursor,
  hasMore: initialHasMore,
  categoryId,
  search,
  sort,
}: ResourceLoadMoreProps) {
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const result = await resourceApi.list({
        cursor,
        limit: 30,
        category_id: categoryId,
        search,
        sort,
      });
      setResources((prev) => [...prev, ...result.data]);
      setCursor(result.next_cursor);
      setHasMore(result.has_more);
    } catch (err) {
      console.error('Failed to load more resources:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
        {resources.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--bg-elevated)] px-6 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-card)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </>
  );
}
