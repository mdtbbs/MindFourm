'use client';

import { Clipboard, Download, ExternalLink, Heart, ThumbsUp } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import ResourceOverflowMenu from './resource-overflow-menu';
import { useI18n } from '@/i18n/provider';

export function ResourcePrimaryAction({
  resource, downloadUrl, downloadLabel, primaryVersionId, className = '',
}: {
  resource: Resource; downloadUrl: string; downloadLabel: string; primaryVersionId?: number; className?: string;
}) {
  const { t } = useI18n();
  return resource.resource_type === 'external' && resource.external_url
    ? <a href={resource.external_url} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--primary-button)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)] ${className}`}><ExternalLink className="h-5 w-5" />{t('resourceActions.visit')}</a>
    : <a href={primaryVersionId ? resourceApi.download(resource.id, primaryVersionId) : downloadUrl} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--primary-button)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)] ${className}`}><Download className="h-5 w-5" />{downloadLabel}</a>;
}

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
  const { t } = useI18n();
  const isMap = resource.resource_kind === 'map';
  return <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex min-w-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 shadow-[var(--shadow-modal)] lg:static lg:mt-7 lg:flex-wrap lg:border-t lg:bg-transparent lg:px-0 lg:py-5 lg:shadow-none">
    <ResourcePrimaryAction resource={resource} downloadUrl={downloadUrl} downloadLabel={downloadLabel} primaryVersionId={primaryVersionId} className={`w-auto shrink-0 ${isMap ? 'lg:hidden' : ''}`} />
    {isSchematic && <button type="button" onClick={onCopySchematic} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-soft)]"><Clipboard className="h-5 w-5" />{schematicCopied ? t('resourceActions.schematicCopied') : t('resourceActions.copySchematic')}</button>}
    <button type="button" disabled={busy} onClick={onFavorite} className={`hidden min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium sm:inline-flex ${favorite ? 'border-rose-300 bg-rose-500/10 text-rose-500' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-rose-500'}`}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} />{favorite ? t('resourceActions.favorited') : t('resourceActions.favorite')} <span className="text-xs">{favoriteCount}</span></button>
    <button type="button" disabled={busy} onClick={onLike} className={`hidden min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium sm:inline-flex ${liked ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary-text)]'}`}><ThumbsUp className="h-4 w-4" />{liked ? t('resourceActions.liked') : t('resourceActions.like')} <span className="text-xs">{likeCount}</span></button>
    <ResourceOverflowMenu resourceId={resource.id} canManage={canManage} subscribed={subscribed} copied={copied} busy={busy} onSubscribe={onSubscribe} onShare={onShare} favorite={favorite} favoriteCount={favoriteCount} liked={liked} likeCount={likeCount} onFavorite={onFavorite} onLike={onLike} />
  </div>;
}
