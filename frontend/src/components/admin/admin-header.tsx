'use client';

import { useAuth } from '@/lib/auth/context';
import { LogOut } from 'lucide-react';

export default function AdminHeader() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <header style={{
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>MindForum 管理后台</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {user?.username} ({user?.role})
        </span>
        <button
          onClick={handleLogout}
          style={{
            padding: 8,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          aria-label="退出登录"
        >
          <LogOut style={{ width: 18, height: 18 }} />
        </button>
      </div>
    </header>
  );
}
