'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, Eye, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { Resource } from '@/types';

type Recommendation = { resource: Resource; score: number; reasons: string[] };
type DiscoveryHome = {
  sections: {
    featured: Resource[];
    trending: Resource[];
    rising: Array<Resource & { recent_views?: number; recent_downloads?: number }>;
    top_rated: Resource[];
    newest: Resource[];
  };
};
type ForYou = { algorithm: string; personalized: boolean; privacy: string; items: Recommendation[] };

type Shelf = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  resources: Resource[];
};

function unwrap<T>(payload: any): T {
  if (payload && typeof payload === 'object' && payload.success === true && payload.data !== undefined) return payload.data as T;
  if (payload && typeof payload === 'object' && payload.data !== undefined && payload.meta !== undefined) return payload.data as T;
  return payload as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return unwrap<T>(await response.json());
}

export default function ResourceDiscoveryShelves({ kind }: { kind?: string }) {
  const [home, setHome] = useState<DiscoveryHome | null>(null);
  const [forYou, setForYou] = useState<ForYou | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: '8' });
    if (kind) query.set('kind', kind);
    Promise.allSettled([
      getJson<DiscoveryHome>(`/api/v1/resources/discovery/home?${query.toString()}`),
      getJson<ForYou>(`/api/v1/resources/discovery/for-you?${query.toString()}`),
    ]).then(([homeResult, recommendations]) => {
      if (controller.signal.aborted) return;
      if (homeResult.status === 'fulfilled') setHome(homeResult.value);
      if (recommendations.status === 'fulfilled') setForYou(recommendations.value);
    });
    return () => controller.abort();
  }, [kind]);

  const shelves = useMemo<Shelf[]>(() => {
    const result: Shelf[] = [];
    if (forYou?.items?.length) result.push({
      key: 'for-you', title: forYou.personalized ? '猜你喜欢' : '现在值得看看',
      description: forYou.personalized ? '根据你在 MDTBBS 的资源收藏和点赞生成，可解释且只使用站内资源互动。' : '还没有足够的个人偏好数据，先展示近期趋势资源。',
      icon: <Sparkles className="h-4 w-4" />, resources: forYou.items.map((item) => item.resource),
    });
    if (home?.sections.featured?.length) result.push({ key: 'featured', title: '编辑精选', description: '由社区运营挑选的高质量资源。', icon: <Star className="h-4 w-4" />, resources: home.sections.featured });
    if (home?.sections.rising?.length) result.push({ key: 'rising', title: '近期上升', description: '最近 7 天浏览与完成下载增长较快的资源。', icon: <TrendingUp className="h-4 w-4" />, resources: home.sections.rising });
    if (home?.sections.trending?.length) result.push({ key: 'trending', title: '热门资源', description: '综合浏览、下载、评分与更新时间排序。', icon: <ArrowUpRight className="h-4 w-4" />, resources: home.sections.trending });
    return result;
  }, [forYou, home]);

  if (!shelves.length) return null;

  return <section className="space-y-7" aria-label="资源推荐">
    {shelves.slice(0, 3).map((shelf) => <div key={shelf.key}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">{shelf.icon}{shelf.title}</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{shelf.description}</p></div>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {dedupe(shelf.resources).slice(0, 8).map((resource) => <ResourceDiscoveryCard key={resource.public_id || resource.id} resource={resource} />)}
      </div>
    </div>)}
  </section>;
}

function ResourceDiscoveryCard({ resource }: { resource: Resource }) {
  const id = resource.public_id || String(resource.id);
  const tags = Array.isArray(resource.metadata?.tags) ? resource.metadata.tags.slice(0, 2) : [];
  return <Link href={`/resources/${encodeURIComponent(id)}`} className="block min-w-[15rem] max-w-[18rem] snap-start border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)] sm:min-w-0 sm:max-w-none">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text)]">{resource.title}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{resource.resource_kind || resource.resource_type}</div></div>{Number(resource.is_featured) === 1 ? <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" /> : null}</div>
    <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{resource.summary || resource.description || '暂无简介'}</p>
    {tags.length ? <div className="mt-3 flex min-h-5 gap-1 overflow-hidden">{tags.map((tag) => <span key={tag} className="truncate border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{tag}</span>)}</div> : <div className="mt-3 min-h-5" />}
    <div className="mt-3 flex items-center gap-3 text-[11px] tabular-nums text-[var(--text-muted)]"><span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{Number(resource.view_count || 0)}</span><span className="inline-flex items-center gap-1"><Download className="h-3 w-3" />{Number(resource.download_count || 0)}</span></div>
  </Link>;
}

function dedupe(resources: Resource[]) {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key = String(resource.public_id || resource.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
