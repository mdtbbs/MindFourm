'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Blocks, Download, Eye, FileArchive, Map as MapIcon, Package, Sparkles, Star, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceDetailHref } from '@/lib/resources/resource-detail-href';
import { resourceKindLabel } from '@/lib/display-labels';
import { useI18n } from '@/i18n/provider';

export type Recommendation = { resource: Resource; score: number; reasons: string[] };
type DiscoverySection = { items: Recommendation[] };
type DiscoveryHome = { sections: { featured: DiscoverySection; trending: DiscoverySection; rising: DiscoverySection; top_rated: DiscoverySection; newest: DiscoverySection } };
type ForYou = { personalized: boolean; items: Recommendation[] };

export type ShelfKey = 'for-you' | 'featured' | 'rising' | 'trending' | 'top-rated' | 'newest';
export type DiscoveryShelf = { key: ShelfKey; items: Recommendation[] };

const SHELF_COPY: Record<ShelfKey, { title: string; description: string; Icon: LucideIcon }> = {
  'for-you': { title: 'resourceDiscovery.forYou', description: 'resourceDiscovery.forYouDescription', Icon: Sparkles },
  featured: { title: 'resourceDiscovery.featured', description: 'resourceDiscovery.featuredDescription', Icon: Star },
  rising: { title: 'resourceDiscovery.rising', description: 'resourceDiscovery.risingDescription', Icon: TrendingUp },
  trending: { title: 'resourceDiscovery.trending', description: 'resourceDiscovery.trendingDescription', Icon: ArrowUpRight },
  'top-rated': { title: 'resourceDiscovery.topRated', description: 'resourceDiscovery.topRatedDescription', Icon: Star },
  newest: { title: 'resourceDiscovery.newest', description: 'resourceDiscovery.newestDescription', Icon: ArrowUpRight },
};

/** Cards per shelf. The full, filterable list is one scroll below this panel. */
export const SHELF_ITEMS = 4;

function dedupe(items: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.resource.public_id || item.resource.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Shapes the two discovery payloads into the tabs this panel renders.
 *
 * Order answers "what is most worth showing first", empty shelves are dropped,
 * and an anonymous `for-you` is folded into `trending`: the API answers both with
 * the same `resource-trending-v1` ranking, so two tabs of identical rows would
 * only imply a difference that is not there.
 */
export function buildDiscoveryShelves(home: DiscoveryHome | null, forYou: ForYou | null): DiscoveryShelf[] {
  const shelves: DiscoveryShelf[] = [];
  const push = (key: ShelfKey, items?: Recommendation[]) => {
    const picked = dedupe(items || []).slice(0, SHELF_ITEMS);
    if (picked.length) shelves.push({ key, items: picked });
  };

  if (forYou?.personalized) push('for-you', forYou.items);
  push('featured', home?.sections.featured?.items);
  push('trending', home?.sections.trending?.items?.length ? home.sections.trending.items : forYou?.personalized ? [] : forYou?.items);
  push('rising', home?.sections.rising?.items);
  push('top-rated', home?.sections.top_rated?.items);
  push('newest', home?.sections.newest?.items);
  return shelves;
}

function unwrap<T>(payload: any): T {
  if (payload && typeof payload === 'object' && payload.success === true && payload.data !== undefined) return payload.data as T;
  if (payload && typeof payload === 'object' && payload.data !== undefined && payload.meta !== undefined) return payload.data as T;
  return payload as T;
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return unwrap<T>(await response.json());
}

export default function ResourceDiscoveryShelves({ kind }: { kind?: string }) {
  const { t } = useI18n();
  const [home, setHome] = useState<DiscoveryHome | null>(null);
  const [forYou, setForYou] = useState<ForYou | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeKey, setActiveKey] = useState<ShelfKey | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setHome(null);
    setForYou(null);
    setActiveKey(null);
    const query = new URLSearchParams({ limit: String(SHELF_ITEMS) });
    if (kind) query.set('kind', kind);
    Promise.allSettled([
      getJson<DiscoveryHome>(`/api/v1/resources/discovery/home?${query.toString()}`, controller.signal),
      getJson<ForYou>(`/api/v1/resources/discovery/for-you?${query.toString()}`, controller.signal),
    ]).then(([homeResult, recommendations]) => {
      if (controller.signal.aborted) return;
      const homeLoaded = homeResult.status === 'fulfilled';
      const recommendationsLoaded = recommendations.status === 'fulfilled';
      if (homeLoaded) setHome(homeResult.value);
      if (recommendationsLoaded) setForYou(recommendations.value);
      setFailed(!homeLoaded && !recommendationsLoaded);
      setLoading(false);
    });
    return () => controller.abort();
  }, [kind]);

  const shelves = useMemo(() => buildDiscoveryShelves(home, forYou), [home, forYou]);
  const active = shelves.find((shelf) => shelf.key === activeKey) || shelves[0];

  const selectTab = useCallback((key: ShelfKey, index: number, focus: boolean) => {
    setActiveKey(key);
    if (focus) tabRefs.current[index]?.focus();
  }, []);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? shelves.length - 1 : step ? (index + step + shelves.length) % shelves.length : -1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(shelves[next].key, next, true);
  };

  if (!active) {
    const message = loading ? t('resourceDiscovery.loading') : failed ? t('resourceDiscovery.failed') : t('resourceDiscovery.empty');
    return <p className="mb-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-muted)]" role={failed ? 'alert' : 'status'}>{message}</p>;
  }

  const { Icon: ActiveIcon, title, description } = SHELF_COPY[active.key];

  return <section className="mb-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)]" aria-label={t('resourceDiscovery.title')}>
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-2" role="tablist" aria-label={t('resourceDiscovery.title')}>
      {shelves.map((shelf, index) => {
        const selected = shelf.key === active.key;
        return <button key={shelf.key} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`resource-shelf-tab-${shelf.key}`} aria-selected={selected} aria-controls={selected ? `resource-shelf-${shelf.key}` : undefined} tabIndex={selected ? 0 : -1} onClick={() => selectTab(shelf.key, index, false)} onKeyDown={(event) => onTabKeyDown(event, index)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${selected ? 'border-[var(--primary)] font-medium text-[var(--primary-text)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'}`}>
          {t(SHELF_COPY[shelf.key].title)}
        </button>;
      })}
    </div>
    <div id={`resource-shelf-${active.key}`} role="tabpanel" aria-labelledby={`resource-shelf-tab-${active.key}`} className="p-4">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <ActiveIcon aria-hidden className="h-4 w-4 shrink-0 text-[var(--primary-text)]" />
        <h2 className="shrink-0 text-sm font-semibold text-[var(--text)]">{t(title)}</h2>
        <p className="min-w-0 truncate text-xs text-[var(--text-muted)]" title={t(description)}>{t(description)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {active.items.map((item) => <ResourceDiscoveryCard key={item.resource.public_id || item.resource.id} resource={item.resource} />)}
      </div>
      <a href="#resource-browse" className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--primary-text)]">{t('resourceDiscovery.browseAll')}<ArrowUpRight aria-hidden className="h-3 w-3" /></a>
    </div>
  </section>;
}

const KIND_ICONS: Record<string, LucideIcon> = { map: MapIcon, schematic: FileArchive, development_tool: Blocks };

function ResourceDiscoveryCard({ resource }: { resource: Resource }) {
  const { t } = useI18n();
  const kind = resource.resource_kind || resource.resource_type || 'other';
  const translatedKind = t(`resources.kinds.${kind}`);
  const kindLabel = translatedKind === `resources.kinds.${kind}` ? resourceKindLabel(kind) : translatedKind;
  const KindIcon = KIND_ICONS[kind] || Package;
  const isPreview = kind === 'map' || kind === 'schematic';

  return <Link href={resourceDetailHref(resource)} className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] transition-colors hover:border-[var(--primary)]">
    <span className="relative block aspect-[16/10] overflow-hidden bg-[var(--bg-elevated)]">
      {resource.preview_url
        ? <img src={resource.preview_url} alt="" loading="lazy" className={`h-full w-full transition-[scale] duration-[var(--motion-normal)] group-hover:scale-[1.015] motion-reduce:scale-100 ${isPreview ? 'object-contain' : 'object-cover'}`} />
        : <span className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><KindIcon aria-hidden className="h-7 w-7" /></span>}
      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">{kindLabel}</span>
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-2 p-3">
      <span className="line-clamp-2 text-sm font-medium leading-[1.35] text-[var(--text)] transition-colors group-hover:text-[var(--primary-text)]">{resource.title}</span>
      <span className="mt-auto flex min-w-0 items-center gap-3 text-[11px] tabular-nums text-[var(--text-muted)]">
        <span className="inline-flex shrink-0 items-center gap-1"><Download aria-hidden className="h-3 w-3" />{Number(resource.download_count || 0)}</span>
        <span className="inline-flex shrink-0 items-center gap-1"><Eye aria-hidden className="h-3 w-3" />{Number(resource.view_count || 0)}</span>
      </span>
    </span>
  </Link>;
}
