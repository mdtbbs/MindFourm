'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search, UserRound, PackageSearch } from 'lucide-react';
import type { AdminNavSection } from '@/lib/admin/navigation';

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

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}

export default function AdminCommandMenu({ open, onOpenChange, sections }: AdminCommandMenuProps) {
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
    const term = normalize(query);
    const staticResults = sections.flatMap((section) =>
      section.items.map((item) => ({
        key: `${section.key}:${item.key}`,
        label: item.label,
        description: section.label,
        href: item.href ?? '',
        icon: item.icon,
        disabled: item.disabled || !item.href,
        haystack: normalize([section.label, item.label, ...(item.keywords ?? [])].join(' ')),
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
    const userMatch = query.trim().match(/^用户\s+(.+)$/i);
    if (userMatch?.[1]) {
      const value = userMatch[1].trim();
      dynamic.push({
        key: 'dynamic:user',
        label: `搜索用户：${value}`,
        description: '用户管理',
        href: `/admin/users?search=${encodeURIComponent(value)}`,
        icon: UserRound,
      });
    }

    const resourceMatch = query.trim().match(/^资源\s+(.+)$/i);
    if (resourceMatch?.[1]) {
      const value = resourceMatch[1].trim();
      dynamic.push({
        key: 'dynamic:resource',
        label: `搜索资源：${value}`,
        description: '资源管理',
        href: `/admin/resources?search=${encodeURIComponent(value)}`,
        icon: PackageSearch,
      });
    }

    return [...dynamic, ...matched].slice(0, 12);
  }, [query, sections]);

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
        aria-label="后台命令菜单"
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
            placeholder="搜索页面，或输入“用户 xxx”“资源 xxx”"
            aria-label="搜索后台功能"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="admin-command-results">
          {results.length === 0 ? (
            <div className="admin-command-empty">没有找到匹配的后台功能。</div>
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
                    <small>{result.description}{result.disabled ? ' · 尚未接入' : ''}</small>
                  </span>
                  {index === 0 && !result.disabled ? <CornerDownLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              );
            })
          )}
        </div>

        <div className="admin-command-help">
          <span>Ctrl/⌘ K 打开</span>
          <span>Enter 前往</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
