'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { adminApi, categoryApi, postApi } from '@/lib/api/client';
import { Category, Post } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import Pagination from '@/components/ui/pagination';

const PAGE_SIZE = 20;

export default function AdminPostsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
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

  const fetchPosts = useCallback(
    async (pageNum: number) => {
      try {
        setLoading(true);
        setError(null);
        const result = await postApi.getList({ page: pageNum, limit: PAGE_SIZE });
        setPosts(result.data);
        setTotalPages(result.pagination.totalPages);
        setSelectedIds([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchCategories = useCallback(async () => {
    try {
      const data = await categoryApi.getList();
      setCategories(data.filter((c: Category) => c.is_active));
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchPosts(currentPage);
  }, [currentPage, fetchPosts]);

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

  const handleTogglePin = async (post: Post) => {
    try {
      setButtonLoading(post.id, true);
      setActionError(null);
      await adminApi.pinPost(post.id, !post.is_pinned);
      showActionSuccess(
        post.is_pinned ? `Post "${post.title}" unpinned` : `Post "${post.title}" pinned`
      );
      await fetchPosts(currentPage);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : 'Failed to toggle pin');
    } finally {
      setButtonLoading(post.id, false);
    }
  };

  const handleMovePost = async (postId: number, categoryId: number) => {
    try {
      setButtonLoading(postId, true);
      setActionError(null);
      await adminApi.movePost(postId, categoryId);
      showActionSuccess('Post moved successfully');
      await fetchPosts(currentPage);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : 'Failed to move post');
    } finally {
      setButtonLoading(postId, false);
    }
  };

  const handleDelete = async (post: Post) => {
    if (!confirm(`Delete post "${post.title}"? This action cannot be undone.`)) return;
    try {
      setButtonLoading(post.id, true);
      setActionError(null);
      await postApi.delete(post.id);
      showActionSuccess(`Post "${post.title}" deleted`);
      const nextPage = posts.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      router.push(nextPage === 1 ? '/admin/posts' : `/admin/posts?page=${nextPage}`);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : 'Failed to delete post');
    } finally {
      setButtonLoading(post.id, false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === posts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(posts.map((p) => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected posts?`)) return;
    setBulkActionLoading(true);
    try {
      await adminApi.bulkDeletePosts(selectedIds);
      showActionSuccess(`${selectedIds.length} posts deleted`);
      setSelectedIds([]);
      await fetchPosts(currentPage);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkPin = async (isPinned: boolean) => {
    if (!selectedIds.length) return;
    setBulkActionLoading(true);
    try {
      await adminApi.bulkPinPosts(selectedIds, isPinned);
      showActionSuccess(`${selectedIds.length} posts ${isPinned ? 'pinned' : 'unpinned'}`);
      await fetchPosts(currentPage);
    } catch (err) {
      showActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const moveSelectOptions = [
    { value: '', label: 'Move to...' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-surface-500">Loading posts...</p>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="space-y-4">
        <Alert type="error" message={error} />
        <Button onClick={() => fetchPosts(currentPage)}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900">Post Management</h1>
        <span className="text-sm text-surface-500">
          {posts.length} post{posts.length !== 1 ? 's' : ''} on this page
        </span>
      </div>

      {selectedIds.length > 0 && (
        <div className="bg-white border border-surface-200 px-4 py-3 flex items-center gap-4">
          <span className="text-sm text-surface-600">
            {selectedIds.length} selected
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={bulkActionLoading}
            onClick={handleBulkDelete}
          >
            Delete Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkActionLoading}
            onClick={() => handleBulkPin(true)}
          >
            Pin Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkActionLoading}
            onClick={() => handleBulkPin(false)}
          >
            Unpin Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
          >
            Clear
          </Button>
        </div>
      )}

      {actionSuccess && <Alert type="success" message={actionSuccess} />}
      {actionError && <Alert type="error" message={actionError} />}

      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={posts.length > 0 && selectedIds.length === posts.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-surface-900"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold text-center">Pinned</th>
                <th className="px-4 py-3 font-semibold text-center">Views</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(post.id)}
                      onChange={() => toggleSelect(post.id)}
                      className="w-4 h-4 accent-surface-900"
                    />
                  </td>
                  <td className="px-4 py-3 text-surface-500 font-mono text-xs">{post.id}</td>
                  <td className="px-4 py-3 font-medium text-surface-900 max-w-xs truncate">
                    {post.title}
                  </td>
                  <td className="px-4 py-3 text-surface-700">
                    {post.category_name ?? (
                      <span className="text-surface-400 italic">No category</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {post.is_pinned ? (
                      <Badge variant="warning">Pinned</Badge>
                    ) : (
                      <span className="text-surface-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-surface-700">{post.view_count}</td>
                  <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                    {new Date(post.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionInProgress[post.id]}
                        onClick={() => handleTogglePin(post)}
                      >
                        {post.is_pinned ? 'Unpin' : 'Pin'}
                      </Button>

                      <Select
                        className="!w-auto min-w-[130px]"
                        options={moveSelectOptions}
                        defaultValue=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            handleMovePost(post.id, Number(val));
                          }
                        }}
                      />

                      <Button
                        variant="danger"
                        size="sm"
                        disabled={actionInProgress[post.id]}
                        onClick={() => handleDelete(post)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-surface-500">
                    No posts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/admin/posts"
      />
    </div>
  );
}
