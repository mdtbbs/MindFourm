import type { Metadata } from 'next';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import JsonLd from '@/components/seo/json-ld';
import { toMetaDescription } from '@/lib/seo/description';
import { absoluteUrl } from '@/lib/seo/site-url';
import Badge from '@/components/ui/badge';
import { UserProfile, PostListResponse, Reply, BookmarkListResponse, LikedPost } from '@/types';
import { Bookmark, Calendar, Heart, Star, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';
import ProfileEditLink from '@/components/forum/profile-edit-link';
import { UserCard } from '@/lib/shared';
import { Medal, Title } from '@/lib/shared';
import FollowButton from '@/components/forum/follow-button';
import BlockUserButton from '@/components/user/block-user-button';

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

  const [postsResult, repliesResult, bookmarksResult, likesResult] = await Promise.all([
    tabValue === 'posts'
      ? fetchUserPosts(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<PostListResponse['data'][number]>(20)),
    tabValue === 'replies'
      ? fetchUserReplies(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<Reply>(20)),
    tabValue === 'bookmarks' && isOwnProfile
      ? fetchOwnBookmarks(page)
      : Promise.resolve(createEmptyPaginatedResult<BookmarkListResponse['data'][number]>(20)),
    tabValue === 'likes' && isOwnProfile
      ? fetchOwnLikes(page)
      : Promise.resolve(createEmptyPaginatedResult<LikedPost>(20)),
  ]);

  const displayName = profile.username || `User #${profile.id}`;
  const roleVariant = profile.role === 'admin' ? 'warning' : profile.role === 'moderator' ? 'success' : 'default' as const;

  // 格式化注册时间
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

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

      {/* User Info Card - 使用shared UserCard */}
      <div className="flex justify-center mb-8">
        <UserCard
          username={displayName}
          avatarUrl={profile.avatar_url || undefined}
          stats={{
            posts: profile.post_count,
            replies: profile.reply_count,
          }}
          showStats={true}
        />
      </div>

      {/* Level, Points, Follow Stats */}
      <div className="flex justify-center gap-6 mb-6">
        {profile.level && (
          <div className="flex items-center gap-2 card px-4 py-2">
            {profile.level.icon ? (
              <img src={profile.level.icon} alt={profile.level.name} className="w-6 h-6" />
            ) : (
              <Star className="w-5 h-5" style={{ color: profile.level.color || 'var(--primary)' }} />
            )}
            <span className="text-sm font-medium">{profile.level.name}</span>
            {profile.level.progress !== undefined && (
              <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${profile.level.progress}%`, backgroundColor: profile.level.color || 'var(--primary)' }} />
              </div>
            )}
          </div>
        )}
        {profile.total_points !== undefined && (
          <div className="flex items-center gap-2 card px-4 py-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium">{profile.total_points} 积分</span>
          </div>
        )}
        {(profile.follower_count !== undefined || profile.following_count !== undefined) && (
          <div className="flex items-center gap-4 card px-4 py-2">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              <strong>{profile.following_count || 0}</strong> 关注
            </span>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              <strong>{profile.follower_count || 0}</strong> 粉丝
            </span>
          </div>
        )}
      </div>

      {/* Badges */}
      {profile.badges && profile.badges.length > 0 && (
        <div className="flex justify-center gap-2 mb-6 flex-wrap">
          {profile.badges.map((badge) => (
            <div key={badge.id} className="flex items-center gap-1.5 card px-3 py-1.5">
              {badge.icon ? (
                <img src={badge.icon} alt={badge.name} className="w-4 h-4" />
              ) : (
                <Medal level={badge.level as any} />
              )}
              <span className="text-xs font-medium">{badge.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bio */}
      {profile.bio && (
        <div className="max-w-md mx-auto text-center mb-8">
          <p className="text-sm text-[var(--text-secondary)]">{profile.bio}</p>
        </div>
      )}

      {/* Role badge, Follow button and edit link */}
      <div className="max-w-md mx-auto flex flex-wrap justify-center gap-3 mb-8">
        <FollowButton targetUserId={userId} />
        <Badge variant={roleVariant}>{profile.role}</Badge>
        {/* This page already has the role, so the button can decide for itself not to
            offer blocking staff — the API refuses it either way. */}
        {viewer && viewer.id !== profile.id && (
          <BlockUserButton
            userId={profile.id}
            username={profile.username}
            targetRole={profile.role}
          />
        )}
        <ProfileEditLink userId={profile.id} />
      </div>

      {/* Registration time */}
      {profile.created_at && (
        <div className="max-w-md mx-auto text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Calendar className="w-4 h-4" />
            <span>注册于 {formatDate(profile.created_at)}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--border)] mb-6">
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

      {/* Content */}
      {tabValue === 'posts' && (
        <>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无帖子</div>
          ) : (
            <div className="space-y-3">
              {postsResult.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
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
                    <span>{new Date(reply.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  <p className="text-sm text-[var(--text)] line-clamp-3">{reply.content}</p>
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
                      {new Date(bookmark.created_at).toLocaleDateString('zh-CN')}
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
                      {new Date(like.created_at).toLocaleDateString('zh-CN')}
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
