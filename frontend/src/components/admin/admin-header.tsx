'use client';

import { useAuth } from '@/lib/auth/context';
import { LogOut } from 'lucide-react';
import AdminNotificationBell from '@/components/admin/admin-notification-bell';

export default function AdminHeader() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold text-[var(--text)]">MindForum 管理后台</h1>
      <div className="flex items-center gap-4">
        <AdminNotificationBell />
        <span className="text-sm text-[var(--text-secondary)]">
          {user?.username} ({user?.role})
        </span>
        <button
          onClick={handleLogout}
          className="p-2 text-[var(--text-secondary)] hover:text-red-600 transition-colors"
          aria-label="退出登录"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
