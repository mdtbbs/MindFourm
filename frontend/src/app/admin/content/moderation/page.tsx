'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import type { ModerationItem } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import EmptyState from '@/components/ui/empty-state';

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

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<ModerationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

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
      setTimeout(() => setMessage(null), 3000);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '审核通过失败');
    }
  };

  const handleRejectClick = (item: ModerationItem) => {
    setRejectTarget(item);
    setRejectReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    try {
      setError(null);
      await adminApi.rejectPost(rejectTarget.id, rejectTarget.item_type, rejectReason || undefined);
      setMessage('已拒绝');
      setTimeout(() => setMessage(null), 3000);
      setRejectTarget(null);
      setRejectReason('');
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '拒绝失败');
    } finally {
      setRejecting(false);
    }
  };

  if (loading && items.length === 0) {
    return <InlineLoading label="正在加载审核队列" className="min-h-32" />;
  }

  if (error && items.length === 0) {
    return <ErrorState title="审核队列加载失败" description={error} onRetry={fetchItems} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900">内容审核</h1>
          <p className="mt-1 text-sm text-surface-500">查看并处理待审核的帖子、回复和头像。</p>
        </div>
        <select
          className="border border-surface-200 px-3 py-2 text-sm"
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
      {error && items.length > 0 && <Alert type="error" message={error} />}
      {loading && items.length > 0 && <InlineLoading label="正在刷新审核队列" />}

      <div className="overflow-hidden border border-surface-200 bg-white">
        {items.length === 0 ? (
          <EmptyState title="当前筛选下没有待审核内容" className="border-0" />
        ) : (
          <div>
            {items.map((item) => (
              <div
                key={`${item.item_type}-${item.id}`}
                className="border-b border-surface-100 p-4 last:border-b-0"
              >
                <div className="flex items-start gap-4">
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
                      <a
                        href={`/posts/${item.item_type === 'post' ? item.id : item.post_id || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-surface-900 hover:text-[var(--primary)] underline decoration-surface-200 hover:decoration-[var(--primary)]"
                      >
                        {item.title}
                      </a>
                    ) : null}
                    <p className="mt-1 text-sm leading-relaxed text-surface-700 line-clamp-3 whitespace-pre-wrap">
                      {item.content}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleApprove(item)}>
                      通过
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleRejectClick(item)}>
                      拒绝
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRejectTarget(null)}>
          <div
            className="w-full max-w-md bg-white border border-surface-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-surface-200">
              <h3 className="text-sm font-semibold text-surface-900">拒绝原因</h3>
              <p className="text-xs text-surface-400 mt-1">
                拒绝「{rejectTarget.title || `${rejectTarget.item_type} #${rejectTarget.id}`}」，请填写原因（可选）
              </p>
            </div>
            <div className="px-6 py-4">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="例如：内容不符合社区规范..."
                rows={4}
                className="w-full px-3 py-2 text-sm border border-surface-200 focus:outline-none focus:border-surface-400"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-surface-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejectTarget(null)}>取消</Button>
              <Button variant="destructive" onClick={handleRejectConfirm} disabled={rejecting}>
                {rejecting ? '处理中...' : '确认拒绝'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
