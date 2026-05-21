'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { ServerIcon, Link2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Server {
  id: number;
  name: string;
  status: string;
}

interface ServerSelectorProps {
  value: number | null;
  onChange: (serverId: number | null) => void;
  postType: string;
  onPostTypeChange: (type: string) => void;
}

export function ServerSelector({ value, onChange, postType, onPostTypeChange }: ServerSelectorProps) {
  const { isAuthenticated } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    fetch(`${API_BASE}/api/v1/post-servers/my-servers`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.servers) {
          setServers(data.servers);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated || loading) {
    return null;
  }

  if (servers.length === 0) {
    return (
      <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
        <Link2 className="w-4 h-4" />
        <span>您还没有服务器，</span>
        <a href="/apply-server" className="text-[var(--primary)] hover:text-[var(--primary-dark)]">
          申请一个
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-[var(--bg-elevated)] rounded-[var(--radius)]">
      <div className="flex items-center gap-2">
        <ServerIcon className="w-4 h-4 text-[var(--primary)]" />
        <span className="text-sm font-medium text-[var(--text)]">关联服务器（可选）</span>
      </div>

      <select
        value={value || ''}
        onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)}
        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] text-[var(--text)]"
      >
        <option value="">不关联服务器</option>
        {servers.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {value && (
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">帖子类型</label>
          <select
            value={postType}
            onChange={e => onPostTypeChange(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] text-[var(--text)]"
          >
            <option value="normal">普通帖子</option>
            <option value="server_help">服务器求助</option>
            <option value="server_intro">服务器介绍</option>
          </select>
        </div>
      )}
    </div>
  );
}