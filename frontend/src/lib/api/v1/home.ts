import { fetchV1, type FetchV1Options } from './transport';
import type { PostSummary } from '@/types';

export type HomeSectionState = 'ready' | 'stale' | 'unavailable';
export type HomeSection<T> = { state: HomeSectionState; items: T[] };
export type HomeResource = { id: number; title: string; slug: string | null; resource_kind: string | null; version: string | null; updated_at: string; author_name: string | null; category_name: string | null };
export type HomeNotice = { id: number; public_id: string; title: string; excerpt: string | null; published_at: string | null };
export type HomeNews = { id: number; title: string; slug: string | null; category: string | null };
export type HomeDeveloperEntry = { id: number; external_id: string; title: string; state: string; url: string; repository: string; updated_at: string };

export type HomeData = {
  discussions: HomeSection<PostSummary>;
  resources: HomeSection<HomeResource>;
  news: HomeSection<HomeNews>;
  notices: HomeSection<HomeNotice>;
  development: { issues: HomeSection<HomeDeveloperEntry>; pull_requests: HomeSection<HomeDeveloperEntry> };
  generated_at: string;
};

/** The fault-isolated homepage read model; legacy page-specific calls stay untouched. */
export const getHomeData = (options?: FetchV1Options) => fetchV1<HomeData>('/home', options);
