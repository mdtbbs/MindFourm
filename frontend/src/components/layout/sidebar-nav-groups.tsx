'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Bookmark,
  FileText,
  Home,
  LogIn,
  Mail,
  Package,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react';
import type { SidebarQuickAction, SiteNavGroup, SiteNavLink } from '@/lib/navigation/site-navigation';

const ICON_BY_NAME = {
  bell: Bell,
  mail: Mail,
  users: Users,
  bookmark: Bookmark,
  settings: Settings,
  home: Home,
  package: Package,
  file: FileText,
} as const;

function isActivePath(currentPathname: string | null, href: string) {
  if (!currentPathname) {
    return false;
  }

  if (href === '/') {
    return currentPathname === '/';
  }

  return currentPathname === href || currentPathname.startsWith(`${href}/`);
}

function renderIcon(icon?: string, className = 'h-4 w-4') {
  if (!icon) {
    return null;
  }

  const Icon = ICON_BY_NAME[icon as keyof typeof ICON_BY_NAME];
  return Icon ? <Icon className={className} /> : null;
}

function NavLinkItem({ item, currentPathname }: { item: SiteNavLink; currentPathname: string | null }) {
  const active = isActivePath(currentPathname, item.href);
  const external = item.href.startsWith('http://') || item.href.startsWith('https://');

  return (
    <Link
      href={item.href}
      target={item.newTab ? '_blank' : undefined}
      rel={item.newTab ? 'noreferrer noopener' : undefined}
      prefetch={!external && !item.newTab ? undefined : false}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
      }`}
    >
      {renderIcon(item.icon)}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function QuickActionButton({
  action,
  onLogin,
  onRegister,
}: {
  action: SidebarQuickAction;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  const isPrimary = action.variant === 'primary';
  const content = (
    <>
      {action.action === 'login' ? <LogIn className="h-4 w-4" /> : null}
      {action.action === 'register' ? <UserPlus className="h-4 w-4" /> : null}
      <span>{action.label}</span>
    </>
  );

  const className = `flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
    isPrimary
      ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]'
      : 'bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--bg-hover)]'
  }`;

  if (action.href) {
    return <Link href={action.href} className={className}>{content}</Link>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={action.action === 'login' ? onLogin : action.action === 'register' ? onRegister : undefined}
    >
      {content}
    </button>
  );
}

export default function SidebarNavGroups({
  primaryItems,
  groups,
  personalItems,
  quickActions,
  onLogin,
  onRegister,
}: {
  primaryItems: SiteNavLink[];
  groups: SiteNavGroup[];
  personalItems: SiteNavLink[];
  quickActions: SidebarQuickAction[];
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {primaryItems.length > 0 && (
        <section className="space-y-1">
          {primaryItems.map((item) => (
            <NavLinkItem key={`${item.href}-${item.label}`} item={item} currentPathname={pathname} />
          ))}
        </section>
      )}

      {groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLinkItem key={`${group.label}-${item.href}-${item.label}`} item={item} currentPathname={pathname} />
            ))}
          </div>
        </section>
      ))}

      {personalItems.length > 0 && (
        <section className="space-y-2">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            我的
          </div>
          <div className="space-y-1">
            {personalItems.map((item) => (
              <NavLinkItem key={`${item.href}-${item.label}`} item={item} currentPathname={pathname} />
            ))}
          </div>
        </section>
      )}

      {quickActions.length > 0 && (
        <section className="space-y-2 border-t border-[var(--border)] pt-4">
          <div className="grid gap-2">
            {quickActions.map((action) => (
              <QuickActionButton
                key={`${action.label}-${action.href ?? action.action ?? action.variant}`}
                action={action}
                onLogin={onLogin}
                onRegister={onRegister}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
