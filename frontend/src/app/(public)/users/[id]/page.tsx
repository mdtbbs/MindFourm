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
import { roleLabel } from '@/lib/display-labels';
import { formatDate, formatDateTime } from '@/lib/utils';

async function fetchUserProfile(userId: number): Promise<UserProfile | null> {
  return fetchApiData<UserProfile | null>(`/api/users/${userId}`, {
    init: { next: { tags: [`user-${userId}`] } },
    fallback: null,
  });
}

async function fetchUserPosts(userId: number, page: number): Promise<PostListResponse> {
  return fetchApiPaginated<PostListResponse['data'][number]>(`/api/posts?page=${page}&limit=20&user_id=${userId}`, {
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
  const profile = Number.isFinite(userId) ? await fetchUserProfile(userId) : null;

  if (!profile) {
    // Not in the page body: `loading.tsx` flushes a 200 shell before the body runs, and
    // `notFound()` cannot change an already-sent status. generateMetadata runs first.
    notFound();
  }

  const displayName = profile.username || `User #${profile.id}`;
  const description = profile.bio
    ? toMetaDescription(profile.bio)
    : `${displayName} 的个人主页、帖子与回复`;

  return {
    title: displayName,
    description,
    // Tab and pagination params fold onto the profile's single canonical URL.
    alternates: { canonical: `/users/${profile.id}` },
    openGraph: {
      title: displayName,
      description,
      type: 'profile',
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

  const displayName = profile.username || `User #${profile.id}`;
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
            image: profile.avatar_url || undefined,
            description: profile.bio || undefined,
          },
        }}
      />

      <section className="mb-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 md:flex-row md:items-start">
          <span className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]/10 text-2xl font-semibold text-[var(--primary)] md:h-24 md:w-24">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-[var(--text)]">{displayName}</h1>
                  <Badge variant={roleVariant}>{roleLabel(profile.role)}</Badge>
                </div>
                {profile.bio && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{profile.bio}</p>}
                <p className="mt-2 text-xs text-[var(--text-muted)]">UID {profile.id}{profile.created_at ? ` · 加入于 ${formatDate(profile.created_at)}` : ''}</p>
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
              <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{profile.post_count}</strong><span className="text-xs text-[var(--text-muted)]">主题</span></div>
              <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{profile.reply_count}</strong><span className="text-xs text-[var(--text-muted)]">回复</span></div>
              {profile.follower_count !== undefined && <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{profile.follower_count}</strong><span className="text-xs text-[var(--text-muted)]">粉丝</span></div>}
              {profile.following_count !== undefined && <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{profile.following_count}</strong><span className="text-xs text-[var(--text-muted)]">关注</span></div>}
              <div className="py-2.5 text-center"><strong className="block text-base text-[var(--text)]">{profile.total_points ?? 0}</strong><span className="text-xs text-[var(--text-muted)]">积分</span></div>
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
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            帖子
          </Link>
          <Link
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tabValue === 'replies'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            回复
          </Link>
          <Link
            href={`/users/${userId}?tab=resources`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tabValue === 'resources'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Package className="w-4 h-4 inline mr-1" />
            资源
          </Link>
          {/* Own-profile only: these list the viewer's collections, not the owner's. */}
          {isOwnProfile && (
            <>
              <Link
                href={`/users/${userId}?tab=bookmarks`}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tabValue === 'bookmarks'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <Bookmark className="w-4 h-4 inline mr-1" />
                收藏
              </Link>
              <Link
                href={`/users/${userId}?tab=likes`}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tabValue === 'likes'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <Heart className="w-4 h-4 inline mr-1" />
                点赞
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
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无帖子</div>
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
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无回复</div>
          ) : (
            <div className="space-y-3">
              {repliesResult.data.map((reply) => (
                <div key={reply.id} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-2">
                    <Link href={`/posts/${reply.post_id}`} className="text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium">
                      {reply.post_title || '帖子'}
                    </Link>
                    <span>·</span>
                    <span>{formatDateTime(reply.created_at)}</span>
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
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无资源</div>
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
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无收藏</div>
          ) : (
            <div className="space-y-3">
              {bookmarksResult.data.map((bookmark) => (
                <div key={bookmark.id} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/posts/${bookmark.post_id}`} className="text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium">
                      {bookmark.title}
                    </Link>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {formatDate(bookmark.created_at)}
                    </span>
                  </div>
                  {bookmark.category_name && (
                    <div className="mt-2">
                      <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] dark:bg-gray-800 px-2 py-1 rounded">
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
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无点赞</div>
          ) : (
            <div className="space-y-3">
              {likesResult.data.map((like) => (
                <div key={like.id} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/posts/${like.post_id}`} className="text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium">
                      {like.title}
                    </Link>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {formatDate(like.created_at)}
                    </span>
                  </div>
                  {like.category_name && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] dark:bg-gray-800 px-2 py-1 rounded">
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
