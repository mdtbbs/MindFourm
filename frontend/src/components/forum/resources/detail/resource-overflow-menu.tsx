'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Bell, Heart, MoreHorizontal, Pencil, Share2, ThumbsUp } from 'lucide-react';
import ReportDialog from '../../report-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionTokens } from '@/lib/motion';
import { useI18n } from '@/i18n/provider';

export default function ResourceOverflowMenu({
  resourceId, canManage, subscribed, copied, busy, onSubscribe, onShare,
  favorite, favoriteCount, liked, likeCount, onFavorite, onLike,
}: {
  resourceId: number; canManage: boolean; subscribed: boolean; copied: boolean; busy: boolean;
  onSubscribe: () => void; onShare: () => void;
  favorite: boolean; favoriteCount: number; liked: boolean; likeCount: number; onFavorite: () => void; onLike: () => void;
}) {
  const { t } = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

  const place = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    const popup = menu.current?.getBoundingClientRect();
    if (!anchor || !popup) return;
    const margin = 8;
    const left = Math.max(margin, Math.min(anchor.right - popup.width, window.innerWidth - popup.width - margin));
    const below = anchor.bottom + margin;
    const top = below + popup.height <= window.innerHeight - margin
      ? below : Math.max(margin, anchor.top - popup.height - margin);
    setPosition({ top, left, ready: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const closeOnPointer = (event: PointerEvent) => {
      if (trigger.current?.contains(event.target as Node) || menu.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items?.length) return;
        const index = [...items].indexOf(document.activeElement as HTMLElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  const itemClass = 'flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]';
  return <>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('resourceOverflow.moreAria')} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
      <MoreHorizontal className="h-4 w-4" /><span>{t('resourceOverflow.more')}</span>
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <motion.div ref={menu} role="menu" aria-label={t('resourceOverflow.menuAria')} style={{ position: 'fixed', top: position.top, left: position.left, visibility: position.ready ? 'visible' : 'hidden' }} className="z-50 grid min-w-52 gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-lg" initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.985 }} transition={{ duration: reduceMotion ? 0 : motionTokens.fast, ease: motionTokens.easing }}>
        <button role="menuitem" type="button" disabled={busy} onClick={onFavorite} className={`${itemClass} sm:hidden`}><Heart className={`h-4 w-4 ${favorite ? 'fill-current text-rose-500' : ''}`} />{favorite ? t('resourceOverflow.favorited') : t('resourceOverflow.favorite')} · {favoriteCount}</button>
        <button role="menuitem" type="button" disabled={busy} onClick={onLike} className={`${itemClass} sm:hidden`}><ThumbsUp className="h-4 w-4" />{liked ? t('resourceOverflow.liked') : t('resourceOverflow.like')} · {likeCount}</button>
        <button role="menuitem" type="button" disabled={busy} onClick={onSubscribe} className={itemClass}><Bell className="h-4 w-4" />{subscribed ? t('resourceOverflow.unsubscribe') : t('resourceOverflow.subscribe')}</button>
        <button role="menuitem" type="button" onClick={onShare} className={itemClass}><Share2 className="h-4 w-4" />{copied ? t('resourceOverflow.copied') : t('resourceOverflow.share')}</button>
        {canManage && <Link role="menuitem" href={`/resources/${resourceId}/edit`} onClick={() => setOpen(false)} className={itemClass}><Pencil className="h-4 w-4" />{t('resourceOverflow.edit')}</Link>}
        <ReportDialog targetType="resource" targetId={resourceId} triggerRole="menuitem" />
      </motion.div>, document.body,
    )}
  </>;
}
