import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ThreadList from '@/components/forum/thread-list';
import ResourceCard from '@/components/forum/resource-card';
import SearchEnhancements from '@/components/forum/search-enhancements';
import { fetchApiData } from '@/lib/api/server-fetch';
import { Resource, SearchResultResponse } from '@/types';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0;

/**
 * Search result pages are never indexed.
 *
 * `/search?q=<anything>` generates unlimited near-duplicate pages out of other
 * pages' content — a classic thin-content farm. `follow` stays on so links out of a
 * result page are still discovered. robots.txt disallows the path too; this covers
 * crawlers arriving from an external link regardless.
 */
export const metadata: Metadata = {
  title: '搜索',
  robots: { index: false, follow: true },
};

type UnifiedSearchResult = {
  groups: {
    users: Array<{ id: number; username: string; avatar_url: string | null; bio: string | null }>;
    posts: SearchResultResponse['data'];
    resources: Resource[];
    servers: Array<{ id: number; public_id: string; name: string; slug: string | null; description: string | null; status: string }>;
    game_versions: Array<{ id: number; public_id: string; build: string | null; version_value: string; display_name: string | null; channel: string | null; is_latest: boolean }>;
    wiki: Array<{ id: number; public_id: string; title: string; slug: string | null; summary: string | null; category: string | null }>;
    developer_feed: Array<{ id: number; provider: string; repository: string; item_type: string; external_id: string; state: string; summary: string | null; source_url: string; author_login: string }>;
  };
  total_by_type: Record<string, number>;
};

const emptyResult: UnifiedSearchResult = {
  groups: { users: [], posts: [], resources: [], servers: [], game_versions: [], wiki: [], developer_feed: [] },
  total_by_type: {},
};

async function fetchUnified(query: string): Promise<UnifiedSearchResult> {
  const qs = new URLSearchParams();
  qs.set('q', query);
  qs.set('limit', '10');
  return fetchApiData<UnifiedSearchResult>(`/api/v1/search?${qs.toString()}`, {
    init: { next: { revalidate: 0 } },
    fallback: emptyResult,
    throwOnError: true,
    // The backend uses this optional identity only to add discussions from groups
    // the viewer belongs to; no private result is rendered for an anonymous SSR.
    forwardCookies: true,
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q || '';
  let result: UnifiedSearchResult;
  try {
    result = query ? await fetchUnified(query) : emptyResult;
  } catch {
    return <ErrorState title="搜索失败" description="暂时无法获取搜索结果，请稍后重试。" action={{ label: '返回搜索', href: '/search' }} />;
  }

  const totalResults = Object.values(result.total_by_type).reduce((total, count) => total + count, 0);
  const { groups } = result;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">
          搜索结果
          {query && <span className="text-surface-500 font-normal text-lg ml-2">&ldquo;{query}&rdquo;</span>}
        </h1>
        {totalResults > 0 && (
          <p className="text-sm text-surface-500 mt-1">
            找到 {totalResults} 条结果
          </p>
        )}
      </div>

      {totalResults === 0 ? (
        <EmptyState title={query ? '没有找到匹配的结果' : '请输入搜索关键词'} className="border-0 bg-transparent" />
      ) : (
        <div className="space-y-6">
          {groups.users.length > 0 && (
            <SearchSection title="用户" count={groups.users.length}>
              <div className="grid gap-3 sm:grid-cols-2">
                {groups.users.map((user) => <Link key={user.id} href={`/users/${user.id}`} className="rounded-lg border border-surface-200 p-3 hover:border-primary-300">
                  <div className="font-medium text-surface-900">@{user.username}</div>
                  {user.bio && <p className="mt-1 line-clamp-2 text-sm text-surface-500">{user.bio}</p>}
                </Link>)}
              </div>
            </SearchSection>
          )}
          {groups.resources.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-surface-900 mb-3">
                资源 ({groups.resources.length})
              </h2>
              <div className="space-y-3">
                {groups.resources.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
          )}

          {groups.posts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-surface-900 mb-3">
                帖子 ({groups.posts.length})
              </h2>
              <ThreadList posts={groups.posts} />
            </div>
          )}
          {groups.servers.length > 0 && <SearchSection title="服务器" count={groups.servers.length}>
            {groups.servers.map((server) => <SearchLink key={server.id} href="/servers" title={server.name} description={server.description} meta={server.status} />)}
          </SearchSection>}
          {groups.game_versions.length > 0 && <SearchSection title="游戏版本" count={groups.game_versions.length}>
            {groups.game_versions.map((version) => <SearchLink key={version.id} href={`/search?q=${encodeURIComponent(version.build || version.version_value)}`} title={version.display_name || version.build || version.version_value} description={version.channel || undefined} meta={version.is_latest ? '最新' : undefined} />)}
          </SearchSection>}
          {groups.wiki.length > 0 && <SearchSection title="知识库" count={groups.wiki.length}>
            {groups.wiki.map((article) => <SearchLink key={article.id} href={`/search?q=${encodeURIComponent(article.title)}`} title={article.title} description={article.summary} meta={article.category || undefined} />)}
          </SearchSection>}
          {groups.developer_feed.length > 0 && <SearchSection title="开发动态" count={groups.developer_feed.length}>
            {groups.developer_feed.map((entry) => <a key={entry.id} href={entry.source_url} rel="noreferrer" className="block rounded-lg border border-surface-200 p-3 hover:border-primary-300">
              <div className="font-medium text-surface-900">{entry.summary || `${entry.repository} #${entry.external_id}`}</div>
              <p className="mt-1 text-sm text-surface-500">{entry.repository} · @{entry.author_login} · {entry.state}</p>
            </a>)}
          </SearchSection>}
        </div>
      )}

      <SearchEnhancements />
    </div>
  );
}

function SearchSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section><h2 className="mb-3 text-lg font-semibold text-surface-900">{title} ({count})</h2><div className="space-y-2">{children}</div></section>;
}

function SearchLink({ href, title, description, meta }: { href: string; title: string; description?: string | null; meta?: string }) {
  return <Link href={href} className="block rounded-lg border border-surface-200 p-3 hover:border-primary-300"><div className="font-medium text-surface-900">{title}</div>{description && <p className="mt-1 line-clamp-2 text-sm text-surface-500">{description}</p>}{meta && <span className="mt-2 inline-block text-xs text-surface-500">{meta}</span>}</Link>;
}
