'use client';

import { useState, useEffect, useCallback } from 'react';
import { friendsApi, type FriendRequestItem } from '@/lib/api/client';

export default function FriendRequests() {
  const [requests, setRequests] = useState<FriendRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<number>>(new Set());

  const fetchRequests = useCallback(async () => {
    try {
      const res = await friendsApi.getRequests(1, 20);
      setRequests(res.requests || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAccept = async (userId: number) => {
    setProcessing((prev) => new Set(prev).add(userId));
    try {
      await friendsApi.acceptRequest(userId);
      setRequests((prev) => prev.filter((r) => r.requester.id !== userId));
    } catch {
      // silent
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleReject = async (userId: number) => {
    setProcessing((prev) => new Set(prev).add(userId));
    try {
      await friendsApi.rejectRequest(userId);
      setRequests((prev) => prev.filter((r) => r.requester.id !== userId));
    } catch {
      // silent
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <div className="card p-4 border-yellow-200 dark:border-yellow-900">
      <h2 className="text-lg font-bold mb-3">
        待处理好友请求
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({requests.length})
        </span>
      </h2>
      <div className="space-y-1">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-sm font-bold text-yellow-700 dark:text-yellow-400">
                {req.requester.username[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium">{req.requester.username}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(req.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAccept(req.requester.id)}
                disabled={processing.has(req.requester.id)}
                className="rounded bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50"
              >
                接受
              </button>
              <button
                onClick={() => handleReject(req.requester.id)}
                disabled={processing.has(req.requester.id)}
                className="rounded bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
