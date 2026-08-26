'use client';

import { useState, useCallback } from 'react';
import { friendsApi, type FriendSearchResult } from '@/lib/api/client';

export default function FriendSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setHasSearched(true);
    setError(null);
    try {
      const users = await friendsApi.search(q, 10);
      setResults(users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const sendRequest = async (userId: number) => {
    try {
      await friendsApi.sendRequest(userId);
      setSentRequests((prev) => new Set(prev).add(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    }
  };

  return (
    <div className="card p-4">
      <h2 className="text-lg font-bold mb-3">添加好友</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="搜索用户名…"
        />
        <button
          onClick={doSearch}
          disabled={searching || !query.trim()}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {searching ? '搜索中…' : '搜索'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      {results.length > 0 && (
        <div className="mt-3 space-y-1">
          {results.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium">{user.username}</span>
              </div>
              <button
                onClick={() => sendRequest(user.id)}
                disabled={sentRequests.has(user.id)}
                className="rounded bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {sentRequests.has(user.id) ? '已发送 ✓' : '添加好友'}
              </button>
            </div>
          ))}
        </div>
      )}

      {hasSearched && !searching && !error && results.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">未找到符合条件的用户</p>
      )}
    </div>
  );
}
