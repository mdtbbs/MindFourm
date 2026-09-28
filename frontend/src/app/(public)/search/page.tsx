import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ThreadList from '@/components/forum/thread-list';
import CompactResourceCard from '@/components/forum/compact-resource-card';
import SearchEnhancements from '@/components/forum/search-enhancements';
import { fetchApiData } from '@/lib/api/server-fetch';
import { Resource, SearchResultResponse } from '@/types';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';
import { getRequestLocale } from '@/i18n/server';
import { translate, type Locale } from '@/i18n';

export const revalidate = 0;

/**
 * Search result pages are never indexed.
 *
 * `/search?q=<anything>` generates unlimited near-duplicate pages out of other
 * pages' content — a classic thin-content farm. `follow` stays on so links out of a
 * result page are still discovered. robots.txt disallows the path too; this covers
 * crawlers arriving from an external link regardless.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'searchPage.title'), robots: { index: false, follow: true } };
}

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
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const query = params.q || '';
  let result: UnifiedSearchResult;
  try {
    result = query ? await fetchUnified(query) : emptyResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('(401)')) {
      return <ErrorState title={t('searchPage.loginRequired')} description={t('searchPage.loginDescription')} action={{ label: t('searchPage.login'), href: '/login?redirect=%2Fsearch' }} />;
    }
    if (message.includes('(400)')) {
      return <ErrorState title={t('searchPage.blockedTitle')} description={t('searchPage.blockedDescription')} action={{ label: t('searchPage.backToSearch'), href: '/search' }} />;
    }
    return <ErrorState title={t('searchPage.searchFailed')} description={t('searchPage.searchFailedDescription')} action={{ label: t('searchPage.backToSearch'), href: '/search' }} />;
  }

  const totalResults = Object.values(result.total_by_type).reduce((total, count) => total + count, 0);
  const { groups } = result;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          {t('searchPage.results')}
          {query && <span className="ml-2 text-lg font-normal text-[var(--text-muted)]">&ldquo;{query}&rdquo;</span>}
        </h1>
        {totalResults > 0 && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t('searchPage.resultCount', { count: new Intl.NumberFormat(locale).format(totalResults) })}
          </p>
        )}
      </div>

      {totalResults === 0 ? (
        <EmptyState title={query ? t('searchPage.emptyResults') : t('searchPage.enterQuery')} className="border-0 bg-transparent" />
      ) : (
        <div className="space-y-6">
          {groups.users.length > 0 && (
            <SearchSection title={t('searchPage.users')} count={groups.users.length} locale={locale}>
              <div className="grid gap-3 sm:grid-cols-2">
                {groups.users.map((user) => <Link key={user.id} href={`/users/${user.id}`} className="border border-[var(--border)] p-3 hover:border-[var(--primary)]">
                  <div className="font-medium text-[var(--text)]">@{user.username}</div>
                  {user.bio && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{user.bio}</p>}
                </Link>)}
              </div>
            </SearchSection>
          )}
          {groups.resources.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
                {t('searchPage.resources')} ({new Intl.NumberFormat(locale).format(groups.resources.length)})
              </h2>
              <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
                {groups.resources.map((resource) => (
                  <CompactResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
          )}

          {groups.posts.length > 0 && (
            <div>
            <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
                {t('searchPage.posts')} ({new Intl.NumberFormat(locale).format(groups.posts.length)})
              </h2>
              <ThreadList posts={groups.posts} />
            </div>
          )}
          {groups.servers.length > 0 && <SearchSection title={t('searchPage.servers')} count={groups.servers.length} locale={locale}>
            {groups.servers.map((server) => <SearchLink key={server.id} href="/servers" title={server.name} description={server.description} meta={server.status} />)}
          </SearchSection>}
          {groups.game_versions.length > 0 && <SearchSection title={t('searchPage.gameVersions')} count={groups.game_versions.length} locale={locale}>
            {groups.game_versions.map((version) => <SearchLink key={version.id} href={`/search?q=${encodeURIComponent(version.build || version.version_value)}`} title={version.display_name || version.build || version.version_value} description={version.channel || undefined} meta={version.is_latest ? t('searchPage.latest') : undefined} />)}
          </SearchSection>}
          {groups.wiki.length > 0 && <SearchSection title={t('searchPage.knowledgeBase')} count={groups.wiki.length} locale={locale}>
            {groups.wiki.map((article) => <SearchLink key={article.id} href={`/search?q=${encodeURIComponent(article.title)}`} title={article.title} description={article.summary} meta={article.category || undefined} />)}
          </SearchSection>}
          {groups.developer_feed.length > 0 && <SearchSection title={t('searchPage.developerUpdates')} count={groups.developer_feed.length} locale={locale}>
            {groups.developer_feed.map((entry) => <a key={entry.id} href={entry.source_url} rel="noreferrer" className="block border border-[var(--border)] p-3 hover:border-[var(--primary)]">
              <div className="font-medium text-[var(--text)]">{entry.summary || `${entry.repository} #${entry.external_id}`}</div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{entry.repository} · @{entry.author_login} · {entry.state}</p>
            </a>)}
          </SearchSection>}
        </div>
      )}

      <SearchEnhancements />
    </div>
  );
}

function SearchSection({ title, count, children, locale }: { title: string; count: number; children: ReactNode; locale: Locale }) {
  return <section><h2 className="mb-3 text-lg font-semibold text-[var(--text)]">{title} ({new Intl.NumberFormat(locale).format(count)})</h2><div className="space-y-2">{children}</div></section>;
}

function SearchLink({ href, title, description, meta }: { href: string; title: string; description?: string | null; meta?: string }) {
  return <Link href={href} className="block border border-[var(--border)] p-3 hover:border-[var(--primary)]"><div className="font-medium text-[var(--text)]">{title}</div>{description && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{description}</p>}{meta && <span className="mt-2 inline-block text-xs text-[var(--text-muted)]">{meta}</span>}</Link>;
}
