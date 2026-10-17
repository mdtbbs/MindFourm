import type { Metadata } from 'next';
import ThreadList from '@/components/forum/thread-list';
import ResourceCard from '@/components/forum/resource-card';
import Pagination from '@/components/ui/pagination';
import JsonLd from '@/components/seo/json-ld';
import { toMetaDescription } from '@/lib/seo/description';
import { absoluteUrl } from '@/lib/seo/site-url';
import Badge from '@/components/ui/badge';
import { UserProfile, PostListResponse, Reply, BookmarkListResponse, LikedPost, Resource } from '@/types';
import { Bookmark, Heart, Star, Users, Package } from 'lucide-react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';
import ProfileEditLink from '@/components/forum/profile-edit-link';
import { Medal } from '@/lib/shared';
import FollowButton from '@/components/forum/follow-button';
import BlockUserButton from '@/components/user/block-user-button';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { getRequestLocale } from '@/i18n/server';
import { getOpenGraphLocale, translate, type Locale } from '@/i18n';

function localizedDate(value: string, locale: Locale, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

async function fetchUserProfile(userId: number): Promise<UserProfile | null> {
  return fetchApiData<UserProfile | null>(`/api/users/${userId}`, {
    init: { next: { tags: [`user-${userId}`] } },
    fallback: null,
  });
}

async function fetchUserPosts(userId: number, page: number): Promise<PostListResponse> {
  return fetchApiPaginated<PostListResponse['data'][number]>(`/api/posts?page=${page}&limit=20&user_id=${userId}&source=USER`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(20),
  });
}

async function fetchUserReplies(userId: number, page: number): Promise<{ data: Reply[]; pagination: PostListResponse['pagination'] }> {
  return fetchApiPaginated<Reply>(`/api/users/${userId}/replies?page=${page}&limit=20`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<Reply>(20),
  });
}

async function fetchUserResources(userId: number, page: number): Promise<{ data: Resource[]; pagination: PostListResponse['pagination'] }> {
  return fetchApiPaginated<Resource>(`/api/resources/user/${userId}?page=${page}&limit=20`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<Resource>(20),
  });
}

/**
 * Bookmarks and likes are only exposed for your *own* profile.
 *
 * `/api/bookmarks` and `/api/likes/posts` return the authenticated caller's
 * collections, not the profile owner's — so rendering them on someone else's page
 * showed the visitor their own data under another user's name. They also need the
 * session cookie forwarded, without which they always resolved to the empty
 * fallback.
 */
async function fetchOwnBookmarks(page: number): Promise<BookmarkListResponse> {
  return fetchApiPaginated<BookmarkListResponse['data'][number]>(`/api/bookmarks?page=${page}&limit=20`, {
    init: { cache: 'no-store' },
    forwardCookies: true,
    fallback: createEmptyPaginatedResult<BookmarkListResponse['data'][number]>(20),
  });
}

async function fetchOwnLikes(page: number): Promise<{ data: LikedPost[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  return fetchApiPaginated<LikedPost>(`/api/likes/posts?page=${page}&limit=20`, {
    init: { cache: 'no-store' },
    forwardCookies: true,
    fallback: createEmptyPaginatedResult<LikedPost>(20),
  });
}

async function fetchViewer(): Promise<{ id: number } | null> {
  const result = await fetchApiData<{ authenticated?: boolean; user?: { id: number } } | null>(
    '/api/auth/check',
    { init: { cache: 'no-store' }, forwardCookies: true, fallback: null },
  );
  return result?.authenticated && result.user ? result.user : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const userId = parseInt(id);
  const [profile, locale] = await Promise.all([
    Number.isFinite(userId) ? fetchUserProfile(userId) : Promise.resolve(null),
    getRequestLocale(),
  ]);

  if (!profile) {
    // Not in the page body: `loading.tsx` flushes a 200 shell before the body runs, and
    // `notFound()` cannot change an already-sent status. generateMetadata runs first.
    notFound();
  }

  const displayName = profile.username || `User #${profile.id}`;
  const description = profile.bio
    ? toMetaDescription(profile.bio)
    : translate(locale, 'userProfile.metaDescription', { name: displayName });

  return {
    title: translate(locale, 'userProfile.homeTitle', { name: displayName }),
    description,
    // Tab and pagination params fold onto the profile's single canonical URL.
    alternates: { canonical: `/users/${profile.id}` },
    openGraph: {
      title: displayName,
      description,
      type: 'profile',
      locale: getOpenGraphLocale(locale),
      url: `/users/${profile.id}`,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
  };
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { page: pageStr, tab } = await searchParams;
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const userId = parseInt(id);
  const page = parseInt(pageStr || '1');
  const [profile, viewer] = await Promise.all([fetchUserProfile(userId), fetchViewer()]);
  if (!profile) return notFound();

  const isOwnProfile = viewer?.id === userId;
  // Private tabs are hidden on other people's profiles; asking for one directly
  // falls back to the posts tab.
  const requestedTab = tab || 'posts';
  const tabValue =
    !isOwnProfile && (requestedTab === 'bookmarks' || requestedTab === 'likes')
      ? 'posts'
      : requestedTab;

  const [postsResult, repliesResult, resourcesResult, bookmarksResult, likesResult] = await Promise.all([
    tabValue === 'posts'
      ? fetchUserPosts(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<PostListResponse['data'][number]>(20)),
    tabValue === 'replies'
      ? fetchUserReplies(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<Reply>(20)),
    tabValue === 'resources'
      ? fetchUserResources(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<Resource>(20)),
    tabValue === 'bookmarks' && isOwnProfile
      ? fetchOwnBookmarks(page)
      : Promise.resolve(createEmptyPaginatedResult<BookmarkListResponse['data'][number]>(20)),
    tabValue === 'likes' && isOwnProfile
      ? fetchOwnLikes(page)
      : Promise.resolve(createEmptyPaginatedResult<LikedPost>(20)),
  ]);

  const displayName = profile.username || t('userProfile.unknownUser', { id: profile.id });
  const roleKey = profile.role === 'admin' ? 'admin' : profile.role === 'moderator' ? 'moderator' : 'user';
  const roleName = t(`userProfile.role.${roleKey}`);
  const roleVariant = profile.role === 'admin' ? 'warning' : profile.role === 'moderator' ? 'success' : 'default' as const;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: displayName,
            identifier: String(profile.id),
            url: absoluteUrl(`/users/${profile.id}`),
            ...(profile.avatar_url ? { image: absoluteUrl(profile.avatar_url) } : {}),
            ...(profile.bio ? { description: toMetaDescription(profile.bio) } : {}),
            ...(profile.created_at ? { dateCreated: profile.created_at } : {}),
            interactionStatistic: [
              { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WriteAction', userInteractionCount: profile.post_count || 0 },
              { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ReplyAction', userInteractionCount: profile.reply_count || 0 },
            ],
          },
        }}
      />

      <section className="mb-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 md:flex-row md:items-start">
          <span className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]/10 text-2xl font-semibold text-[var(--primary-text)] md:h-24 md:w-24">
            {profile.avatar_url ? <img src={profile.avatar_url} alt={t('userProfile.avatarAlt', { name: displayName })} className="h-full w-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-[var(--text)]">{displayName}</h1>
                  <Badge variant={roleVariant}>{roleName}</Badge>
                </div>
                {profile.bio && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{profile.bio}</p>}
                <p className="mt-2 text-xs text-[var(--text-muted)]">用户编号 {new Intl.NumberFormat(locale).format(profile.id)}{profile.created_at ? ` · ${t('userProfile.joined', { date: localizedDate(profile.created_at, locale) })}` : ''}</p>
                {profile.level && <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  {profile.level.icon ? <img src={profile.level.icon} alt="" className="h-4 w-4" /> : <Star className="h-3.5 w-3.5" style={{ color: profile.level.color || 'var(--primary)' }} />}
                  <span>{profile.level.name}</span>
                </div>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <FollowButton targetUserId={userId} />
                {viewer && viewer.id !== profile.id && <BlockUserButton userId={profile.id} username={profile.username} targetRole={profile.role} />}
                <ProfileEditLink userId={profile.id} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--border)] border-y border-[var(--border)] sm:grid-cols-5">
              <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{new Intl.NumberFormat(locale).format(profile.post_count)}</strong><span className="text-xs text-[var(--text-muted)]">{t('userProfile.stats.posts')}</span></div>
              <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{new Intl.NumberFormat(locale).format(profile.reply_count)}</strong><span className="text-xs text-[var(--text-muted)]">{t('userProfile.stats.replies')}</span></div>
              {profile.follower_count !== undefined && <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{new Intl.NumberFormat(locale).format(profile.follower_count)}</strong><span className="text-xs text-[var(--text-muted)]">{t('userProfile.stats.followers')}</span></div>}
              {profile.following_count !== undefined && <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{new Intl.NumberFormat(locale).format(profile.following_count)}</strong><span className="text-xs text-[var(--text-muted)]">{t('userProfile.stats.following')}</span></div>}
              <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{new Intl.NumberFormat(locale).format(profile.total_points ?? 0)}</strong><span className="text-xs text-[var(--text-muted)]">{t('userProfile.stats.points')}</span></div>
            </div>
          </div>
        </div>
        {profile.badges && profile.badges.length > 0 && <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-5 py-2.5 sm:px-6">
          {profile.badges.map((badge) => <span key={badge.id} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">{badge.icon ? <img src={badge.icon} alt="" className="h-4 w-4" /> : <Medal level={badge.level as any} />} {badge.name}</span>)}
        </div>}
        <div className="border-t border-[var(--border)] px-2 sm:px-4">
        <nav className="flex gap-4">
          <Link
            href={`/users/${userId}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tabValue === 'posts'
                ? 'border-[var(--primary)] text-[var(--primary-text)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {t('userProfile.tabs.posts')}
          </Link>
          <Link
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tabValue === 'replies'
                ? 'border-[var(--primary)] text-[var(--primary-text)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {t('userProfile.tabs.replies')}
          </Link>
          <Link
            href={`/users/${userId}?tab=resources`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tabValue === 'resources'
                ? 'border-[var(--primary)] text-[var(--primary-text)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Package className="w-4 h-4 inline mr-1" />
            {t('userProfile.tabs.resources')}
          </Link>
          {/* Own-profile only: these list the viewer's collections, not the owner's. */}
          {isOwnProfile && (
            <>
              <Link
                href={`/users/${userId}?tab=bookmarks`}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tabValue === 'bookmarks'
                    ? 'border-[var(--primary)] text-[var(--primary-text)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <Bookmark className="w-4 h-4 inline mr-1" />
                {t('userProfile.tabs.bookmarks')}
              </Link>
              <Link
                href={`/users/${userId}?tab=likes`}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tabValue === 'likes'
                    ? 'border-[var(--primary)] text-[var(--primary-text)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <Heart className="w-4 h-4 inline mr-1" />
                {t('userProfile.tabs.likes')}
              </Link>
            </>
          )}
        </nav>
        </div>
      </section>

      {/* Content */}
      {tabValue === 'posts' && (
        <>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">{t('userProfile.empty.posts')}</div>
          ) : (
            <div className="space-y-3">
              <ThreadList posts={postsResult.data} />
            </div>
          )}
          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=posts`}
          />
        </>
      )}

      {tabValue === 'replies' && (
        <>
          {repliesResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">{t('userProfile.empty.replies')}</div>
          ) : (
            <div className="space-y-3">
              {repliesResult.data.map((reply) => (
                <div key={reply.id} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-2">
                    <Link href={`/posts/${reply.post_id}`} className="text-[var(--primary-text)] hover:text-[var(--primary-dark)] font-medium">
                      {reply.post_title || t('userProfile.post')}
                    </Link>
                    <span>·</span>
                    <span>{localizedDate(reply.created_at, locale, true)}</span>
                  </div>
                  <MarkdownRenderer content={reply.content} mode="excerpt" className="line-clamp-3 text-sm text-[var(--text)]" />
                </div>
              ))}
            </div>
          )}
          <Pagination
            currentPage={repliesResult.pagination.page}
            totalPages={repliesResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=replies`}
          />
        </>
      )}

      {tabValue === 'resources' && (
        <>
          {resourcesResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">{t('userProfile.empty.resources')}</div>
          ) : (
            <div className="space-y-3">
              {resourcesResult.data.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
          <Pagination
            currentPage={resourcesResult.pagination.page}
            totalPages={resourcesResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=resources`}
          />
        </>
      )}

      {tabValue === 'bookmarks' && (
        <>
          {bookmarksResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">{t('userProfile.empty.bookmarks')}</div>
          ) : (
            <div className="space-y-3">
              {bookmarksResult.data.map((bookmark) => (
                <div key={bookmark.id} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/posts/${bookmark.post_id}`} className="text-[var(--primary-text)] hover:text-[var(--primary-dark)] font-medium">
                      {bookmark.title}
                    </Link>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {localizedDate(bookmark.created_at, locale)}
                    </span>
                  </div>
                  {bookmark.category_name && (
                    <div className="mt-2">
                      <span className="rounded-[var(--radius)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                        {bookmark.category_name}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Pagination
            currentPage={bookmarksResult.pagination.page}
            totalPages={bookmarksResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=bookmarks`}
          />
        </>
      )}

      {tabValue === 'likes' && (
        <>
          {likesResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">{t('userProfile.empty.likes')}</div>
          ) : (
            <div className="space-y-3">
              {likesResult.data.map((like) => (
                <div key={like.id} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/posts/${like.post_id}`} className="text-[var(--primary-text)] hover:text-[var(--primary-dark)] font-medium">
                      {like.title}
                    </Link>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {localizedDate(like.created_at, locale)}
                    </span>
                  </div>
                  {like.category_name && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-[var(--radius)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                        {like.category_name}
                      </span>
                      {like.like_count > 0 && (
                        <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                          <Heart className="w-3 h-3 text-red-500" />
                          {like.like_count}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Pagination
            currentPage={likesResult.pagination.page}
            totalPages={likesResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=likes`}
          />
        </>
      )}
    </div>
  );
}
