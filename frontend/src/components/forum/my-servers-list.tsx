'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { serverApi } from '@/lib/api/client';
import { Server } from '@/types';
import ServerStatusBadge from '@/components/ui/server-status-badge';
import { Loader2, Server as ServerIcon, Plus } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export default function MyServersList() {
  const { t, locale } = useI18n();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServers = () => {
    setLoading(true);
    setError(null);
    serverApi.getUserServers()
      .then(res => {
        setServers(res.servers || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadServers();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
        <span className="ml-3 text-[var(--text-secondary)]">{t('servers.loadingShort')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--error)] mb-3">{error}</p>
        <button
          onClick={loadServers}
          className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-[var(--radius)] hover:bg-[var(--primary-dark)]"
        >
          {t('servers.retry')}
        </button>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="text-center py-12 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)]">
        <ServerIcon className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
        <p className="text-[var(--text-secondary)] mb-4">{t('servers.empty')}</p>
        <Link
          href="/servers?section=apply"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('servers.apply')}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">{t('servers.colName')}</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">{t('servers.colVersion')}</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">{t('servers.colPort')}</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">{t('servers.colStatus')}</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">{t('servers.colCreated')}</th>
          </tr>
        </thead>
        <tbody>
          {servers.map(server => (
            <tr key={server.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
              <td className="px-4 py-3 font-medium text-[var(--text)]">{server.name}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">v{server.version}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)] font-mono">{server.port}</td>
              <td className="px-4 py-3">
                <ServerStatusBadge
                  status={server.approval_status || server.status}
                />
              </td>
              <td className="px-4 py-3 text-[var(--text-muted)]">
                {new Date(server.created_at).toLocaleDateString(locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
