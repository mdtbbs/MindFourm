'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { ModerationItem } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('posts');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getModeration({ type: filter });
      setItems(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleApprove = async (id: number) => {
    try { await adminApi.approvePost(id); setMessage('Approved'); fetchItems(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleReject = async (id: number) => {
    try { await adminApi.rejectPost(id); setMessage('Rejected'); fetchItems(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Content Moderation</h1>
          <p className="text-sm text-surface-500 mt-1">Review pending posts and replies</p>
        </div>
        <select className="px-3 py-2 border border-surface-200 rounded text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="posts">Posts</option>
          <option value="replies">Replies</option>
        </select>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="bg-white border border-surface-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No pending items</div>
        ) : (
          <div>
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-4 p-4 border-b border-surface-100 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">{item.item_type}</span>
                    <span className="text-xs text-surface-400">{item.author_username}</span>
                    <span className="text-xs text-surface-400 font-mono">{new Date(item.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  <p className="text-sm text-surface-700 truncate">{item.content}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleApprove(item.id)}>Approve</Button>
                  <Button variant="danger" size="sm" onClick={() => handleReject(item.id)}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
