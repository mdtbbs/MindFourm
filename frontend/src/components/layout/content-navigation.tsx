'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { getIconComponent } from '@/lib/resource-icons';
import { buildContentNavigation } from '@/lib/navigation/content-navigation';
import type { Category, ResourceCategory } from '@/types';
import { useI18n } from '@/i18n/provider';

export default function ContentNavigation({
  mode, settings, isAuthenticated, userId, forumCategories = [], resourceCategories = [], onNavigate,
}: {
  mode: 'forum' | 'resources';
  settings: Record<string, string>;
  isAuthenticated: boolean;
  userId?: number;
  forumCategories?: Category[];
  resourceCategories?: ResourceCategory[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sections = buildContentNavigation({ mode, settings, isAuthenticated, userId, forumCategories, resourceCategories, translate: t });
  const linkClass = (active: boolean, indent?: boolean) => `relative flex min-w-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-[var(--motion-fast)] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r before:bg-[var(--primary)] before:transition-opacity before:duration-[var(--motion-fast)] ${indent ? 'ml-3' : ''} ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)] before:opacity-100' : 'text-[var(--text-secondary)] before:opacity-0 hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`;

  return <>
    {sections.map((section) => {
      const isCollapsed = collapsed[section.id] ?? false;
      return <section key={section.id} className={section.id === 'global' ? 'space-y-1' : 'mt-4 border-t border-[var(--border)] pt-3'}>
        {section.label && (section.collapsible ? <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]" onClick={() => setCollapsed((value) => ({ ...value, [section.id]: !isCollapsed }))} aria-expanded={!isCollapsed}>
          <span>{section.label}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-[var(--motion-fast)] ${isCollapsed ? '-rotate-90' : ''}`} />
        </button> : <h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{section.label}</h2>)}
        {!isCollapsed && <div className="space-y-0.5">{section.items.map((item, index) => {
          const active = item.id.startsWith('resource-kind-')
            ? pathname === '/resources' && search.get('resource_kind') === item.href.split('resource_kind=')[1]
            : item.id === 'all-resources'
              ? pathname === '/resources' && !search.get('resource_kind')
              : item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon ? getIconComponent(item.icon) : null;
          const startsGroup = item.groupLabel && section.items[index - 1]?.groupLabel !== item.groupLabel;
          return <div key={item.id}>
            {startsGroup && <h3 className="px-3 pb-1.5 pt-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{item.groupLabel}</h3>}
            <Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={linkClass(active, item.indent)}>
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}<span className="min-w-0 flex-1 truncate">{item.label}</span>
              {typeof item.count === 'number' && <span className="shrink-0 text-xs text-[var(--text-muted)]">{item.count}</span>}
            </Link>
          </div>;
        })}</div>}
      </section>;
    })}
  </>;
}
