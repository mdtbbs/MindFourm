'use client';

import { useState } from 'react';
import { Resource } from '@/types';
import ResourceRow from './resource-row';
import { resourceApi } from '@/lib/api/client';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';

interface ResourceLoadMoreProps {
  initialResources: Resource[];
  initialCursor: string | null;
  hasMore: boolean;
  categoryId?: number;
  search?: string;
  sort?: string;
  tag?: string;
  supportedVersion?: string;
  compatibility?: string;
  resourceKind?: string;
}

export default function ResourceLoadMore({
  initialResources,
  initialCursor,
  hasMore: initialHasMore,
  categoryId,
  search,
  sort,
  tag,
  supportedVersion,
  compatibility,
  resourceKind,
}: ResourceLoadMoreProps) {
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(false);
    try {
      const result = await resourceApi.list({
        cursor,
        limit: 30,
        category_id: categoryId,
        search,
        sort,
        tag,
        supported_version: supportedVersion,
        compatibility,
        resource_kind: resourceKind,
      });
      setResources((prev) => [...prev, ...result.data]);
      setCursor(result.next_cursor);
      setHasMore(result.has_more);
    } catch (err) {
      console.error('Failed to load more resources:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
        {resources.map((resource) => (
          <ResourceRow key={resource.id} resource={resource} />
        ))}
      </div>

      <div className="mt-4">
        {error && <ErrorState title="加载更多资源失败" description="请稍后重试。" onRetry={loadMore} className="min-h-0 py-4" />}
      </div>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          {loading ? (
            <InlineLoading label="正在加载更多资源" />
          ) : (
            <button
              onClick={loadMore}
              className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--bg-elevated)] px-6 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-card)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              加载更多
            </button>
          )}
        </div>
      )}
    </>
  );
}
