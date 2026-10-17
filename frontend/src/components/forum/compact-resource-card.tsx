import Link from 'next/link';
import { Blocks, FileArchive, Map as MapIcon, Package } from 'lucide-react';
import { resourceKindLabel } from '@/lib/display-labels';
import SearchHighlight from './search-highlight';

export interface CompactResource {
  id: number;
  title: string;
  slug?: string | null;
  resource_kind?: string | null;
  version?: string | null;
  description?: string | null;
  preview_url?: string | null;
  author_name?: string | null;
  username?: string | null;
  category_name?: string | null;
}

export default function CompactResourceCard({ resource, highlightTerm }: { resource: CompactResource; highlightTerm?: string }) {
  const isMap = resource.resource_kind === 'map';
  const isSchematic = resource.resource_kind === 'schematic';
  const Icon = isMap ? MapIcon : isSchematic ? FileArchive : ['development_tool', 'server_plugin'].includes(resource.resource_kind || '') ? Blocks : Package;
  const href = `/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`;

  return <Link href={href} className="group flex min-w-0 items-center gap-3 border-b border-[var(--border)] px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--bg-hover)] sm:px-4">
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] bg-[var(--bg-elevated)] text-[var(--primary-text)]">
      {resource.preview_url ? <img src={resource.preview_url} alt="" loading="lazy" className={`h-full w-full ${isMap || isSchematic ? 'object-contain' : 'object-cover'}`} /> : <Icon aria-hidden="true" className="h-5 w-5" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="truncate text-sm font-semibold text-[var(--text)] group-hover:text-[var(--primary-text)]">{highlightTerm ? <SearchHighlight text={resource.title} query={highlightTerm} /> : resource.title}</span>
        <span className="shrink-0 text-xs text-[var(--text-muted)]">{resourceKindLabel(resource.resource_kind)}</span>
      </span>
      {resource.description && <span className="mt-1 block line-clamp-1 text-xs text-[var(--text-secondary)]">{highlightTerm ? <SearchHighlight text={resource.description} query={highlightTerm} /> : resource.description}</span>}
      <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">{[resource.version ? `资源版本 ${resource.version}` : null, resource.category_name, resource.author_name || resource.username].filter(Boolean).join(' · ') || '查看资源详情'}</span>
    </span>
  </Link>;
}
