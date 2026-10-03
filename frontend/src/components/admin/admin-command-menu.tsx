'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search, UserRound, PackageSearch, FileText, ScrollText, ShieldCheck, Settings2 } from 'lucide-react';
import type { AdminNavSection } from '@/lib/admin/navigation';
import { resolveQuickOpenCommand, type QuickOpenCommandAliases, type QuickOpenPage } from '@/lib/admin/command-palette';
import { navigateWithUnsavedChanges } from '@/lib/admin/unsaved-navigation';
import { useI18n } from '@/i18n/provider';

interface AdminCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: AdminNavSection[];
}

interface CommandResult {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export default function AdminCommandMenu({ open, onOpenChange, sections }: AdminCommandMenuProps) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const results = useMemo<CommandResult[]>(() => {
    const normalize = (value: string) => value.trim().toLocaleLowerCase(locale);
    const term = normalize(query);
    const staticResults = sections.flatMap((section) =>
      section.items.map((item) => ({
        key: `${section.key}:${item.key}`,
        label: item.label,
        description: section.label,
        href: item.href ?? '',
        icon: item.icon,
        disabled: item.disabled || !item.href,
        haystack: normalize([section.label, item.label, item.key, item.href ?? '', ...(item.keywords ?? [])].join(' ')),
      })),
    );

    const matched = staticResults
      .filter((item) => !term || item.haystack.includes(term))
      .slice(0, term ? 10 : 8)
      .map((item) => ({
        key: item.key,
        label: item.label,
        description: item.description,
        href: item.href,
        icon: item.icon,
        disabled: item.disabled,
      }));

    if (!term) return matched;

    const aliases: QuickOpenCommandAliases = {
      user: t('adminShell.userCommand'),
      resource: t('adminShell.resourceCommand'),
      post: t('adminShell.postCommand'),
      thread: t('adminShell.threadCommand'),
      setting: t('adminShell.settingCommand'),
      page: t('adminShell.pageCommand'),
      requestId: t('adminShell.requestIdCommand'),
      moderation: t('adminShell.moderationCommand'),
      settingsAlias: t('adminShell.settingsAlias'),
      resourcesAlias: t('adminShell.resourcesAlias'),
      moderationQueueAlias: t('adminShell.moderationQueueAlias'),
    };
    const pages: QuickOpenPage[] = staticResults.map(({ key, label, description, href, haystack, disabled }) => ({
      key,
      label,
      description,
      href,
      haystack,
      disabled,
    }));

    const dynamic = resolveQuickOpenCommand(query, aliases, pages, locale).map((resolution) => {
      if (resolution.type === 'user') return {
        key: 'dynamic:user',
        label: t('adminShell.searchUser', { value: resolution.value }),
        description: t('adminShell.userManagement'),
        href: resolution.href,
        icon: UserRound,
      };
      if (resolution.type === 'resource') return {
        key: 'dynamic:resource',
        label: t('adminShell.searchResource', { value: resolution.value }),
        description: t('adminShell.resourceManagement'),
        href: resolution.href,
        icon: PackageSearch,
      };
      if (resolution.type === 'post') return {
        key: `dynamic:post:${resolution.value}`,
        label: t('adminShell.searchPost', { value: resolution.value }),
        description: t('adminShell.postManagement'),
        href: resolution.href,
        icon: FileText,
      };
      if (resolution.type === 'requestId') return {
        key: `dynamic:request-id:${resolution.value}`,
        label: t('adminShell.searchRequestId', { value: resolution.value }),
        description: t('adminShell.requestIdManagement'),
        href: resolution.href,
        icon: ScrollText,
      };
      if (resolution.type === 'moderation') return {
        key: `dynamic:moderation:${resolution.filter}`,
        label: resolution.filter === 'resources'
          ? t('adminShell.openResourceModeration')
          : t('adminShell.openModeration'),
        description: t('adminShell.moderationQueue'),
        href: resolution.href,
        icon: ShieldCheck,
      };
      if (resolution.type === 'setting') return {
        key: `dynamic:setting:${resolution.page.key}`,
        label: t('adminShell.openSetting', { value: resolution.page.label }),
        description: resolution.page.description,
        href: resolution.href,
        icon: Settings2,
      };
      if (resolution.type === 'page') return {
        key: `dynamic:page:${resolution.page.key}`,
        label: t('adminShell.openAdminPage', { value: resolution.page.label }),
        description: resolution.page.description,
        href: resolution.href,
        icon: Settings2,
      };
      return {
        key: 'dynamic:unknown',
        label: '',
        description: '',
        href: '',
        icon: Settings2,
        disabled: true,
      };
    });

    return [...dynamic, ...matched].slice(0, 12);
  }, [locale, query, sections, t]);

  const go = (result: CommandResult) => {
    if (result.disabled || !result.href) return;
    void navigateWithUnsavedChanges(result.href, (href) => router.push(href)).then((navigated) => {
      if (navigated) onOpenChange(false);
    });
  };

  if (!open) return null;

  return (
    <div className="admin-command-backdrop" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <div
        className="admin-command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('adminShell.commandMenu')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-command-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const first = results.find((item) => !item.disabled);
                if (first) go(first);
              }
            }}
            placeholder={t('adminShell.commandPlaceholder')}
            aria-label={t('adminShell.searchFeature')}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="admin-command-results">
          {results.length === 0 ? (
            <div className="admin-command-empty">{t('adminShell.noCommandResults')}</div>
          ) : (
            results.map((result, index) => {
              const Icon = result.icon;
              return (
                <button
                  key={result.key}
                  type="button"
                  className="admin-command-result"
                  disabled={result.disabled}
                  onClick={() => go(result)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="admin-command-result-copy">
                    <strong>{result.label}</strong>
                    <small>{result.description}{result.disabled ? t('adminShell.notConnected') : ''}</small>
                  </span>
                  {index === 0 && !result.disabled ? <CornerDownLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              );
            })
          )}
        </div>

        <div className="admin-command-help">
          <span>{t('adminShell.shortcutOpen')}</span>
          <span>{t('adminShell.shortcutGo')}</span>
          <span>{t('adminShell.shortcutClose')}</span>
        </div>
      </div>
    </div>
  );
}
