'use client';

import Link from 'next/link';
import { useSettings } from '@/lib/settings/context';

export default function AuthFlowShell({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const siteName = settings.site_name || 'MindFourm';

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 to-surface-100 px-4 py-10 dark:from-surface-900 dark:to-surface-800">
      <div className="mx-auto mb-8 max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-3 text-[var(--text)] transition-colors hover:text-[var(--primary)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white">
            {siteName.slice(0, 1) || 'M'}
          </div>
          <div>
            <div className="text-base font-semibold">{siteName}</div>
            <div className="text-xs text-[var(--text-muted)]">认证与条款流程</div>
          </div>
        </Link>
      </div>
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}
