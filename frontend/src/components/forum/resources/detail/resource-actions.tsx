'use client';

import { Clipboard, Download, ExternalLink, Heart, ThumbsUp } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import ResourceOverflowMenu from './resource-overflow-menu';

export default function ResourceActions({
  resource, downloadUrl, downloadLabel, primaryVersionId, isSchematic, schematicCopied,
  favorite, favoriteCount, liked, likeCount, subscribed, busy, copied,
  onCopySchematic, onFavorite, onLike, onSubscribe, onShare,
  canManage,
}: {
  resource: Resource; downloadUrl: string; downloadLabel: string; primaryVersionId?: number;
  isSchematic: boolean; schematicCopied: boolean; favorite: boolean; favoriteCount: number;
  liked: boolean; likeCount: number; subscribed: boolean; busy: boolean; copied: boolean;
  onCopySchematic: () => void; onFavorite: () => void; onLike: () => void; onSubscribe: () => void; onShare: () => void;
  canManage: boolean;
}) {
  return <div className="mt-7 flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--border)] pt-5">
    {resource.resource_type === 'external' && resource.external_url ? <a href={resource.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-[var(--primary)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)]"><ExternalLink className="h-5 w-5" />访问资源</a> : <a href={primaryVersionId ? resourceApi.download(resource.id, primaryVersionId) : downloadUrl} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-[var(--primary)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)]"><Download className="h-5 w-5" />{downloadLabel}</a>}
    {isSchematic && <button type="button" onClick={onCopySchematic} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"><Clipboard className="h-5 w-5" />{schematicCopied ? '已复制蓝图' : '复制蓝图'}</button>}
    <button type="button" disabled={busy} onClick={onFavorite} className={`hidden min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium sm:inline-flex ${favorite ? 'border-rose-300 bg-rose-500/10 text-rose-500' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-rose-500'}`}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} />{favorite ? '已收藏' : '收藏'} <span className="text-xs">{favoriteCount}</span></button>
    <button type="button" disabled={busy} onClick={onLike} className={`hidden min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium sm:inline-flex ${liked ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)]'}`}><ThumbsUp className="h-4 w-4" />{liked ? '已点赞' : '点赞'} <span className="text-xs">{likeCount}</span></button>
    <ResourceOverflowMenu resourceId={resource.id} canManage={canManage} subscribed={subscribed} copied={copied} busy={busy} onSubscribe={onSubscribe} onShare={onShare} favorite={favorite} favoriteCount={favoriteCount} liked={liked} likeCount={likeCount} onFavorite={onFavorite} onLike={onLike} />
  </div>;
}
