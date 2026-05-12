'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/admin/settings/basic', label: 'Basic Info' },
  { href: '/admin/settings/announce', label: 'Announcements' },
  { href: '/admin/settings/display', label: 'Display' },
  { href: '/admin/settings/seo', label: 'SEO' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Site Settings</h1>
        <p className="text-sm text-surface-500 mt-1">Configure site identity, display and SEO</p>
      </div>
      <div className="flex gap-1 border-b border-surface-200">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              pathname === tab.href
                ? 'border-surface-900 text-surface-900 font-medium'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
