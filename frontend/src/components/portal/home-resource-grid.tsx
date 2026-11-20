import Link from 'next/link';
import { Blocks, FileArchive, Map as MapIcon, Package } from 'lucide-react';
import { resourceKindLabel } from '@/lib/display-labels';
import type { CompactResource } from '@/components/forum/compact-resource-card';

export default function HomeResourceGrid({ resources }: { resources: CompactResource[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {resources.map((resource) => {
        const isMap = resource.resource_kind === 'map';
        const isSchematic = resource.resource_kind === 'schematic';
        const Icon = isMap
          ? MapIcon
          : isSchematic
            ? FileArchive
            : ['development_tool', 'server_plugin'].includes(resource.resource_kind || '')
              ? Blocks
              : Package;
        const href = `/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`;
        const kindText = resourceKindLabel(resource.resource_kind);

        return (
          <Link
            key={resource.id}
            href={href}
            className="group relative flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] transition-all duration-[var(--motion-fast)] hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              {resource.preview_url ? (
                <img
                  src={resource.preview_url}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full transition-transform duration-[var(--motion-normal)] group-hover:scale-[1.03] ${isMap || isSchematic ? 'object-contain p-2' : 'object-cover'}`}
                />
              ) : (
                <div className="industrial-grid-bg flex h-full w-full items-center justify-center text-[var(--primary-text)]">
                  <Icon aria-hidden="true" className="h-8 w-8 opacity-75" />
                </div>
              )}
              <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
                {resource.category_name ? (
                  <span className="truncate border border-[var(--border)] bg-[var(--bg-card)]/90 px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                    {resource.category_name}
                  </span>
                ) : <span />}
                <span className="shrink-0 border border-[var(--industrial-accent)]/40 bg-[var(--bg-card)]/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--industrial-accent)]">
                  {kindText}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
              <div>
                <h3 className="truncate text-[15px] font-semibold leading-5 text-[var(--text)] group-hover:text-[var(--primary-text)]">
                  {resource.title}
                </h3>
                <p className="mt-1.5 line-clamp-2 min-h-[2.25rem] text-xs leading-[1.125rem] text-[var(--text-secondary)]">
                  {resource.description || '点击查看资源详情、版本更新与下载说明。'}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-light)] pt-2.5 font-mono text-[11px] text-[var(--text-muted)]">
                <span className="truncate">by {resource.author_name || resource.username || '匿名作者'}</span>
                {resource.version && (
                  <span className="shrink-0 border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    v{resource.version}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
