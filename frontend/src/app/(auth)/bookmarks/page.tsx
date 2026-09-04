'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { bookmarkApi } from '@/lib/api/client';
import { Bookmark } from '@/types';
import { useAuth } from '@/lib/auth/context';
import { BookmarkIcon, Trash2, ExternalLink, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/loading-spinner';

export default function BookmarksPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/bookmarks');
    }
  }, [authLoading, isAuthenticated, router]);

  const loadBookmarks = useCallback(async (page: number) => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      const res = await bookmarkApi.list({ page, limit: 20 });

      let filtered = res.data;
      if (filter === 'published') filtered = res.data.filter(b => b.status === 'published');
      if (filter === 'draft') filtered = res.data.filter(b => b.status === 'draft');

      setBookmarks(filtered);
      setPagination(res.pagination);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      setBookmarks([]);
    }
    setLoading(false);
  }, [isAuthenticated, filter]);

  useEffect(() => {
    if (isAuthenticated) {
      loadBookmarks(1);
    }
  }, [isAuthenticated, loadBookmarks]);

  const handleRemoveBookmark = async (postId: number) => {
    setRemoving(postId);
    try {
      await bookmarkApi.remove(postId);
      setBookmarks(bookmarks.filter(b => b.post_id !== postId));
      setPagination(prev => ({
        ...prev,
        total: prev.total - 1,
        totalPages: Math.ceil((prev.total - 1) / prev.limit),
      }));
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
    setRemoving(null);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      published: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      deleted: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    const labels: Record<string, string> = {
      published: '已发布',
      draft: '草稿',
      pending: '待审核',
      deleted: '已删除',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${styles[status] || styles.published}`}>
        {labels[status] || status}
      </span>
    );
  };

  const handlePrevPage = () => {
    if (pagination.page > 1) {
      loadBookmarks(pagination.page - 1);
    }
  };

  const handleNextPage = () => {
    if (pagination.page < pagination.totalPages) {
      loadBookmarks(pagination.page + 1);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <LoadingSpinner variant="orbital" size="lg" />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100 flex items-center gap-2">
            <BookmarkIcon className="w-6 h-6" />
            我的收藏
          </h1>
          <p className="text-sm text-surface-500 dark:text-gray-400 mt-1">
            共 {pagination.total} 个收藏
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-surface-500 dark:text-gray-400" />
        {(['all', 'published', 'draft'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === f
                ? 'bg-[var(--primary)] text-white'
                : 'bg-surface-100 dark:bg-gray-700 text-surface-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-gray-600'
            }`}
          >
            {f === 'all' ? '全部' : f === 'published' ? '已发布' : '草稿'}
          </button>
        ))}
      </div>

      {/* Breadcrumb */}
      <div className="mb-6">
        <nav className="flex items-center gap-2 text-sm text-surface-500 dark:text-gray-400">
          <Link href="/" className="hover:text-[var(--primary)]">首页</Link>
          <span>/</span>
          <span className="text-surface-700 dark:text-gray-200">我的收藏</span>
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner variant="orbital" size="md" />
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="text-center py-16">
          <BookmarkIcon className="w-12 h-12 mx-auto text-surface-300 dark:text-gray-600 mb-4" />
          <p className="text-surface-400 dark:text-gray-500 mb-2">暂无收藏</p>
          <p className="text-sm text-surface-500 dark:text-gray-400">
            浏览帖子时点击收藏按钮即可添加到这里
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            去浏览帖子
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-surface-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <Link
                    href={`/posts/${bookmark.post_id}`}
                    className="block font-medium text-surface-900 dark:text-gray-100 hover:text-[var(--primary)] truncate mb-2"
                  >
                    {bookmark.title || '(无标题)'}
                  </Link>

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-sm">
                    {getStatusBadge(bookmark.status)}

                    {bookmark.category_name && (
                      <Link
                        href={`/categories/${bookmark.category_id}`}
                        className="text-surface-500 dark:text-gray-400 hover:text-[var(--primary)]"
                      >
                        {bookmark.category_name}
                      </Link>
                    )}

                    <span className="text-surface-400 dark:text-gray-500">
                      收藏于 {new Date(bookmark.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link
                    href={`/posts/${bookmark.post_id}`}
                    className="p-2 text-surface-500 dark:text-gray-400 hover:text-[var(--primary)] hover:bg-surface-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="查看帖子"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>

                  <button
                    onClick={() => handleRemoveBookmark(bookmark.post_id)}
                    disabled={removing === bookmark.post_id}
                    className="p-2 text-surface-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title="取消收藏"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={handlePrevPage}
            disabled={pagination.page === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-gray-700 text-surface-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            上一页
          </button>

          <span className="text-sm text-surface-500 dark:text-gray-400">
            第 {pagination.page} / {pagination.totalPages} 页
          </span>

          <button
            onClick={handleNextPage}
            disabled={pagination.page === pagination.totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-gray-700 text-surface-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一页
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}