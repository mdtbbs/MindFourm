import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import Badge from '@/components/ui/badge';
import { UserProfile, PostListResponse, Reply } from '@/types';
import { Calendar, MessageSquare, FileText, Bookmark } from 'lucide-react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ProfileEditLink from '@/components/forum/profile-edit-link';

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchUserProfile(userId: number): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/users/${userId}`, { next: { tags: [`user-${userId}`] } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

async function fetchUserPosts(userId: number, page: number): Promise<PostListResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/posts?page=${page}&limit=20&user_id=${userId}`, { next: { tags: ['posts'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

async function fetchUserReplies(userId: number, page: number): Promise<{ data: Reply[]; pagination: PostListResponse['pagination'] }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/users/${userId}/replies?page=${page}&limit=20`, { next: { tags: ['replies'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
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

  const [postsResult, repliesResult] = await Promise.all([
    tab === 'posts' ? fetchUserPosts(userId, page) : Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } as PostListResponse['pagination'] }),
    tab === 'replies' ? fetchUserReplies(userId, page) : Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } as PostListResponse['pagination'] }),
  ]);

  const displayName = profile.username || `User #${profile.id}`;
  const roleVariant = profile.role === 'admin' ? 'warning' : profile.role === 'moderator' ? 'success' : 'default' as const;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* User Info Card */}
      <div className="bg-white rounded-lg border border-surface-200 p-6 mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-600 shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-surface-900 mb-1">
              {displayName}
            </h1>
            <div className="flex items-center gap-3 mb-3">
              <Badge variant={roleVariant}>{profile.role}</Badge>
              <ProfileEditLink userId={profile.id} />
            </div>
            {profile.bio && (
              <p className="text-sm text-surface-600 mb-3">{profile.bio}</p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-surface-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                加入于 {new Date(profile.created_at).toLocaleDateString('zh-CN')}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {profile.post_count} 帖子
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                {profile.reply_count} 回复
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200 mb-6">
        <nav className="flex gap-4">
          <Link
            href={`/users/${userId}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'posts'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            帖子
          </Link>
          <Link
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'replies'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            回复
          </Link>
          <Link
            href={`/users/${userId}?tab=bookmarks`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'bookmarks'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            <Bookmark className="w-4 h-4 inline mr-1" />
            收藏
          </Link>
        </nav>
      </div>

      {/* Content */}
      {tab === 'posts' && (
        <>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">暂无帖</div>
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
            <div className="text-center py-12 text-surface-500">暂无回复</div>
          ) : (
            <div className="space-y-3">
              {repliesResult.data.map((reply) => (
                <div key={reply.id} className="bg-white rounded-lg border border-surface-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-surface-500 mb-2">
                    <Link href={`/posts/${reply.post_id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                      {reply.post_title || '帖子'}
                    </Link>
                    <span>·</span>
                    <span>{new Date(reply.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  <p className="text-sm text-surface-700 line-clamp-3">{reply.content}</p>
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
        <div className="text-center py-12 text-surface-500">
          收藏功能需要登录后查看
        </div>
      )}
    </div>
  );
}
