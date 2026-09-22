'use client';

import { Bell, Clipboard, Download, ExternalLink, Heart, ThumbsUp } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import ReportDialog from '../../report-dialog';

export default function ResourceActions({
  resource, downloadUrl, downloadLabel, primaryVersionId, isSchematic, schematicCopied,
  favorite, favoriteCount, liked, likeCount, subscribed, busy, copied,
  onCopySchematic, onFavorite, onLike, onSubscribe, onShare,
}: {
  resource: Resource; downloadUrl: string; downloadLabel: string; primaryVersionId?: number;
  isSchematic: boolean; schematicCopied: boolean; favorite: boolean; favoriteCount: number;
  liked: boolean; likeCount: number; subscribed: boolean; busy: boolean; copied: boolean;
  onCopySchematic: () => void; onFavorite: () => void; onLike: () => void; onSubscribe: () => void; onShare: () => void;
}) {
  return <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-5">
    {resource.resource_type === 'external' && resource.external_url ? <a href={resource.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)]"><ExternalLink className="h-5 w-5" />访问资源</a> : <a href={primaryVersionId ? resourceApi.download(resource.id, primaryVersionId) : downloadUrl} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)]"><Download className="h-5 w-5" />{downloadLabel}</a>}
    {isSchematic && <button type="button" onClick={onCopySchematic} className="inline-flex items-center gap-2 rounded-md border border-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"><Clipboard className="h-5 w-5" />{schematicCopied ? '已复制蓝图' : '复制蓝图'}</button>}
    <button type="button" disabled={busy} onClick={onFavorite} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium ${favorite ? 'border-rose-300 bg-rose-500/10 text-rose-500' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-rose-500'}`}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} />{favorite ? '已收藏' : '收藏'} <span className="text-xs">{favoriteCount}</span></button>
    <button type="button" disabled={busy} onClick={onLike} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium ${liked ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)]'}`}><ThumbsUp className="h-4 w-4" />{liked ? '已点赞' : '点赞'} <span className="text-xs">{likeCount}</span></button>
    <details className="relative"><summary className="cursor-pointer list-none rounded-md border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">更多</summary><div className="absolute right-0 z-10 mt-2 grid min-w-44 gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-md">
      <button type="button" disabled={busy} onClick={onSubscribe} className="inline-flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><Bell className="h-4 w-4" />{subscribed ? '取消订阅更新' : '订阅更新'}</button>
      <button type="button" onClick={onShare} className="rounded px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">{copied ? '链接已复制' : '分享资源'}</button>
      <ReportDialog targetType="resource" targetId={resource.id} label="举报资源" />
    </div></details>
  </div>;
}
