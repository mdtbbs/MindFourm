'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, MapPin, Waves } from 'lucide-react';
import { serverApi } from '@/lib/api/client';
import type { Server } from '@/types';

function ServerCard({ server }: { server: Server }) {
  return (
    <div className="panel-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--foreground)]">{server.name}</span>
        <span
          className={`border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${
            server.status === 'running'
              ? 'border-[rgba(47,128,237,0.25)] text-[var(--primary)]'
              : 'border-[var(--border)] text-[var(--muted-foreground)]'
          }`}
        >
          {server.status === 'running' ? '在线' : server.status === 'stopped' ? '离线' : '维护'}
        </span>
      </div>
      {server.description && (
        <p className="mb-3 text-sm leading-6 text-[var(--muted-foreground)] line-clamp-2">
          {server.description}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
        <span>v{server.version}</span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {server.players}
        </span>
        {server.mapName && server.mapName !== 'unknown' && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {server.mapName}
          </span>
        )}
        {server.wave > 0 && (
          <span className="flex items-center gap-1">
            <Waves className="h-3 w-3" />
            {server.wave}
          </span>
        )}
      </div>
      {server.playerList && server.playerList.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {server.playerList.slice(0, 6).map((player, idx) => (
            <span key={idx} className="border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[11px] text-[var(--foreground)]">
              {player.name}
            </span>
          ))}
          {server.playerList.length > 6 && (
            <span className="border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[11px] text-[var(--foreground)]">
              +{server.playerList.length - 6}
            </span>
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
    let cancelled = false;

    serverApi.getPublicServers()
      .then((data) => {
        if (cancelled) return;
        setServers(Array.isArray(data.servers) ? data.servers : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="panel-surface p-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">正在加载服务器</h2>
      </section>
    );
  }

  const runningServers = servers.filter(s => s.status === 'running');
  if (runningServers.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="panel-surface flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          在线服务器 ({runningServers.length})
        </h2>
        <Link href="/servers" className="text-sm text-[var(--primary)] hover:text-[var(--primary-dark)]">
          查看全部
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {runningServers.slice(0, 6).map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>
    </section>
  );
}

export default ServerSection;
