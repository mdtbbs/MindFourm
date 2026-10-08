'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Server, Plus, Globe, Lock } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface NavItem {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  requiresAuth: boolean;
}

const navItems: NavItem[] = [
  { key: 'my', labelKey: 'servers.myServers', icon: <Server className="w-4 h-4" />, requiresAuth: true },
  { key: 'apply', labelKey: 'servers.apply', icon: <Plus className="w-4 h-4" />, requiresAuth: true },
  { key: 'public', labelKey: 'servers.directory', icon: <Globe className="w-4 h-4" />, requiresAuth: false },
];

export default function ServerSidebar() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const currentSection = searchParams?.get('section') || (isAuthenticated ? 'my' : 'public');

  // Remember the section so login returns the visitor here.
  const currentPath = `/servers?section=${currentSection}`;

  return (
    <aside className="w-64 shrink-0">
      <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] p-4 sticky top-20">
        <h3 className="font-semibold text-[var(--text)] mb-3">{t('servers.title')}</h3>
        <nav className="space-y-1">
          {navItems.map(item => {
            const isActive = currentSection === item.key;
            const isLocked = item.requiresAuth && !isAuthenticated;

            if (isLocked) {
              return (
                <Link
                  key={item.key}
                  href={`/login?redirect=${encodeURIComponent(`/servers?section=${item.key}`)}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  {item.icon}
                  <span className="flex-1">{t(item.labelKey)}</span>
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
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
