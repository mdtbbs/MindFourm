'use client';

import Link from 'next/link';
import { Resource } from '@/types';
import { Download, Star } from 'lucide-react';

interface HotResourcesProps {
  resources: Resource[];
}

export default function HotResources({ resources }: HotResourcesProps) {
  if (resources.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
        热门资源
      </h2>
      <ul className="space-y-2">
        {resources.map((resource, index) => (
          <li key={resource.id}>
            <Link
              href={`/resources/${resource.id}`}
              className="group flex items-start gap-3 rounded-[var(--radius-sm)] p-2 transition-colors hover:bg-[var(--bg-elevated)]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-semibold text-[var(--primary)]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text)] group-hover:text-[var(--primary)]">
                  {resource.title}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    {resource.download_count}
                  </span>
                  {(resource.rating_average ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {(resource.rating_average ?? 0).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
