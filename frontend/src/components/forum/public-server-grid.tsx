'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { serverApi } from '@/lib/api/client';
import { Server } from '@/types';
import { Server as ServerIcon, Users, MapPin, Waves, Loader2 } from 'lucide-react';

export default function PublicServerGrid() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    serverApi.getPublicServers()
      .then(res => {
        setServers(res.servers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
        <span className="ml-3 text-[var(--text-secondary)]">加载服务器...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--error)] mb-3">加载失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-[var(--radius)]"
        >
          刷新
        </button>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="text-center py-12 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)]">
        <ServerIcon className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
        <p className="text-[var(--text-muted)]">暂无在线服务器</p>
      </div>
    );
  }

  return (
    <div>
      <div className="server-grid">
        {servers.map((server) => (
          <div
            key={server.id}
            className="server-card"
          >
            <div className="server-card-header">
              <span className="server-name">{server.name}</span>
              <span className={`server-status server-status-${server.status}`}>
                {server.status === 'running' ? '运行中' : server.status}
              </span>
            </div>
            {server.description && (
              <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">
                {server.description}
              </p>
            )}
            <div className="server-meta">
              <span className="flex items-center gap-0.25">
                <ServerIcon className="w-3 h-3" />
                v{server.version}
              </span>
              <span className="flex items-center gap-0.25">
                <Users className="w-3 h-3" />
                {server.players} 在线
              </span>
              {server.mapName && server.mapName !== 'unknown' && (
                <span className="flex items-center gap-0.25">
                  <MapPin className="w-3 h-3" />
                  {server.mapName}
                </span>
              )}
              {server.wave > 0 && (
                <span className="flex items-center gap-0.25">
                  <Waves className="w-3 h-3" />
                  波次 {server.wave}
                </span>
              )}
            </div>

            {server.playerList && server.playerList.length > 0 && (
              <div className="server-player-list">
                {server.playerList.slice(0, 8).map((player, idx) => (
                  <span key={idx} className="server-player-item">{player.name}</span>
                ))}
                {server.playerList.length > 8 && (
                  <span className="server-player-item">+{server.playerList.length - 8}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Info section */}
      <div className="mt-8 bg-[var(--bg-elevated)] rounded-[var(--radius)] p-4 text-sm text-[var(--text-secondary)]">
        <p className="mb-2">
          <strong className="text-[var(--text)]">连接方式:</strong> 在 Mindustry 游戏中使用 <code className="bg-[var(--bg)] px-1 rounded-[var(--radius-sm)]">IP:端口</code> 连接
        </p>
        <p>
          <strong className="text-[var(--text)]">申请服务器:</strong> 登录后可申请创建自己的游戏服务器，经管理员审批后即可使用
        </p>
      </div>
    </div>
  );
}
