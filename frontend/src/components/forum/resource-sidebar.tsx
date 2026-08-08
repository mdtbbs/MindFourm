import Link from 'next/link';
import { Star, TrendingUp, Package } from 'lucide-react';
import { Resource } from '@/types';

interface ResourceSidebarProps {
  hotResources: Resource[];
  totalResources?: number;
  totalDownloads?: number;
}

export default function ResourceSidebar({ hotResources, totalResources, totalDownloads }: ResourceSidebarProps) {
  return (
    <div className="space-y-4">
      {/* Statistics */}
      {(totalResources !== undefined || totalDownloads !== undefined) && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[var(--text)]">
            <TrendingUp className="w-4 h-4" />
            统计
          </h3>
          <div className="space-y-2 text-sm">
            {totalResources !== undefined && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">总资源</span>
                <span className="font-semibold text-[var(--text)]">{totalResources.toLocaleString()}</span>
              </div>
            )}
            {totalDownloads !== undefined && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">总下载</span>
                <span className="font-semibold text-[var(--text)]">{totalDownloads.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hot Resources */}
      {hotResources.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[var(--text)]">
            <Package className="w-4 h-4" />
            热门资源
          </h3>
          <div className="space-y-2">
            {hotResources.slice(0, 5).map((resource, index) => (
              <Link
                key={resource.id}
                href={`/resources/${resource.id}`}
                className="flex items-start gap-2 text-xs hover:bg-[var(--bg-secondary)] rounded p-1.5 -mx-1.5 transition-colors"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded bg-[var(--primary-light)] text-[var(--primary)] flex items-center justify-center font-semibold text-xs">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text)] line-clamp-1">{resource.title}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[var(--text-muted)]">
                    <span className="flex items-center gap-0.5">
                      <Download className="w-3 h-3" />
                      {resource.download_count.toLocaleString()}
                    </span>
                    {resource.rating_average && resource.rating_average > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        {resource.rating_average.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Download({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
