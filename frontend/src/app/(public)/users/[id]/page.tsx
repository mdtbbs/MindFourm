import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import Badge from '@/components/ui/badge';
import { PostListResponse, UserRole } from '@/types';
import { Calendar } from 'lucide-react';

async function fetchUserPosts(userId: number, page: number): Promise<PostListResponse> {
  try {
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/posts?page=${page}&limit=20&user_id=${userId}`, { cache: 'no-store' });
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

  const postsResult = await fetchUserPosts(userId, page);

  // User info from first post's author data, or show ID only
  const firstPost = postsResult.data[0] || null;
  const displayName = firstPost
    ? `User ${firstPost.author_mindauth_id}`
    : `User #${userId}`;
  const displayRole = (firstPost?.author_role || 'user') as UserRole;
  const firstSeen = firstPost?.created_at || null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* User Info Card */}
      <div className="bg-white rounded-lg border border-surface-200 p-6 mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar placeholder */}
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-600">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-surface-900 mb-1">
              {displayName}
            </h1>
            <div className="flex items-center gap-3 mb-3">
              <Badge
                variant={displayRole === 'admin' ? 'warning' : displayRole === 'moderator' ? 'success' : 'default'}
              >
                {displayRole}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-surface-500">
              {firstSeen && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  首次发帖 {new Date(firstSeen).toLocaleDateString('zh-CN')}
                </span>
              )}
            </div>
            <div className="mt-3 text-sm text-surface-600">
              发帖数: {postsResult.pagination.total} | 回复数: 待后端补充
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200 mb-6">
        <nav className="flex gap-4">
          <a
            href={`/users/${userId}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'posts'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            发布的帖子
          </a>
          <a
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'replies'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            发表的回复
          </a>
        </nav>
      </div>

      {/* Content */}
      {tab === 'posts' && (
        <>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">暂无帖子</div>
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
        <div className="text-center py-12 text-surface-500">
          此功能需要后端补充用户回复列表 API
        </div>
      )}
    </div>
  );
}
