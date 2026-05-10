'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Search, User, LogOut, Shield } from 'lucide-react';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  const handleLogin = () => {
    const redirectUrl = encodeURIComponent(`${window.location.origin}/api/auth/callback`);
    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}`;
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <header className="bg-white border-b border-surface-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold text-primary-600">MindForum</span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-lg mx-8 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text"
                placeholder="搜索帖子..."
                className="w-full pl-10 pr-4 py-2 bg-surface-100 rounded-lg border-0 focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            {isAuthenticated && user ? (
              <>
                <Link
                  href="/posts/new"
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  发帖
                </Link>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="p-2 text-surface-600 hover:text-primary-600 transition-colors"
                    title="管理后台"
                  >
                    <Shield className="w-5 h-5" />
                  </Link>
                )}
                <Link
                  href={`/users/${user.id}`}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-surface-700 hover:text-primary-600 transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 text-surface-600 hover:text-red-600 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
