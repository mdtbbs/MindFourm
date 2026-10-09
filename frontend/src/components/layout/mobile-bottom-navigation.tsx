'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, Package, Radio, UserRound } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { isWorkspaceActive, WORKSPACE_SPACES } from '@/lib/navigation/workspace-navigation';

const ICONS = { home: Home, community: MessageCircle, resources: Package, multiplayer: Radio, me: UserRound } as const;

export default function MobileBottomNavigation({ userId }: { userId?: number }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const spaces = WORKSPACE_SPACES.filter((space) => space.id !== 'tools');

  return <nav aria-label={t('navigation.siteNavigation')} data-testid="mobile-bottom-navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg-card)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
    <div className="mx-auto flex max-w-xl items-stretch px-1">
      {spaces.map((space) => {
        const Icon = ICONS[space.id as keyof typeof ICONS];
        const active = isWorkspaceActive(pathname, space.href, userId);
        // 11px, not 10px: 10px CJK labels were hard to read on the smallest
        // phones, and the item is already 56px tall so the extra line box is free.
        return <Link key={space.id} href={space.href} aria-current={active ? 'page' : undefined} className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] ${active ? 'text-[var(--primary-text)]' : 'text-[var(--text-muted)]'}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="truncate">{t(space.labelKey)}</span>
        </Link>;
      })}
    </div>
  </nav>;
}
