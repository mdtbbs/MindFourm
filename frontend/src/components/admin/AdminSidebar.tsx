'use client';

import { useState } from 'react';
import { AdminSidebar as SharedAdminSidebar, SidebarGroup } from '@/lib/shared';

export interface AdminSidebarWrapperProps {
  serviceName: string;
  subtitle?: string;
  groups: SidebarGroup[];
  activeKey?: string;
  footerContent?: React.ReactNode;
}

/**
 * Local admin sidebar wrapper around the shared AdminSidebar.
 * Adds:
 *  - data-testid for testing (delegated to shared component)
 *  - CSS-class-driven width (no inline styles) for responsive behavior
 *  - mobile drawer toggle with overlay
 */
export function AdminSidebar({
  serviceName,
  subtitle,
  groups,
  activeKey,
  footerContent,
}: AdminSidebarWrapperProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <SharedAdminSidebar
        serviceName={serviceName}
        subtitle={subtitle}
        groups={groups}
        activeKey={activeKey}
        footerContent={footerContent}
        className={mobileOpen ? 'open' : ''}
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile toggle button */}
      <button
        className="admin-sidebar-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect y="3" width="20" height="2" rx="1" />
          <rect y="9" width="20" height="2" rx="1" />
          <rect y="15" width="20" height="2" rx="1" />
        </svg>
      </button>
    </>
  );
}

export default AdminSidebar;
