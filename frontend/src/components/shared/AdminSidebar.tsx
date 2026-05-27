'use client';

import React from 'react';
import Link from 'next/link';

export interface SidebarItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export interface AdminSidebarProps {
  serviceName: string;
  subtitle?: string;
  items: SidebarItem[];
  activeKey?: string;
  collapsed?: boolean;
  logoUrl?: string;
  footerContent?: React.ReactNode;
  onItemClick?: (key: string) => void;
}

export function AdminSidebar({
  serviceName,
  subtitle,
  items,
  activeKey,
  collapsed = false,
  logoUrl,
  footerContent,
  onItemClick,
}: AdminSidebarProps) {
  const width = collapsed ? 60 : 200;

  const handleItemClick = (item: SidebarItem) => {
    if (item.onClick) {
      item.onClick();
    } else if (onItemClick) {
      onItemClick(item.key);
    }
  };

  return (
    <aside
      className="admin-sidebar"
      style={{
        width,
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        padding: collapsed ? 8 : 16,
        overflowY: 'auto',
        transition: 'width 0.2s ease',
      }}
    >
      <div style={{ textAlign: collapsed ? 'center' : 'left', marginBottom: collapsed ? 24 : 16 }}>
        {logoUrl ? (
          <img src={logoUrl} alt={serviceName} style={{ width: collapsed ? 32 : 40, height: collapsed ? 32 : 40, borderRadius: 8, marginBottom: collapsed ? 0 : 8 }} />
        ) : (
          <div style={{ fontSize: collapsed ? 16 : 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {collapsed ? serviceName.charAt(0) : serviceName}
          </div>
        )}
        {!collapsed && subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>}
      </div>

      <nav>
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const baseStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 8,
            padding: collapsed ? 8 : '8px 12px',
            fontSize: collapsed ? 18 : 13,
            borderRadius: 6,
            marginBottom: 4,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: isActive ? 'var(--bg-elevated)' : 'transparent',
            color: isActive ? 'var(--text)' : 'var(--text-secondary)',
            textDecoration: 'none',
          };

          const content = (
            <>
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </>
          );

          if (item.href) {
            return (
              <Link key={item.key} href={item.href} style={baseStyle} className={isActive ? 'admin-sidebar-item active' : 'admin-sidebar-item'}>
                {content}
              </Link>
            );
          }

          return (
            <div key={item.key} onClick={() => handleItemClick(item)} style={baseStyle} className={isActive ? 'admin-sidebar-item active' : 'admin-sidebar-item'}>
              {content}
            </div>
          );
        })}
      </nav>

      {footerContent && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          {footerContent}
        </div>
      )}
    </aside>
  );
}

export default AdminSidebar;