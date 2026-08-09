'use client';

import React from 'react';
import Link from 'next/link';

export interface SidebarItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** 允许访问的角色列表，不传则所有角色可见 */
  roles?: string[];
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

export interface AdminSidebarProps {
  /** 服务名称 */
  serviceName: string;
  /** 副标题 */
  subtitle?: string;
  /** 菜单项列表（平铺模式，与 groups 二选一） */
  items?: SidebarItem[];
  /** 分组菜单（分组模式，与 items 二选一，优先使用 groups） */
  groups?: SidebarGroup[];
  /** 当前选中的 key */
  activeKey?: string;
  /** 是否折叠模式 */
  collapsed?: boolean;
  /** Logo 图片 URL */
  logoUrl?: string;
  /** 底部额外内容 */
  footerContent?: React.ReactNode;
  /** 菜单项点击回调 */
  onItemClick?: (key: string) => void;
  /** 额外的 CSS 类名 */
  className?: string;
}

export function AdminSidebar({
  serviceName,
  subtitle,
  items,
  groups,
  activeKey,
  collapsed = false,
  logoUrl,
  footerContent,
  onItemClick,
  className,
}: AdminSidebarProps) {
  const handleItemClick = (item: SidebarItem) => {
    if (item.onClick) {
      item.onClick();
    } else if (onItemClick) {
      onItemClick(item.key);
    }
  };

  const renderItem = (item: SidebarItem) => {
    const isActive = item.key === activeKey;

    const content = (
      <>
        {item.icon}
        {!collapsed && <span className="nav-label">{item.label}</span>}
      </>
    );

    const itemClassName = [
      'admin-sidebar-item',
      isActive ? 'active' : '',
      collapsed ? 'admin-sidebar-item-collapsed' : '',
    ].filter(Boolean).join(' ');

    if (item.href) {
      return (
        <Link
          key={item.key}
          href={item.href}
          className={itemClassName}
        >
          {content}
        </Link>
      );
    }

    return (
      <div
        key={item.key}
        onClick={() => handleItemClick(item)}
        className={itemClassName}
      >
        {content}
      </div>
    );
  };

  const asideClassName = [
    'admin-sidebar',
    collapsed ? 'admin-sidebar-collapsed' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <aside
      className={asideClassName}
      data-testid="admin-sidebar"
    >
      {/* Logo / Service Name */}
      <div
        className={collapsed ? 'admin-sidebar-logo-wrapper admin-sidebar-logo-collapsed' : 'admin-sidebar-logo-wrapper'}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={serviceName}
            className={collapsed ? 'admin-sidebar-logo-img admin-sidebar-logo-img-sm' : 'admin-sidebar-logo-img'}
          />
        ) : (
          <div
            className={collapsed ? 'admin-sidebar-logo-text admin-sidebar-logo-text-sm' : 'admin-sidebar-logo-text'}
          >
            {collapsed ? serviceName.charAt(0) : serviceName}
          </div>
        )}
        {!collapsed && subtitle && (
          <div className="admin-sidebar-subtitle">
            {subtitle}
          </div>
        )}
      </div>

      {/* Menu Items */}
      <nav>
        {(groups ?? []).length > 0
          ? (groups ?? []).map((group) => (
              <div key={group.label} className="admin-sidebar-group">
                {!collapsed && (
                  <div className="admin-sidebar-group-label">{group.label}</div>
                )}
                {group.items.map((item) => renderItem(item))}
              </div>
            ))
          : (items ?? []).map((item) => renderItem(item))}
      </nav>

      {/* Footer */}
      {footerContent && (
        <div className="admin-sidebar-footer">
          {footerContent}
        </div>
      )}
    </aside>
  );
}

export default AdminSidebar;