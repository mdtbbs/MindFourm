'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { serverApi } from '@/lib/api/client';
import { Server } from '@/types';
import { Server as ServerIcon, Users, MapPin, Waves, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export default function PublicServerGrid() {
  const { t } = useI18n();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(() => {
    setLoading(true);
    setError(null);
    serverApi.getPublicServers()
      .then(res => {
        setServers(res.servers || []);
      })
      .catch(() => setError(t('servers.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
        <span className="ml-3 text-[var(--text-secondary)]">{t('servers.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--error)] mb-3">{error}</p>
        <button
          onClick={loadServers}
          className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-[var(--radius)]"
        >
          {t('servers.refresh')}
        </button>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="text-center py-12 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)]">
        <ServerIcon className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
        <p className="text-[var(--text-muted)]">{t('servers.empty')}</p>
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
                {server.status === 'running' ? t('servers.online') : server.status}
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
                {server.players} {t('servers.players')}
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
                  {t('servers.wave', { wave: server.wave })}
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
          <strong className="text-[var(--text)]">{t('servers.howToJoin')}:</strong> {t('servers.howToJoinBody')}
        </p>
        <p>
          <strong className="text-[var(--text)]">{t('servers.applyHint')}:</strong> {t('servers.applyHintBody')}
        </p>
      </div>
    </div>
  );
}
