'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Server, Plus, Globe, Lock } from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  requiresAuth: boolean;
}

const navItems: NavItem[] = [
  { key: 'my', label: '我的服务器', icon: <Server className="w-4 h-4" />, requiresAuth: true },
  { key: 'apply', label: '申请服务器', icon: <Plus className="w-4 h-4" />, requiresAuth: true },
  { key: 'public', label: '公开服务器', icon: <Globe className="w-4 h-4" />, requiresAuth: false },
];

export default function ServerSidebar() {
  const { isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const currentSection = searchParams?.get('section') || (isAuthenticated ? 'my' : 'public');

  return (
    <aside className="w-64 shrink-0">
      <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] p-4 sticky top-20">
        <h3 className="font-semibold text-[var(--text)] mb-3">服务器管理</h3>
        <nav className="space-y-1">
          {navItems.map(item => {
            const isActive = currentSection === item.key;
            const isLocked = item.requiresAuth && !isAuthenticated;

            if (isLocked) {
              return (
                <Link
                  key={item.key}
                  href="/login"
                  className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  <Lock className="w-3.5 h-3.5" />
                </Link>
              );
            }

            return (
              <Link
                key={item.key}
                href={`/servers?section=${item.key}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm transition-colors ${
                  isActive
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
