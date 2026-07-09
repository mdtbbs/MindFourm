import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import Badge from '@/components/ui/badge';
import { UserProfile, PostListResponse, Reply, BookmarkListResponse, LikedPost } from '@/types';
import { Bookmark, Calendar, Heart, Star, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';
import ProfileEditLink from '@/components/forum/profile-edit-link';
import { UserCard } from '@mindproject/shared';
import { Medal, Title } from '@mindproject/shared';
import FollowButton from '@/components/forum/follow-button';

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
    init: { next: { tags: ['replies'] } },
    fallback: createEmptyPaginatedResult<Reply>(20),
  });
}

async function fetchUserBookmarks(page: number): Promise<BookmarkListResponse> {
  return fetchApiPaginated<BookmarkListResponse['data'][number]>(`/api/bookmarks?page=${page}&limit=20`, {
    init: { next: { tags: ['bookmarks'] } },
    fallback: createEmptyPaginatedResult<BookmarkListResponse['data'][number]>(20),
  });
}

async function fetchUserLikes(page: number): Promise<{ data: LikedPost[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  return fetchApiPaginated<LikedPost>(`/api/likes/posts?page=${page}&limit=20`, {
    init: { next: { tags: ['likes'] } },
    fallback: createEmptyPaginatedResult<LikedPost>(20),
  });
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string; tab?: string };
}) {
  const userId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');
  const tab = searchParams.tab || 'posts';

  const profile = await fetchUserProfile(userId);
  if (!profile) return notFound();

  const [postsResult, repliesResult, bookmarksResult, likesResult] = await Promise.all([
    tab === 'posts'
      ? fetchUserPosts(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<PostListResponse['data'][number]>(20)),
    tab === 'replies'
      ? fetchUserReplies(userId, page)
      : Promise.resolve(createEmptyPaginatedResult<Reply>(20)),
    tab === 'bookmarks'
      ? fetchUserBookmarks(page)
      : Promise.resolve(createEmptyPaginatedResult<BookmarkListResponse['data'][number]>(20)),
    tab === 'likes'
      ? fetchUserLikes(page)
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
            <span className="text-sm text-muted flex items-center gap-1">
              <Users className="w-3 h-3" />
              <strong>{profile.following_count || 0}</strong> 关注
            </span>
            <span className="text-sm text-muted flex items-center gap-1">
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
      <div className="max-w-md mx-auto flex justify-center gap-3 mb-8">
        <FollowButton targetUserId={userId} />
        <Badge variant={roleVariant}>{profile.role}</Badge>
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
      <div className="border-b border-[var(--border)] dark:border-gray-700 mb-6">
        <nav className="flex gap-4">
          <Link
            href={`/users/${userId}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'posts'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            帖子
          </Link>
          <Link
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'replies'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            回复
          </Link>
          <Link
            href={`/users/${userId}?tab=bookmarks`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'bookmarks'
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
              tab === 'likes'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Heart className="w-4 h-4 inline mr-1" />
            点赞
          </Link>
        </nav>
      </div>

      {/* Content */}
      {tab === 'posts' && (
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

      {tab === 'replies' && (
        <>
          {repliesResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无回复</div>
          ) : (
            <div className="space-y-3">
              {repliesResult.data.map((reply) => (
                <div key={reply.id} className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 p-4">
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

      {tab === 'bookmarks' && (
        <>
          {bookmarksResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无收藏</div>
          ) : (
            <div className="space-y-3">
              {bookmarksResult.data.map((bookmark) => (
                <div key={bookmark.id} className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 p-4">
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

      {tab === 'likes' && (
        <>
          {likesResult.data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">暂无点赞</div>
          ) : (
            <div className="space-y-3">
              {likesResult.data.map((like) => (
                <div key={like.id} className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 p-4">
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
