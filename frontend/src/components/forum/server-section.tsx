'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, MapPin, Waves } from 'lucide-react';

interface Server {
  id: number;
  name: string;
  port: number;
  status: 'running' | 'stopped' | 'pending';
  version: string;
  players: number;
  playerList: { name: string }[];
  mapName: string;
  wave: number;
  description?: string;
}


function ServerSkeleton() {
  return (
    <div className="server-card animate-pulse">
      <div className="server-card-header">
        <div className="h-5 bg-surface-200 dark:bg-gray-700 rounded w-32" />
        <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-16" />
      </div>
      <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-full mt-2" />
      <div className="server-meta">
        <div className="h-3 bg-surface-200 dark:bg-gray-700 rounded w-8" />
        <div className="h-3 bg-surface-200 dark:bg-gray-700 rounded w-10" />
        <div className="h-3 bg-surface-200 dark:bg-gray-700 rounded w-12" />
      </div>
      <div className="server-player-list">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-16" />
        ))}
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: Server }) {
  return (
    <div className="server-card">
      <div className="server-card-header">
        <span className="server-name">{server.name}</span>
        <span className={`server-status server-status-${server.status}`}>
          {server.status === 'running' ? '在线' :
           server.status === 'stopped' ? '离线' : '待审批'}
        </span>
      </div>
      {server.description && (
        <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
          {server.description}
        </p>
      )}
      <div className="server-meta">
        <span>v{server.version}</span>
        <span className="flex items-center gap-0.25">
          <Users className="w-3 h-3" />
          {server.players}
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
            {server.wave}
          </span>
        )}
      </div>
      {server.playerList && server.playerList.length > 0 && (
        <div className="server-player-list">
          {server.playerList.slice(0, 6).map((player, idx) => (
            <span key={idx} className="server-player-item">{player.name}</span>
          ))}
          {server.playerList.length > 6 && (
            <span className="server-player-item">+{server.playerList.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ServerSection() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/servers/public')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.servers) {
          setServers(data.servers);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="server-section">
        <div className="server-section-header">
          <h2 className="server-section-title">在线服务器</h2>
        </div>
        <div className="server-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <ServerSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  const runningServers = servers.filter(s => s.status === 'running');
  if (runningServers.length === 0) {
    return null;
  }

  return (
    <section className="server-section">
      <div className="server-section-header">
        <h2 className="server-section-title">
          在线服务器 ({runningServers.length})
        </h2>
        <Link
          href="/servers"
          className="text-sm text-[var(--primary)] hover:text-[var(--primary-dark)]"
        >
          查看全部 →
        </Link>
      </div>
      <div className="server-grid">
        {runningServers.slice(0, 6).map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>
    </section>
  );
}

export default ServerSection;