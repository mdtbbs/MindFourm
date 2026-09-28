'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search, UserRound, PackageSearch } from 'lucide-react';
import type { AdminNavSection } from '@/lib/admin/navigation';
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

function normalize(value: string, locale: string): string {
  return value.trim().toLocaleLowerCase(locale);
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
    const term = normalize(query, locale);
    const staticResults = sections.flatMap((section) =>
      section.items.map((item) => ({
        key: `${section.key}:${item.key}`,
        label: item.label,
        description: section.label,
        href: item.href ?? '',
        icon: item.icon,
        disabled: item.disabled || !item.href,
        haystack: normalize([section.label, item.label, ...(item.keywords ?? [])].join(' '), locale),
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

    const dynamic: CommandResult[] = [];
    const userCommand = t('adminShell.userCommand');
    const userMatch = query.trim().match(new RegExp(`^${userCommand}\\s+(.+)$`, 'i'));
    if (userMatch?.[1]) {
      const value = userMatch[1].trim();
      dynamic.push({
        key: 'dynamic:user',
        label: t('adminShell.searchUser', { value }),
        description: t('adminShell.userManagement'),
        href: `/admin/users?search=${encodeURIComponent(value)}`,
        icon: UserRound,
      });
    }

    const resourceCommand = t('adminShell.resourceCommand');
    const resourceMatch = query.trim().match(new RegExp(`^${resourceCommand}\\s+(.+)$`, 'i'));
    if (resourceMatch?.[1]) {
      const value = resourceMatch[1].trim();
      dynamic.push({
        key: 'dynamic:resource',
        label: t('adminShell.searchResource', { value }),
        description: t('adminShell.resourceManagement'),
        href: `/admin/resources?search=${encodeURIComponent(value)}`,
        icon: PackageSearch,
      });
    }

    return [...dynamic, ...matched].slice(0, 12);
  }, [locale, query, sections, t]);

  const go = (result: CommandResult) => {
    if (result.disabled || !result.href) return;
    router.push(result.href);
    onOpenChange(false);
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
