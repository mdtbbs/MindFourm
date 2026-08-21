import Link from 'next/link';
import { Download, Package, User } from 'lucide-react';
import { Resource } from '@/types';
import { markdownToPlainExcerpt } from '@/lib/markdown/excerpt';
import { formatDate } from '@/lib/utils';
import { resourceTypeLabel } from '@/lib/display-labels';

interface ResourceListItemProps {
  resource: Resource;
}

export default function ResourceListItem({ resource }: ResourceListItemProps) {
  const platforms = (resource.metadata?.compatibility || []).slice(0, 3);
  const summary = markdownToPlainExcerpt(resource.description || resource.content || '');

  return (
    <Link
      href={`/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`}
      className="group block rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--primary)] hover:shadow-sm sm:p-5"
    >
      <div className="flex gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <Package className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-base font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">
                {resource.title}
              </h3>
              {summary && <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{summary}</p>}
            </div>
            <span className="hidden shrink-0 items-center gap-1 text-sm text-[var(--text-muted)] sm:inline-flex">
              <Download className="h-4 w-4" />
              {resource.download_count.toLocaleString()}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-[var(--primary)]/10 px-2 py-1 text-xs font-medium text-[var(--primary)]">{resourceTypeLabel(resource.resource_type)}</span>
            {resource.version && <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-secondary)]">v{resource.version}</span>}
            {platforms.map((platform) => <span key={platform} className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-secondary)]">{platform}</span>)}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span className="inline-flex min-w-0 items-center gap-1.5"><User className="h-3.5 w-3.5" />{resource.username || '未知作者'} · {formatDate(resource.updated_at || resource.created_at)}</span>
            <span className="inline-flex items-center gap-1 sm:hidden"><Download className="h-3.5 w-3.5" />{resource.download_count.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
