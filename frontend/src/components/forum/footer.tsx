'use client';

import { useSettings } from '@/lib/settings/context';

export default function Footer() {
  const settings = useSettings();
  const footerText = settings.site_footer || `© ${new Date().getFullYear()} MindForum. All rights reserved.`;

  return (
    <footer className="bg-[var(--bg-card)] border-t border-[var(--border)] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-sm text-[var(--text-muted)]">
          <p>{footerText}</p>
        </div>
      </div>
    </footer>
  );
}