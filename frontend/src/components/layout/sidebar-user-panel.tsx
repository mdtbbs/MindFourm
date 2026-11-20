'use client';

import { User } from 'lucide-react';

export default function SidebarUserPanel({
  userName,
  userMeta,
  collapsed = false,
}: {
  userName?: string;
  userMeta?: string;
  collapsed?: boolean;
}) {
  const visibleName = userName || '游客';
  const visibleMeta = userMeta || '未登录';

  return (
    <div className={`border-t border-[var(--border)] ${collapsed ? 'p-2.5' : 'p-3'}`}>
      <div
        title={collapsed ? `${visibleName} · ${visibleMeta}` : undefined}
        className={`flex items-center border border-[var(--border)] bg-[var(--bg-elevated)] ${collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'}`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--bg-card)] text-[var(--primary-text)]">
          <User className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--text)]">{visibleName}</div>
            <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">{visibleMeta}</div>
          </div>
        )}
      </div>
    </div>
  );
}
