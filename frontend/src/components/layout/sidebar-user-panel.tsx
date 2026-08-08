'use client';

import { User } from 'lucide-react';

export default function SidebarUserPanel({
  userName,
  userMeta,
}: {
  userName?: string;
  userMeta?: string;
}) {
  const visibleName = userName || '游客';
  const visibleMeta = userMeta || '未登录';

  return (
    <div className="border-t border-[var(--border)] p-4">
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--bg-card)] px-3 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[var(--text)]">{visibleName}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">{visibleMeta}</div>
        </div>
      </div>
    </div>
  );
}
