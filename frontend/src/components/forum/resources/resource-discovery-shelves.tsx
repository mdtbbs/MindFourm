'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, Eye, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { Resource } from '@/types';

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
      key: 'for-you', title: forYou.personalized ? '猜你喜欢' : '现在值得看看',
      description: forYou.personalized ? '根据你在 MDTBBS 的资源收藏和点赞生成，可解释且只使用站内资源互动。' : '还没有足够的个人偏好数据，先展示近期趋势资源。',
      icon: <Sparkles className="h-4 w-4" />, items: forYou.items,
    });
    if (home?.sections.featured?.items?.length) result.push({ key: 'featured', title: '编辑精选', description: '由社区运营挑选的高质量资源。', icon: <Star className="h-4 w-4" />, items: home.sections.featured.items });
    if (home?.sections.rising?.items?.length) result.push({ key: 'rising', title: '近期上升', description: '最近 7 天浏览与完成下载增长较快的资源。', icon: <TrendingUp className="h-4 w-4" />, items: home.sections.rising.items });
    if (home?.sections.trending?.items?.length) result.push({ key: 'trending', title: '热门资源', description: '综合浏览、下载、评分与更新时间排序。', icon: <ArrowUpRight className="h-4 w-4" />, items: home.sections.trending.items });
    if (home?.sections.top_rated?.items?.length) result.push({ key: 'top-rated', title: '评分榜', description: '按平滑后的用户评分排序。', icon: <Star className="h-4 w-4" />, items: home.sections.top_rated.items });
    if (home?.sections.newest?.items?.length) result.push({ key: 'newest', title: '最新发布', description: '最近发布的公开资源。', icon: <ArrowUpRight className="h-4 w-4" />, items: home.sections.newest.items });
    return result;
  }, [forYou, home]);

  if (!shelves.length && !loading && !failed) return <section className="border border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]" aria-label="资源推荐" aria-live="polite">目前还没有可推荐的公开资源。</section>;

  return <section className="space-y-7" aria-label="资源推荐">
    {loading && <p className="min-h-11 border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]" role="status">正在加载资源推荐…</p>}
    {failed && <p className="min-h-11 border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]" role="alert">暂时无法加载资源推荐，请稍后重试。</p>}
    {shelves.map((shelf) => <div key={shelf.key}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">{shelf.icon}{shelf.title}</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{shelf.description}</p></div>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {dedupe(shelf.items).slice(0, 8).map((item) => <ResourceDiscoveryCard key={item.resource.public_id || item.resource.id} item={item} />)}
      </div>
    </div>)}
  </section>;
}

function ResourceDiscoveryCard({ item }: { item: Recommendation }) {
  const { resource, reasons } = item;
  const id = resource.public_id || String(resource.id);
  const tags = Array.isArray(resource.metadata?.tags) ? resource.metadata.tags.slice(0, 2) : [];
  return <Link href={`/resources/${encodeURIComponent(id)}`} className="block min-w-[15rem] max-w-[18rem] snap-start border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)] sm:min-w-0 sm:max-w-none">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text)]">{resource.title}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{resource.resource_kind || resource.resource_type}</div></div>{Number(resource.is_featured) === 1 ? <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" /> : null}</div>
    <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{resource.description || '暂无简介'}</p>
    {reasons.length ? <div className="mt-2 flex min-h-5 flex-wrap gap-1">{reasons.slice(0, 2).map((reason) => <span key={reason} title={reason} className="max-w-full truncate border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{reasonLabel(reason)}</span>)}</div> : <div className="mt-2 min-h-5" />}
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

function reasonLabel(reason: string): string {
  const [code, value] = reason.split(':', 2);
  switch (code) {
    case 'editor_pick': return '社区精选';
    case 'trending': return '近期热门';
    case 'recent_views': return '近期浏览';
    case 'recent_downloads': return '近期下载';
    case 'quality_signals': return '综合表现';
    case 'top_rated': return '评分较高';
    case 'newest': return '最新发布';
    case 'top_downloaded': return '下载量领先';
    case 'same_kind': return '相同资源类型';
    case 'same_category': return '相同主题';
    case 'shared_tags': return value ? `共同标签：${value.replaceAll(',', '、')}` : '共同标签';
    case 'kind': return '偏好资源类型';
    case 'category': return '偏好主题';
    case 'tags': return value ? `偏好标签：${value.replaceAll(',', '、')}` : '偏好标签';
    case 'featured': return '社区精选';
    case 'popular_now': return '近期热门';
    default: return '推荐';
  }
}
