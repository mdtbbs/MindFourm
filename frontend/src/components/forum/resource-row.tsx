import Link from 'next/link';
import { FileArchive, Map as MapIcon, Package, User } from 'lucide-react';
import type { Resource } from '@/types';
import { markdownToPlainExcerpt } from '@/lib/markdown/excerpt';
import { formatDate } from '@/lib/utils';
import { resourceKindLabel } from '@/lib/display-labels';
import { resourceCardFacts } from '@/lib/resources/presentation';
import ResourceCardActions from './resource-card-actions';

function KindFacts({ resource }: { resource: Resource }) {
  const facts = resourceCardFacts(resource);
  if (!facts.length) return null;
  return <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
    {facts.map((fact) => <div key={fact.label} className="flex min-w-0 gap-1"><dt className="shrink-0 text-[var(--text-muted)]">{fact.label}</dt><dd className="truncate font-medium">{fact.value}</dd></div>)}
  </dl>;
}

export default function ResourceRow({ resource }: { resource: Resource }) {
  const summary = markdownToPlainExcerpt(resource.description || resource.content || '');
  const isMap = resource.resource_kind === 'map';
  const isSchematic = resource.resource_kind === 'schematic';
  const resourceHref = `/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`;
  const PreviewIcon = isMap ? MapIcon : isSchematic ? FileArchive : Package;
  const previewLabel = isMap ? '地图' : isSchematic ? '蓝图' : '资源';

  return <article className="group min-w-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-card)] transition-colors hover:border-[var(--primary)]/50">
    <div className={`relative overflow-hidden bg-[var(--bg-elevated)] ${isMap || isSchematic ? 'aspect-[16/10]' : 'aspect-[16/9]'}`}>
      <Link href={resourceHref} aria-label={`查看 ${resource.title}`} className="block h-full">
        {resource.preview_url ? <img src={resource.preview_url} alt={`${resource.title} 预览图`} className={`h-full w-full ${isMap || isSchematic ? 'object-contain' : 'object-cover'}`} /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-muted)]"><PreviewIcon className="h-9 w-9" aria-hidden /><span className="text-xs">暂无{previewLabel}预览</span></div>}
      </Link>
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">{resourceKindLabel(resource.resource_kind)}</span>
    </div>
    <div className="p-4">
      <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><Link href={resourceHref} className="block truncate text-base font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{resource.title}</Link><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">{summary || '暂无简介'}</p><KindFacts resource={resource} /></div><span className="shrink-0 text-xs text-[var(--text-muted)]">{resource.download_count.toLocaleString()} 次下载</span></div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]"><span className="inline-flex min-w-0 items-center gap-1.5 truncate"><User className="h-3.5 w-3.5 shrink-0" />{resource.username || '未知作者'}</span><time className="shrink-0">{formatDate(resource.updated_at || resource.created_at)}</time></div>
      <div className="mt-2 flex justify-end"><ResourceCardActions resourceId={resource.id} resourceHref={resourceHref} initialLiked={resource.is_liked} initialLikeCount={resource.like_count} commentCount={resource.comment_count} /></div>
    </div>
  </article>;
}
