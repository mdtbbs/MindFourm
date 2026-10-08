'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, Eye, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceDetailHref } from '@/lib/resources/resource-detail-href';
import { useI18n } from '@/i18n/provider';

type Recommendation = { resource: Resource; score: number; reasons: string[] };
type DiscoverySection = { items: Array<Recommendation & { recent_views?: number; recent_downloads?: number }>; pagination: { page: number; limit: number; items_in_window: number; more_in_window: boolean; candidate_window_size: number; candidate_window_truncated: boolean } };
type DiscoveryHome = {
  sections: {
    featured: DiscoverySection;
    trending: DiscoverySection;
    rising: DiscoverySection;
    top_rated: DiscoverySection;
    newest: DiscoverySection;
  };
};
type ForYou = { algorithm: string; personalized: boolean; privacy: string; items: Recommendation[] };

type Shelf = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  items: Recommendation[];
};

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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setHome(null);
    setForYou(null);
    const query = new URLSearchParams({ limit: '8' });
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

  const shelves = useMemo<Shelf[]>(() => {
    const result: Shelf[] = [];
    if (forYou?.items?.length) result.push({
      key: 'for-you', title: forYou.personalized ? t('recommendations.recPersonalizedTitle') : t('recommendations.recFallbackTitle'),
      description: forYou.personalized ? t('recommendations.recPersonalizedDescription') : t('recommendations.recFallbackDescription'),
      icon: <Sparkles className="h-4 w-4" />, items: forYou.items,
    });
    if (home?.sections.featured?.items?.length) result.push({ key: 'featured', title: t('recommendations.recEditorPick'), description: t('recommendations.recEditorPickDescription'), icon: <Star className="h-4 w-4" />, items: home.sections.featured.items });
    if (home?.sections.rising?.items?.length) result.push({ key: 'rising', title: t('recommendations.recRising'), description: t('recommendations.recRisingDescription'), icon: <TrendingUp className="h-4 w-4" />, items: home.sections.rising.items });
    if (home?.sections.trending?.items?.length) result.push({ key: 'trending', title: t('recommendations.recTrending'), description: t('recommendations.recTrendingDescription'), icon: <ArrowUpRight className="h-4 w-4" />, items: home.sections.trending.items });
    if (home?.sections.top_rated?.items?.length) result.push({ key: 'top-rated', title: t('recommendations.recTopRated'), description: t('recommendations.recTopRatedDescription'), icon: <Star className="h-4 w-4" />, items: home.sections.top_rated.items });
    if (home?.sections.newest?.items?.length) result.push({ key: 'newest', title: t('recommendations.recNewest'), description: t('recommendations.recNewestDescription'), icon: <ArrowUpRight className="h-4 w-4" />, items: home.sections.newest.items });
    return result;
  }, [forYou, home, t]);

  if (!shelves.length && !loading && !failed) return <section className="border border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]" aria-label={t('recommendations.recLabel')} aria-live="polite">{t('recommendations.recNone')}</section>;

  return <section className="space-y-7" aria-label={t('recommendations.recLabel')}>
    {loading && <p className="min-h-11 border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]" role="status">{t('recommendations.recLoading')}</p>}
    {failed && <p className="min-h-11 border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]" role="alert">{t('recommendations.recUnavailable')}</p>}
    {shelves.map((shelf) => <div key={shelf.key}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">{shelf.icon}{shelf.title}</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{shelf.description}</p></div>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {dedupe(shelf.items).slice(0, 8).map((item) => <ResourceDiscoveryCard key={item.resource.public_id || item.resource.id} item={item} t={t} />)}
      </div>
    </div>)}
  </section>;
}

function ResourceDiscoveryCard({ item, t }: { item: Recommendation; t: Translate }) {
  const { resource, reasons } = item;
  const detailPath = resourceDetailHref(resource);
  const tags = Array.isArray(resource.metadata?.tags) ? resource.metadata.tags.slice(0, 2) : [];
  return <Link href={detailPath} className="block min-w-[15rem] max-w-[18rem] snap-start border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)] sm:min-w-0 sm:max-w-none">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text)]">{resource.title}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{resource.resource_kind || resource.resource_type}</div></div>{Number(resource.is_featured) === 1 ? <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" /> : null}</div>
    <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{resource.description || t('cards.noSummary')}</p>
    {reasons.length ? <div className="mt-2 flex min-h-5 flex-wrap gap-1">{reasons.slice(0, 2).map((reason) => <span key={reason} title={reason} className="max-w-full truncate border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{reasonLabel(reason, t)}</span>)}</div> : <div className="mt-2 min-h-5" />}
    {tags.length ? <div className="mt-3 flex min-h-5 gap-1 overflow-hidden">{tags.map((tag) => <span key={tag} className="truncate border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{tag}</span>)}</div> : <div className="mt-3 min-h-5" />}
    <div className="mt-3 flex items-center gap-3 text-[11px] tabular-nums text-[var(--text-muted)]"><span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{Number(resource.view_count || 0)}</span><span className="inline-flex items-center gap-1"><Download className="h-3 w-3" />{Number(resource.download_count || 0)}</span></div>
  </Link>;
}

function dedupe(items: Recommendation[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.resource.public_id || item.resource.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Recommendation reason codes come from the API; the copy is ours. */
function reasonLabel(reason: string, t: Translate): string {
  const [code, value] = reason.split(':', 2);
  switch (code) {
    case 'editor_pick': return t('recommendations.recReasonEditorPick');
    case 'trending': return t('recommendations.recReasonTrending');
    case 'recent_views': return t('recommendations.recReasonRecentViews');
    case 'recent_downloads': return t('recommendations.recReasonRecentDownloads');
    case 'quality_signals': return t('recommendations.recReasonQualitySignals');
    case 'top_rated': return t('recommendations.recReasonTopRated');
    case 'newest': return t('recommendations.recReasonNewest');
    case 'top_downloaded': return t('recommendations.recReasonTopDownloaded');
    case 'same_kind': return t('recommendations.recReasonSameKind');
    case 'same_category': return t('recommendations.recReasonSameCategory');
    case 'shared_tags': return value ? t('recommendations.recReasonSharedTags', { tags: value.replaceAll(',', '、') }) : t('recommendations.recReasonSharedTagsPlain');
    case 'kind': return t('recommendations.recReasonKind');
    case 'category': return t('recommendations.recReasonCategory');
    case 'tags': return value ? t('recommendations.recReasonTags', { tags: value.replaceAll(',', '、') }) : t('recommendations.recReasonTagsPlain');
    case 'featured': return t('recommendations.recReasonFeatured');
    case 'popular_now': return t('recommendations.recReasonPopularNow');
    default: return t('recommendations.recReasonDefault');
  }
}
