'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Box, ChevronDown, FilePlus2, Map, PackagePlus, Plus, Shapes } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export default function CreateMenu({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const entries = [
    { href: '/posts/new', label: t('create.post'), description: t('create.postDescription'), icon: FilePlus2 },
    { href: '/resources/submit?resource_kind=mod', label: t('create.mod'), description: t('create.modDescription'), icon: PackagePlus },
    { href: '/resources/submit/map', label: t('create.map'), description: t('create.mapDescription'), icon: Map },
    { href: '/resources/submit/schematic', label: t('create.schematic'), description: t('create.schematicDescription'), icon: Shapes },
    { href: '/resources/submit', label: t('create.otherResource'), description: t('create.otherResourceDescription'), icon: Box },
  ];

  const closeMenu = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      const candidates = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="dialog"] button:not([disabled]), [role="dialog"] a[href]') || []);
      candidates.find((candidate) => candidate.getClientRects().length > 0)?.focus();
    });
    const closeOnOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) closeMenu(false);
    };
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return; }
      if (event.key !== 'Tab' || !root.current) return;
      const focusable = Array.from(root.current.querySelectorAll<HTMLElement>('[role="dialog"] button:not([disabled]):not([tabindex="-1"]), [role="dialog"] a[href]'))
        .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', handleKeys);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', handleKeys);
    };
  }, [closeMenu, open]);

  return <div className="relative" ref={root}>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="global-create-menu" aria-label={t('create.title')} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-2 bg-[var(--primary-button)] px-3 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2">
      <Plus className="h-4 w-4" aria-hidden="true" /><span>{t('create.title')}</span><ChevronDown className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
    </button>
    {open && <>
      <button type="button" tabIndex={-1} aria-label={t('common.close')} className="fixed inset-0 z-[70] bg-black/40 lg:hidden" onClick={() => closeMenu(false)} />
      <section id="global-create-menu" role="dialog" aria-modal="true" aria-labelledby="create-menu-title" className="fixed inset-x-0 bottom-0 z-[71] max-h-[min(82dvh,38rem)] overflow-y-auto border-t border-[var(--border)] bg-[var(--bg-card)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-[var(--shadow-modal)] lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-full lg:mt-2 lg:w-80 lg:max-h-[75vh] lg:border lg:p-2">
        <div className="mb-2 flex items-center justify-between px-2 lg:px-3">
          <div><h2 id="create-menu-title" className="text-sm font-semibold text-[var(--text)]">{t('create.title')}</h2><p className="mt-0.5 text-xs text-[var(--text-muted)]">{t('create.description')}</p></div>
          <button type="button" onClick={() => closeMenu()} className="min-h-11 min-w-11 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] lg:hidden">{t('common.close')}</button>
        </div>
        {isAuthenticated ? <div className="grid gap-1">{entries.map(({ href, label, description, icon: Icon }) => <Link key={href} href={href} onClick={() => closeMenu(false)} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"><Icon className="h-4 w-4 shrink-0 text-[var(--primary-text)]" aria-hidden="true" /><span className="min-w-0"><span className="block text-sm font-medium text-[var(--text)]">{label}</span><span className="block truncate text-xs text-[var(--text-muted)]">{description}</span></span></Link>)}</div>
          : <div className="border-t border-[var(--border)] px-3 py-4 text-sm text-[var(--text-secondary)]"><p>{t('create.loginRequired')}</p><Link href="/login?redirect=%2Fposts%2Fnew" onClick={() => closeMenu(false)} className="mt-3 inline-flex min-h-11 items-center bg-[var(--primary-button)] px-4 font-medium text-white hover:bg-[var(--primary-dark)]">{t('navigation.login')}</Link></div>}
      </section>
    </>}
  </div>;
}
