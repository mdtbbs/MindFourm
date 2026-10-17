import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ThreadList from '@/components/forum/thread-list';
import CompactResourceCard from '@/components/forum/compact-resource-card';
import SearchHighlight from '@/components/forum/search-highlight';
import SearchEnhancements from '@/components/forum/search-enhancements';
import SearchAutocompleteInput from '@/components/forum/search-autocomplete-input';
import { fetchApiData } from '@/lib/api/server-fetch';
import { Resource, SearchResultResponse } from '@/types';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';
import { getRequestLocale } from '@/i18n/server';
import { translate, type Locale } from '@/i18n';
import { siteProfile } from '@/config/site-profile';

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
  unavailable?: string[];
  suggested_query?: string;
  pagination: { page: number; limit: number; has_more: boolean };
};

const emptyResult: UnifiedSearchResult = {
  groups: { users: [], posts: [], resources: [], servers: [], game_versions: [], wiki: [], developer_feed: [] },
  total_by_type: {},
  pagination: { page: 1, limit: 10, has_more: false },
};

async function fetchUnified(query: string, options: { type: string; page: number; sort: string; category: string; resourceKind: string; contentLanguage: string }): Promise<UnifiedSearchResult> {
  const qs = new URLSearchParams();
  qs.set('q', query);
  qs.set('limit', '10');
  qs.set('type', options.type);
  qs.set('page', String(options.page));
  qs.set('sort', options.sort);
  if (options.category) qs.set('category', options.category);
  if (options.resourceKind) qs.set('resource_kind', options.resourceKind);
  if (options.contentLanguage) qs.set('content_language', options.contentLanguage);
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
  searchParams: Promise<{ q?: string; page?: string; type?: string; sort?: string; category?: string; resource_kind?: string; content_language?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const query = params.q || '';
  const supportedTypes = ['all', 'posts', 'resources', 'mod', 'map', 'schematic', 'users', 'servers', 'wiki', 'game_versions', 'developer_feed'];
  const selectedType = supportedTypes.includes(params.type || '') ? params.type! : 'all';
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.page || '1', 10) || 1));
  const sort = ['relevance', 'newest', 'oldest', 'downloads', 'rating'].includes(params.sort || '') ? params.sort! : 'relevance';
  const category = (params.category || '').trim().slice(0, 100);
  const selectedResourceKind = ['mod', 'map', 'schematic'].includes(params.resource_kind || '') ? params.resource_kind! : '';
  const selectedLanguage: string = siteProfile.contentLanguages.includes(params.content_language as (typeof siteProfile.contentLanguages)[number])
    ? params.content_language || ''
    : '';
  let result: UnifiedSearchResult;
  try {
    result = query ? await fetchUnified(query, {
      type: selectedType, page, sort, category, resourceKind: selectedResourceKind, contentLanguage: selectedLanguage,
    }) : emptyResult;
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

  const selectedGroup = ['mod', 'map', 'schematic'].includes(selectedType) ? 'resources' : selectedType;
  const totalResults = selectedType === 'all'
    ? Object.values(result.total_by_type).reduce((total, count) => total + count, 0)
    : (result.total_by_type[selectedGroup] || 0);
  const { groups } = result;
  const displayQuery = result.suggested_query || query;
  const tabHref = (type: string) => {
    const next = new URLSearchParams();
    if (displayQuery) next.set('q', displayQuery);
    next.set('type', type);
    next.set('sort', sort);
    if (category) next.set('category', category);
    if (selectedLanguage) next.set('content_language', selectedLanguage);
    return `/search?${next.toString()}`;
  };
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (displayQuery) next.set('q', displayQuery);
    next.set('type', selectedType);
    next.set('sort', sort);
    if (category) next.set('category', category);
    if (selectedResourceKind) next.set('resource_kind', selectedResourceKind);
    if (selectedLanguage) next.set('content_language', selectedLanguage);
    next.set('page', String(nextPage));
    return `/search?${next.toString()}`;
  };
  const countForTab = (type: string, key: string) => {
    if (selectedType === 'all') return result.total_by_type[key] || 0;
    if (selectedType === type || (['mod', 'map', 'schematic'].includes(selectedType) && type === selectedType)) {
      return result.total_by_type[selectedGroup] || 0;
    }
    return undefined;
  };
  const tabs = [
    { key: 'all', label: t('searchPage.allTypes'), count: selectedType === 'all' ? Object.values(result.total_by_type).reduce((sum, count) => sum + count, 0) : undefined },
    { key: 'posts', label: t('searchPage.posts'), count: countForTab('posts', 'posts') },
    { key: 'resources', label: t('searchPage.resources'), count: countForTab('resources', 'resources') },
    { key: 'mod', label: t('searchPage.mods'), count: countForTab('mod', 'resources') },
    { key: 'map', label: t('searchPage.maps'), count: countForTab('map', 'resources') },
    { key: 'schematic', label: t('searchPage.schematics'), count: countForTab('schematic', 'resources') },
    { key: 'users', label: t('searchPage.users'), count: countForTab('users', 'users') },
    { key: 'servers', label: t('searchPage.servers'), count: countForTab('servers', 'servers') },
    { key: 'wiki', label: t('searchPage.knowledgeBase'), count: countForTab('wiki', 'wiki') },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          {t('searchPage.results')}
          {displayQuery && <span className="ml-2 text-lg font-normal text-[var(--text-muted)]">&ldquo;{displayQuery}&rdquo;</span>}
        </h1>
        <nav aria-label={t('searchPage.filterType')} className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {tabs.map((tab) => <Link key={tab.key} aria-current={selectedType === tab.key ? 'page' : undefined}
            href={tabHref(tab.key)} className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-sm ${selectedType === tab.key ? 'border-[var(--primary)] bg-[var(--primary)]/10 font-semibold text-[var(--primary-text)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--primary)]'}`}>
            {tab.label}{tab.count !== undefined && <span className="ml-1 text-xs opacity-70">{new Intl.NumberFormat(locale).format(tab.count)}</span>}
          </Link>)}
        </nav>
        <form action="/search" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="type" value={selectedType} />
          <input type="hidden" name="page" value="1" />
          <SearchAutocompleteInput initialValue={displayQuery} label={t('searchPage.queryInput')}
            placeholder={t('searchPage.queryPlaceholder')} suggestionsLabel={t('searchPage.suggestions')} />
          <div className="min-w-40 flex-1 sm:flex-none">
            <label htmlFor="search-sort" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('searchPage.sort')}</label>
            <select id="search-sort" name="sort" defaultValue={sort} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]">
              <option value="relevance">{t('searchPage.sortRelevance')}</option>
              <option value="newest">{t('searchPage.sortNewest')}</option>
              <option value="oldest">{t('searchPage.sortOldest')}</option>
              <option value="downloads">{t('searchPage.sortDownloads')}</option>
              <option value="rating">{t('searchPage.sortRating')}</option>
            </select>
          </div>
          <div className="min-w-40 flex-1 sm:flex-none">
            <label htmlFor="search-category" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('searchPage.filterCategory')}</label>
            <input id="search-category" name="category" defaultValue={category} maxLength={100} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]" />
          </div>
          <div className="min-w-40 flex-1 sm:flex-none">
            <label htmlFor="search-resource-kind" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('searchPage.filterResourceKind')}</label>
            <select id="search-resource-kind" name="resource_kind" defaultValue={selectedResourceKind} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]">
              <option value="">{t('searchPage.allResourceKinds')}</option>
              <option value="mod">Mod</option><option value="map">Map</option><option value="schematic">Schematic</option>
            </select>
          </div>
          {siteProfile.features.contentLanguageSearch && <div className="min-w-40 flex-1 sm:flex-none">
            <label htmlFor="search-content-language" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('searchPage.filterLanguage')}</label>
            <select id="search-content-language" name="content_language" defaultValue={selectedLanguage} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]">
              <option value="">{t('searchPage.allLanguages')}</option>
              {siteProfile.contentLanguages.map((language) => <option key={language} value={language}>{t(`contentLanguage.languages.${language}`)}</option>)}
            </select>
          </div>}
          <button type="submit" className="min-h-11 border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">{t('common.search')}</button>
        </form>
        {totalResults > 0 && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t('searchPage.resultCount', { count: new Intl.NumberFormat(locale).format(totalResults) })}
          </p>
        )}
        {result.suggested_query && <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('searchPage.typoSuggestion', { query, suggestion: result.suggested_query })}{' '}
          <Link className="underline underline-offset-2" href={`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(selectedType)}`}>{t('searchPage.searchOriginal')}</Link>
        </p>}
      </div>

      {!!result.unavailable?.length && <p role="status" className="mb-4 text-sm text-[var(--text-secondary)]">{t('searchPage.partialResults')}</p>}
      {totalResults === 0 ? (
        <EmptyState title={result.unavailable?.length ? t('searchPage.searchFailedDescription') : query ? t('searchPage.emptyResults') : t('searchPage.enterQuery')} className="border-0 bg-transparent" />
      ) : (
        <div className="space-y-6">
          {groups.users.length > 0 && (
            <SearchSection title={t('searchPage.users')} count={groups.users.length} locale={locale}>
              <div className="grid gap-3 sm:grid-cols-2">
                {groups.users.map((user) => <Link key={user.id} href={`/users/${user.id}`} className="flex min-h-16 items-center gap-3 border border-[var(--border)] p-3 hover:border-[var(--primary)]">
                  {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] font-semibold">{user.username.slice(0, 1).toUpperCase()}</span>}
                  <span className="min-w-0"><span className="block truncate font-medium text-[var(--text)]">@<SearchHighlight text={user.username} query={displayQuery} /></span>
                  {user.bio && <span className="mt-1 line-clamp-2 block text-sm text-[var(--text-secondary)]"><SearchHighlight text={user.bio} query={displayQuery} /></span>}</span>
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
                  <CompactResourceCard key={resource.id} resource={resource} highlightTerm={displayQuery} />
                ))}
              </div>
            </div>
          )}

          {groups.posts.length > 0 && (
            <div>
            <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
                {t('searchPage.posts')} ({new Intl.NumberFormat(locale).format(groups.posts.length)})
              </h2>
              <ThreadList posts={groups.posts} highlightTerm={displayQuery} />
            </div>
          )}
          {groups.servers.length > 0 && <SearchSection title={t('searchPage.servers')} count={groups.servers.length} locale={locale}>
            {groups.servers.map((server) => <SearchLink key={server.id} href="/servers" title={server.name} description={server.description} meta={server.status} query={displayQuery} />)}
          </SearchSection>}
          {groups.game_versions.length > 0 && <SearchSection title={t('searchPage.gameVersions')} count={groups.game_versions.length} locale={locale}>
            {groups.game_versions.map((version) => <SearchLink key={version.id} href={`/search?q=${encodeURIComponent(version.build || version.version_value)}`} title={version.display_name || version.build || version.version_value} description={version.channel || undefined} meta={version.is_latest ? t('searchPage.latest') : undefined} query={displayQuery} />)}
          </SearchSection>}
          {groups.wiki.length > 0 && <SearchSection title={t('searchPage.knowledgeBase')} count={groups.wiki.length} locale={locale}>
            {groups.wiki.map((article) => <SearchLink key={article.id} href={`/search?q=${encodeURIComponent(article.title)}`} title={article.title} description={article.summary} meta={article.category || undefined} query={displayQuery} />)}
          </SearchSection>}
          {siteProfile.features.developerFeed && groups.developer_feed.length > 0 && <SearchSection title={t('searchPage.developerUpdates')} count={groups.developer_feed.length} locale={locale}>
            {groups.developer_feed.map((entry) => <a key={entry.id} href={entry.source_url} rel="noreferrer" className="block min-h-16 border border-[var(--border)] p-3 hover:border-[var(--primary)]">
              <div className="font-medium text-[var(--text)]"><SearchHighlight text={entry.summary || `${entry.repository} #${entry.external_id}`} query={displayQuery} /></div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]"><SearchHighlight text={`${entry.repository} · @${entry.author_login} · ${entry.state}`} query={displayQuery} /></p>
            </a>)}
          </SearchSection>}
        </div>
      )}

      {query && (page > 1 || result.pagination.has_more) && <nav aria-label={t('searchPage.pagination')} className="mt-6 flex items-center justify-between gap-3">
        {page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--primary)]">{t('searchPage.previous')}</Link> : <span />}
        <span className="text-sm text-[var(--text-secondary)]">{t('searchPage.pageNumber', { page })}</span>
        {result.pagination.has_more ? <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--primary)]">{t('searchPage.next')}</Link> : <span />}
      </nav>}

      <SearchEnhancements />
    </div>
  );
}

function SearchSection({ title, count, children, locale }: { title: string; count: number; children: ReactNode; locale: Locale }) {
  return <section><h2 className="mb-3 text-lg font-semibold text-[var(--text)]">{title} ({new Intl.NumberFormat(locale).format(count)})</h2><div className="space-y-2">{children}</div></section>;
}

function SearchLink({ href, title, description, meta, query }: { href: string; title: string; description?: string | null; meta?: string; query?: string }) {
  return <Link href={href} className="block min-h-16 border border-[var(--border)] p-3 hover:border-[var(--primary)]"><div className="font-medium text-[var(--text)]">{query ? <SearchHighlight text={title} query={query} /> : title}</div>{description && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{query ? <SearchHighlight text={description} query={query} /> : description}</p>}{meta && <span className="mt-2 inline-block text-xs text-[var(--text-muted)]">{meta}</span>}</Link>;
}
