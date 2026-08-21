'use client';

import Link from 'next/link';
import { Resource } from '@/types';
import { Star } from 'lucide-react';
import { markdownToPlainExcerpt } from '@/lib/markdown/excerpt';
import { resourceTypeLabel } from '@/lib/display-labels';
import { formatDate } from '@/lib/utils';

export default function ResourceCard({ resource }: { resource: Resource }) {
  const rating = resource.rating_average ?? 0;
  const ratingCount = resource.rating_count ?? 0;

  return (
    <Link
      href={`/resources/${resource.id}`}
      className="block px-4 py-4 transition-colors hover:bg-[var(--bg-elevated)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text)]">{resource.title}</h3>
            {resource.version && (
              <span className="rounded-[var(--radius-sm)] bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-mono text-[var(--primary)]">
                {resource.version}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-[var(--text-muted)]">
            {markdownToPlainExcerpt(resource.description)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5 lg:min-w-[520px] lg:justify-items-end">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">分类</div>
            <div className="mt-1 text-[var(--text)]">{resource.category_name || '未分类'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">类型</div>
            <div className="mt-1 text-[var(--text)]">{resourceTypeLabel(resource.resource_type)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">评分</div>
            <div className="mt-1 flex items-center gap-1 text-[var(--text)]">
              {ratingCount > 0 ? (
                <>
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {rating.toFixed(1)}
                  <span className="text-[var(--text-muted)]">({ratingCount})</span>
                </>
              ) : (
                <span className="text-[var(--text-muted)]">暂无</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">下载</div>
            <div className="mt-1 text-[var(--text)]">{resource.download_count}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">更新</div>
            <div className="mt-1 text-[var(--text)]">{formatDate(resource.updated_at || resource.created_at)}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
