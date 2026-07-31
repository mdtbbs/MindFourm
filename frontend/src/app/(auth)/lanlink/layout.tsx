'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/lanlink', label: '联机大厅' },
  { href: '/lanlink/quick-code', label: '识别码' },
];

export default function LanLinkLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {TABS.map((tab) => {
          const isActive = tab.href === '/lanlink'
            ? pathname === '/lanlink'
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
