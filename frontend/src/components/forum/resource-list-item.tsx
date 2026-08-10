import Link from 'next/link';
import { Star, Download, Calendar } from 'lucide-react';
import { Resource } from '@/types';

interface ResourceListItemProps {
  resource: Resource;
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const stars = Math.round(rating);
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${
              i <= stars ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-[var(--text-muted)]'
            }`}
          />
        ))}
      </div>
      {count > 0 && <span className="text-xs text-[var(--text-muted)]">({count})</span>}
    </div>
  );
}

export default function ResourceListItem({ resource }: ResourceListItemProps) {
  const rating = resource.rating_average || 0;
  const ratingCount = resource.rating_count || 0;

  return (
    <Link
      href={`/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`}
      className="block rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:border-[var(--primary)] hover:shadow-sm transition-all"
    >
      <div className="flex gap-3">
        {/* Resource icon */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--primary-light)] to-[var(--accent)] flex items-center justify-center">
            <span className="text-2xl">📦</span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-sm text-[var(--text)] line-clamp-1 flex items-center gap-1.5">
              {resource.title}
              {resource.resource_kind && (
                <span className="inline-flex items-center rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)] shrink-0">
                  {resource.resource_kind}
                </span>
              )}
            </h3>
            <StarRating rating={rating} count={ratingCount} />
          </div>

          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mb-1.5">
            <span className="flex items-center gap-1">
              👤 {resource.username}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(resource.created_at).toLocaleDateString()}
            </span>
            {resource.category_name && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                {resource.category_name}
              </span>
            )}
          </div>

          {resource.description && (
            <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
              {resource.description}
            </p>
          )}
        </div>

        {/* Right side stats */}
        <div className="flex-shrink-0 text-right text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1 justify-end mb-1">
            <Download className="w-3 h-3" />
            <span>{resource.download_count.toLocaleString()}</span>
          </div>
          {resource.version && (
            <div className="text-[10px] text-[var(--text-muted)]">
              v{resource.version}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
