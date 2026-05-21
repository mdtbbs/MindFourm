import { serverApi } from '@/lib/api/client';
import { Server } from '@/types';
import Link from 'next/link';
import { Users, Server as ServerIcon, MapPin, Waves } from 'lucide-react';

export const revalidate = 30;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchServers(): Promise<Server[]> {
  try {
    const res = await fetch(`${API_BASE}/api/servers/public`, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? (json.servers || []) : [];
  } catch {
    return [];
  }
}

export default async function ServersPage() {
  const servers = await fetchServers();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          <ServerIcon className="w-6 h-6 inline mr-2 text-[var(--primary)]" />
          游戏服务器
        </h1>
        <Link
          href="/servers/apply"
          className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
        >
          申请服务器
        </Link>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-12 bg-[var(--bg-card)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)]">
          <ServerIcon className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
          <p className="text-[var(--text-muted)] mb-4">暂无在线服务器</p>
          <Link
            href="/servers/apply"
            className="inline-flex items-center px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
          >
            申请第一个服务器
          </Link>
        </div>
      ) : (
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
      )}

      {/* Info section */}
      <div className="mt-8 bg-[var(--bg-elevated)] rounded-[var(--radius)] p-4 text-sm text-[var(--text-secondary)]">
        <p className="mb-2">
          <strong className="text-[var(--text)]">连接方式:</strong> 在 Mindustry 游戏中使用 <code className="bg-[var(--bg)] px-1 rounded-[var(--radius-sm)]">连接 IP:端口</code> 命令
        </p>
        <p>
          <strong className="text-[var(--text)]">申请服务器:</strong> 登录后可申请创建自己的游戏服务器，经管理员审批后即可使用
        </p>
      </div>
    </div>
  );
}