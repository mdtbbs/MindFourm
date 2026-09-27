'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Command, ExternalLink, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import {
  resolveAdminLocation,
  type AdminNavSection,
} from '@/lib/admin/navigation';
import AdminNotificationBell from '@/components/admin/admin-notification-bell';
import AdminCommandMenu from '@/components/admin/admin-command-menu';
import { LocaleSwitcher, useI18n } from '@/i18n/provider';

interface AdminShellProps {
  siteName: string;
  sections: AdminNavSection[];
  children: React.ReactNode;
}

export default function AdminShell({ siteName, sections, children }: AdminShellProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const localizedSections = useMemo(() => sections.map((section) => ({
    ...section,
    label: t(`adminNavigation.section.${section.key}`),
    items: section.items.map((item) => ({
      ...item,
      label: t(`adminNavigation.item.${item.key}`),
    })),
  })), [sections, t]);
  const location = useMemo(
    () => resolveAdminLocation(pathname ?? '/admin', localizedSections),
    [pathname, localizedSections],
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
        return;
      }

      if (!typing && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const currentSection = location?.section ?? sections[0];
  const currentItem = location?.item;

  return (
    <div className="admin-v2">
      <div className={`admin-v2-sidebar-stack ${mobileOpen ? 'is-open' : ''}`}>
        <aside className="admin-v2-rail" aria-label={t('adminShell.primaryNavigation')}>
          <Link href="/admin" className="admin-v2-brand" title={siteName}>
            {siteName.trim().charAt(0).toUpperCase() || 'M'}
          </Link>

          <nav className="admin-v2-primary-nav">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = currentSection?.key === section.key;
              return (
                <Link
                  key={section.key}
                  href={section.href}
                  className={`admin-v2-primary-item ${active ? 'is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={section.label}
                >
                  <Icon className="h-5 w-5" />
                  <span>{section.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <aside className="admin-v2-secondary" aria-label={t('adminShell.secondaryNavigation')}>
          <div className="admin-v2-secondary-head">
            <div>
              <strong>{currentSection?.label ?? t('adminShell.defaultTitle')}</strong>
              <small>{siteName}</small>
            </div>
            <button
              type="button"
              className="admin-v2-mobile-close"
              aria-label={t('adminShell.closeNavigation')}
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="admin-v2-secondary-nav">
            {(currentSection?.items ?? []).map((item) => {
              const Icon = item.icon;
              const active = currentItem?.key === item.key;
              if (item.disabled || !item.href) {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="admin-v2-secondary-item is-disabled"
                    disabled
                    title={t('adminShell.disabledDescription')}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    <small>{t('adminShell.waiting')}</small>
                  </button>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`admin-v2-secondary-item ${active ? 'is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="admin-v2-secondary-footer">
            <Link href="/" target="_blank">
              <ExternalLink className="h-4 w-4" />
              <span>{t('adminShell.forum')}</span>
            </Link>
          </div>
        </aside>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          className="admin-v2-mobile-backdrop"
          aria-label={t('adminShell.closeNavigation')}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="admin-v2-workspace">
        <header className="admin-v2-topbar">
          <div className="admin-v2-topbar-left">
            <button
              type="button"
              className="admin-v2-mobile-menu"
              aria-label={t('adminShell.openNavigation')}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="admin-v2-breadcrumb">
              <span>{currentSection?.label ?? t('adminShell.defaultTitle')}</span>
              {currentItem && currentItem.label !== currentSection?.label ? (
                <>
                  <b>/</b>
                  <strong>{currentItem.label}</strong>
                </>
              ) : null}
            </div>
          </div>

          <div className="admin-v2-topbar-actions">
            <LocaleSwitcher admin />
            <button
              type="button"
              className="admin-v2-command-trigger"
              onClick={() => setCommandOpen(true)}
            >
              <Command className="h-4 w-4" />
              <span>{t('adminShell.searchCommands')}</span>
              <kbd>Ctrl K</kbd>
            </button>
            <AdminNotificationBell />
            <div className="admin-v2-account">
              <span>{user?.username || t('adminShell.administrator')}</span>
              <small>{user?.role ? t(`adminNavigation.role.${user.role}`) : t('adminNavigation.role.admin')}</small>
            </div>
            <button type="button" className="admin-v2-icon-button" aria-label={t('adminShell.logout')} onClick={logout}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="admin-v2-main">{children}</main>
      </div>

      <AdminCommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        sections={localizedSections}
      />
    </div>
  );
}
