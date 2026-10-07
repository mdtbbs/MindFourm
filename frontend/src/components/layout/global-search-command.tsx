'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Command, LoaderCircle, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { fetchV1 } from '@/lib/api/v1/transport';
import { searchFeatureRegistry, type FeatureGroup } from '@/lib/navigation/feature-registry';
import { useI18n } from '@/i18n/provider';

type SearchPayload = {
  groups: {
    users: Array<{ id: number; username: string; bio: string | null }>;
    posts: Array<{ id: number; title: string; excerpt?: string; category_name?: string | null }>;
    resources: Array<{ id: number; public_id?: string; title: string; description?: string | null; resource_kind?: string | null; resource_type?: string }>;
    servers: Array<{ id: number; public_id: string; name: string; description?: string | null; status?: string }>;
  };
};

type CommandItem = { id: string; href: string; title: string; description?: string | null; group: string };
const EMPTY_RESULTS: SearchPayload = { groups: { users: [], posts: [], resources: [], servers: [] } };
const GROUP_KEYS: Record<FeatureGroup, string> = {
  navigation: 'searchCommand.navigation', tools: 'searchCommand.features', resources: 'searchCommand.features',
  multiplayer: 'searchCommand.features', account: 'searchCommand.features', developer: 'searchCommand.features',
};

export default function GlobalSearchCommand({ open, onClose, onOpenChange }: { open: boolean; onClose: () => void; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPayload>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);

  const features = useMemo(() => searchFeatureRegistry(query, { isAdmin: user?.role === 'admin', limit: 8 }), [query, user?.role]);
  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];
    for (const feature of features) result.push({ id: `feature:${feature.id}`, href: feature.href, title: t(feature.titleKey), description: t(feature.descriptionKey), group: t(GROUP_KEYS[feature.group]) });
    for (const resource of searchResults.groups.resources) result.push({ id: `resource:${resource.id}`, href: `/resources/${resource.public_id || resource.id}`, title: resource.title, description: resource.description, group: t('searchCommand.resources') });
    for (const post of searchResults.groups.posts) result.push({ id: `post:${post.id}`, href: `/posts/${post.id}`, title: post.title, description: post.excerpt || post.category_name, group: t('searchCommand.posts') });
    for (const member of searchResults.groups.users) result.push({ id: `user:${member.id}`, href: `/users/${member.id}`, title: member.username, description: member.bio, group: t('searchCommand.users') });
    for (const server of searchResults.groups.servers) result.push({ id: `server:${server.id}`, href: '/servers', title: server.name, description: server.description || server.status, group: t('searchCommand.servers') });
    if (query.trim()) result.push({ id: 'search-all', href: `/search?q=${encodeURIComponent(query.trim())}`, title: t('searchCommand.searchAll', { query: query.trim() }), description: t('searchCommand.searchAllDescription'), group: t('searchCommand.allResults') });
    return result;
  }, [features, query, searchResults, t]);

  const close = useCallback(() => {
    onClose();
    setQuery('');
    setSearchResults(EMPTY_RESULTS);
    setFailed(false);
    setActiveIndex(0);
  }, [onClose]);

  useEffect(() => {
    const openWithShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = Boolean(target?.closest('input,textarea,select,[contenteditable="true"]'));
      if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !isEditable && !event.metaKey && !event.ctrlKey && !event.altKey)) {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', openWithShortcut);
    return () => window.removeEventListener('keydown', openWithShortcut);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => input.current?.focus());
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'Tab' && dialog.current) {
        const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled]),a[href]'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeys);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults(EMPTY_RESULTS);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), type: 'all', limit: '4', page: '1', sort: 'relevance' });
      void fetchV1<SearchPayload>(`/search?${params}`, { signal: controller.signal })
        .then((results) => { if (sequence === requestSequence.current) setSearchResults({ ...EMPTY_RESULTS, ...results, groups: { ...EMPTY_RESULTS.groups, ...results.groups } }); })
        .catch(() => { if (!controller.signal.aborted && sequence === requestSequence.current) setFailed(true); })
        .finally(() => { if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  useEffect(() => { setActiveIndex(0); }, [query, searchResults]);

  const activate = (item: CommandItem) => {
    close();
    if (item.href.startsWith('/api/')) window.location.assign(item.href);
    else router.push(item.href);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => Math.min(items.length - 1, current + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => Math.max(0, current - 1)); }
    if (event.key === 'Home' && items.length) { event.preventDefault(); setActiveIndex(0); }
    if (event.key === 'End' && items.length) { event.preventDefault(); setActiveIndex(items.length - 1); }
    if (event.key === 'Enter' && items[activeIndex]) { event.preventDefault(); activate(items[activeIndex]); }
  };

  if (!open) return null;
  const grouped = new Map<string, CommandItem[]>();
  items.forEach((item) => grouped.set(item.group, [...(grouped.get(item.group) || []), item]));
  let index = -1;

  return <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 px-3 pb-[env(safe-area-inset-bottom)] pt-[min(12vh,5rem)] sm:px-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="global-search-title" className="w-full max-w-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-modal)]">
      <h2 id="global-search-title" className="sr-only">{t('searchCommand.title')}</h2>
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
        <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        <input ref={input} type="search" role="combobox" aria-autocomplete="list" aria-keyshortcuts="Control+K Meta+K" aria-expanded={query.trim().length >= 2 && items.length > 0} aria-controls="global-search-results" aria-activedescendant={items[activeIndex] ? `global-search-option-${items[activeIndex].id.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleInputKeyDown} aria-label={t('searchCommand.inputLabel')} placeholder={t('searchCommand.placeholder')} className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]" />
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-[var(--text-muted)]" aria-label={t('common.loading')} /> : <kbd className="hidden items-center gap-1 border border-[var(--border)] px-1.5 py-1 text-[10px] text-[var(--text-muted)] sm:inline-flex"><Command className="h-3 w-3" /> K</kbd>}
        <button type="button" onClick={close} className="min-h-11 min-w-11 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">{t('common.close')}</button>
      </div>
      <div className="max-h-[min(65dvh,34rem)] overflow-y-auto p-2" aria-live="polite" aria-busy={loading}>
        {failed && <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-[var(--text-secondary)]"><span>{t('searchCommand.error')}</span><button type="button" onClick={() => { const current = query; setQuery(''); window.setTimeout(() => setQuery(current), 0); }} className="min-h-11 px-3 text-[var(--primary)]">{t('common.retry')}</button></div>}
        {query.trim().length < 2 ? <p className="px-3 py-4 text-sm text-[var(--text-muted)]">{t('searchCommand.hint')}</p> : items.length ? <div id="global-search-results" role="listbox" aria-label={t('searchCommand.categoriesHint')}>
          {Array.from(grouped.entries()).map(([group, groupItems]) => <section key={group} role="group" aria-label={group} className="mb-2 last:mb-0">
            <h3 className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--text-muted)]">{group}</h3>
            {groupItems.map((item) => {
              index += 1;
              const itemIndex = index;
              const active = activeIndex === itemIndex;
              const optionId = `global-search-option-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              return <div key={item.id} id={optionId} role="option" aria-selected={active} onMouseMove={() => setActiveIndex(itemIndex)} onClick={() => activate(item)} className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] ${active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--text)]">{item.title}</span>{item.description && <span className="block truncate text-xs text-[var(--text-muted)]">{item.description}</span>}</span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              </div>;
            })}
          </section>)}
        </div> : <p className="px-3 py-5 text-sm text-[var(--text-muted)]">{t('searchCommand.noResults')}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]"><span>{t('searchCommand.categoriesHint')}</span><span>{t('searchCommand.keyboardHint')}</span></div>
    </div>
  </div>;
}
