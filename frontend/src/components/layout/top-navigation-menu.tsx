'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { TopNavigationItem } from '@/lib/navigation/top-navigation';

interface TopNavigationMenuProps {
  items: TopNavigationItem[];
}

function NavLink({ href, label, newTab }: { href: string; label: string; newTab?: boolean }) {
  const external = href.startsWith('http://') || href.startsWith('https://');

  return (
    <Link
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer noopener' : undefined}
      className="inline-flex items-center px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
      prefetch={!external && !newTab ? undefined : false}
    >
      {label}
    </Link>
  );
}

export default function TopNavigationMenu({ items }: TopNavigationMenuProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="顶部导航" className="hidden lg:flex items-center gap-1">
      {items.map((item, index) => {
        if (item.type === 'group') {
          return (
            <div key={`${item.label}-${index}`} className="group relative">
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
              >
                <span>{item.label}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              <div className="invisible absolute left-0 top-full z-30 mt-2 min-w-44 border border-[var(--border)] bg-[var(--bg-card)] opacity-0 shadow-[var(--shadow-card)] transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="py-1">
                  {item.items.map((child) => (
                    <NavLink
                      key={`${item.label}-${child.href}`}
                      href={child.href}
                      label={child.label}
                      newTab={child.newTab}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <NavLink
            key={`${item.href}-${index}`}
            href={item.href}
            label={item.label}
            newTab={item.newTab}
          />
        );
      })}
    </nav>
  );
}
