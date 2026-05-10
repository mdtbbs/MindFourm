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
    <header className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold text-surface-900">MindForum 管理后台</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-surface-600">
          {user?.username} ({user?.role})
        </span>
        <button
          onClick={handleLogout}
          className="p-2 text-surface-600 hover:text-red-600 transition-colors"
          aria-label="退出登录"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
