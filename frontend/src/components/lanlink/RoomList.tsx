'use client';

import { useState, useEffect, useCallback } from 'react';
import { lanlinkClient, type PublicRoom } from '@/lib/api/lanlinkClient';
import Badge from '@/components/ui/badge';

const POLL_INTERVAL = 15000;

export default function RoomList() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await lanlinkClient.getPublicRooms();
      setRooms(data.rooms || []);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message !== 'login_required') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const timer = setInterval(fetchRooms, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchRooms]);

  const copyRoomCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // fallback
    }
  };

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">加载房间列表中…</div>;
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          公开房间
          {rooms.length > 0 && (
            <Badge variant="success">{rooms.length}</Badge>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">每 15 秒自动刷新</span>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3">{error}</p>
      )}

      {rooms.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">暂无公开房间</p>
      ) : (
        <div className="space-y-2">
          {rooms.map((room) => (
            <div
              key={room.code}
              className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-bold text-primary">
                    {room.code}
                  </code>
                  {room.name && (
                    <span className="text-sm truncate">{room.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>
                    房主:{' '}
                    {room.owner.display_name || room.owner.username || '匿名'}
                  </span>
                  <span>节点: {room.node.name || room.node.id}</span>
                </div>
              </div>
              <button
                onClick={() => copyRoomCode(room.code)}
                className="ml-3 shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {copiedCode === room.code ? '已复制 ✓' : '复制房间码'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
