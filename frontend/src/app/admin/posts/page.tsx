'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminApi, categoryApi, postApi } from '@/lib/api/client';
import { Category, Post } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import Pagination from '@/components/ui/pagination';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';

const PAGE_SIZE = 20;

type AdminPostRow = Post & {
  status: string;
  is_pinned: boolean | number;
  category?: { id: number; name: string } | null;
  category_name?: string | null;
  user?: { id: number; username: string | null; email?: string | null } | null;
};

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'deleted', label: '已删除' },
];

function buildPageUrl(page: number, status: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (status !== 'all') params.set('status', status);
  const query = params.toString();
  return query ? `/admin/posts?${query}` : '/admin/posts';
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="warning">待审核</Badge>;
    case 'published':
      return <Badge variant="success">已发布</Badge>;
    case 'draft':
      return <Badge variant="default">草稿</Badge>;
    case 'deleted':
      return <Badge variant="danger">已删除</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

export default function AdminPostsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [posts, setPosts] = useState<AdminPostRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Record<number, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const currentPage = Number(searchParams?.get('page')) || 1;
  const currentStatus = searchParams?.get('status') || 'all';

  const fetchPosts = useCallback(
    async (pageNum: number, status: string) => {
      try {
        setLoading(true);
        setError(null);
        const result = await adminApi.getPosts({
          page: pageNum,
          limit: PAGE_SIZE,
          status: status === 'all' ? undefined : status,
        });
        setPosts(result.data as AdminPostRow[]);
        setTotalPages(result.pagination.totalPages);
        setSelectedIds([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载帖子失败');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchCategories = useCallback(async () => {
    try {
      const data = await categoryApi.getList();
      setCategories(data.filter((category) => category.is_active));
    } catch {
      // Ignore category loading failures in the management table.
    }
  }, []);

  useEffect(() => {
    fetchPosts(currentPage, currentStatus);
  }, [currentPage, currentStatus, fetchPosts]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const showActionSuccess = (message: string) => {
    setActionSuccess(message);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const showActionError = (message: string) => {
    setActionError(message);
    setTimeout(() => setActionError(null), 5000);
  };

  const setButtonLoading = (id: number, isLoading: boolean) => {
    setActionInProgress((prev) => ({ ...prev, [id]: isLoading }));
  };

  const handleTogglePin = async (post: AdminPostRow) => {
    const pinned = Boolean(post.is_pinned);

    try {
      setButtonLoading(post.id, true);
      setActionError(null);
      await adminApi.pinPost(post.id, !pinned);
      showActionSuccess(pinned ? '已取消置顶' : '已置顶');
      await fetchPosts(currentPage, currentStatus);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : '更新置顶状态失败');
    } finally {
      setButtonLoading(post.id, false);
    }
  };

  const handleMovePost = async (postId: number, categoryId: number) => {
    try {
      setButtonLoading(postId, true);
      setActionError(null);
      await adminApi.movePost(postId, categoryId);
      showActionSuccess('帖子分类已更新');
      await fetchPosts(currentPage, currentStatus);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : '移动帖子失败');
    } finally {
      setButtonLoading(postId, false);
    }
  };

  const handleDelete = async (post: AdminPostRow) => {
    if (!confirm(`确定删除帖子“${post.title}”吗？`)) return;

    try {
      setButtonLoading(post.id, true);
      setActionError(null);
      await postApi.delete(post.id);
      showActionSuccess('帖子已删除');
      const nextPage = posts.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      router.push(buildPageUrl(nextPage, currentStatus));
    } catch (err) {
      showActionError(err instanceof Error ? err.message : '删除帖子失败');
    } finally {
      setButtonLoading(post.id, false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === posts.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(posts.map((post) => post.id));
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`确定删除选中的 ${selectedIds.length} 个帖子吗？`)) return;

    setBulkActionLoading(true);
    try {
      await adminApi.bulkDeletePosts(selectedIds);
      showActionSuccess(`已删除 ${selectedIds.length} 个帖子`);
      await fetchPosts(currentPage, currentStatus);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkPin = async (isPinned: boolean) => {
    if (!selectedIds.length) return;

    setBulkActionLoading(true);
    try {
      await adminApi.bulkPinPosts(selectedIds, isPinned);
      showActionSuccess(isPinned ? '已批量置顶' : '已批量取消置顶');
      await fetchPosts(currentPage, currentStatus);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : '批量置顶失败');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const moveSelectOptions = [
    { value: '', label: '移动到...' },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ];

  if (loading && posts.length === 0) {
    return <InlineLoading label="正在加载帖子" className="min-h-64" />;
  }

  if (error && posts.length === 0) {
    return (
      <ErrorState
        title="帖子加载失败"
        description={error}
        onRetry={() => fetchPosts(currentPage, currentStatus)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900">帖子管理</h1>
          <p className="text-sm text-surface-500">这里会显示全部帖子，包括待审核内容。</p>
        </div>
        <div className="w-full max-w-xs">
          <Select
            options={STATUS_OPTIONS}
            value={currentStatus}
            onChange={(event) => router.push(buildPageUrl(1, event.target.value))}
          />
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-4 border border-surface-200 bg-white px-4 py-3">
          <span className="text-sm text-surface-600">已选择 {selectedIds.length} 项</span>
          <Button
            variant="destructive"
            size="sm"
            disabled={bulkActionLoading}
            onClick={handleBulkDelete}
          >
            删除选中
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkActionLoading}
            onClick={() => handleBulkPin(true)}
          >
            置顶选中
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkActionLoading}
            onClick={() => handleBulkPin(false)}
          >
            取消置顶
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
            清空选择
          </Button>
        </div>
      ) : null}

      {actionSuccess ? <Alert type="success" message={actionSuccess} /> : null}
      {actionError ? <Alert type="error" message={actionError} /> : null}
      {error ? <Alert type="error" message={error} /> : null}
      {loading && posts.length > 0 ? <InlineLoading label="正在刷新帖子" /> : null}

      <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-surface-200 bg-surface-50 text-xs uppercase text-surface-600">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={posts.length > 0 && selectedIds.length === posts.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 accent-surface-900"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">标题</th>
                <th className="px-4 py-3 font-semibold">状态</th>
                <th className="px-4 py-3 font-semibold">分类</th>
                <th className="px-4 py-3 text-center font-semibold">置顶</th>
                <th className="px-4 py-3 text-center font-semibold">浏览</th>
                <th className="px-4 py-3 font-semibold">创建时间</th>
                <th className="px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {posts.map((post) => {
                const pinned = Boolean(post.is_pinned);
                const categoryName = post.category?.name || post.category_name;

                return (
                  <tr key={post.id} className="transition-colors hover:bg-surface-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(post.id)}
                        onChange={() => toggleSelect(post.id)}
                        className="h-4 w-4 accent-surface-900"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-surface-500">{post.id}</td>
                    <td className="max-w-xs px-4 py-3 text-surface-900">
                      <p className="truncate font-medium">{post.title}</p>
                      {post.user?.username ? (
                        <p className="mt-1 text-xs text-surface-400">{post.user.username}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(post.status)}</td>
                    <td className="px-4 py-3 text-surface-700">
                      {categoryName ? (
                        categoryName
                      ) : (
                        <span className="italic text-surface-400">未分类</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pinned ? <Badge variant="warning">已置顶</Badge> : <span className="text-surface-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-surface-700">{post.view_count}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-surface-500">
                      {new Date(post.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionInProgress[post.id]}
                          onClick={() => handleTogglePin(post)}
                        >
                          {pinned ? '取消置顶' : '置顶'}
                        </Button>

                        <Select
                          className="!w-auto min-w-[130px]"
                          options={moveSelectOptions}
                          defaultValue=""
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value) {
                              handleMovePost(post.id, Number(value));
                            }
                          }}
                        />

                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={actionInProgress[post.id]}
                          onClick={() => handleDelete(post)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {posts.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-surface-500">
                    当前筛选下没有帖子。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/admin/posts"
        queryParams={currentStatus !== 'all' ? { status: currentStatus } : {}}
      />
    </div>
  );
}
