'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import type { ModerationItem } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const FILTER_OPTIONS = [
  { value: 'posts', label: '帖子' },
  { value: 'replies', label: '回复' },
  { value: 'avatars', label: '头像' },
];

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('posts');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await adminApi.getModeration({ type: filter });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载审核队列失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleApprove = async (item: ModerationItem) => {
    try {
      setError(null);
      await adminApi.approvePost(item.id, item.item_type);
      setMessage('审核通过');
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '审核通过失败');
    }
  };

  const handleReject = async (item: ModerationItem) => {
    try {
      setError(null);
      await adminApi.rejectPost(item.id, item.item_type);
      setMessage('已拒绝');
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '拒绝失败');
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900">内容审核</h1>
          <p className="mt-1 text-sm text-surface-500">查看并处理待审核的帖子、回复和头像。</p>
        </div>
        <select
          className="rounded border border-surface-200 px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="overflow-hidden border border-surface-200 bg-white">
        {items.length === 0 ? (
          <div className="p-8 text-center text-surface-400">当前筛选下没有待审核内容。</div>
        ) : (
          <div>
            {items.map((item) => (
              <div
                key={`${item.item_type}-${item.id}`}
                className="flex items-start gap-4 border-b border-surface-100 p-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                      {item.item_type}
                    </span>
                    <span className="text-xs text-surface-400">{item.author_username}</span>
                    <span className="font-mono text-xs text-surface-400">
                      {new Date(item.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  {item.title ? (
                    <p className="truncate text-sm font-medium text-surface-900">{item.title}</p>
                  ) : null}
                  <p className="truncate text-sm text-surface-700">{item.content}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleApprove(item)}>
                    通过
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleReject(item)}>
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
