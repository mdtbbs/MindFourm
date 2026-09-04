import React from 'react';

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  /** 标签项列表 */
  items: TabItem[];
  /** 当前选中的 key */
  activeKey?: string;
  /** 标签切换回调 */
  onChange?: (key: string) => void;
  /** 标签样式: underline, pill */
  variant?: 'underline' | 'pill';
  /** 尺寸 */
  size?: 'normal' | 'sm';
}

export function Tabs({
  items,
  activeKey,
  onChange,
  variant = 'underline',
  size = 'normal',
}: TabsProps) {
  const fontSize = size === 'normal' ? 14 : 12;
  const padding = size === 'normal' ? '8px 16px' : '6px 12px';

  const handleClick = (item: TabItem) => {
    if (!item.disabled && onChange) {
      onChange(item.key);
    }
  };

  const containerStyle: React.CSSProperties = variant === 'underline'
    ? {
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid var(--border)',
        paddingBottom: 8,
      }
    : {
        display: 'flex',
        gap: 8,
        background: 'var(--bg-elevated)',
        padding: 4,
        borderRadius: 8,
      };

  return (
    <div className="tabs" style={containerStyle}>
      {items.map((item) => {
        const isActive = item.key === activeKey;

        const tabStyle: React.CSSProperties = variant === 'underline'
          ? {
              padding,
              fontSize,
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-elevated)' : 'transparent',
              borderRadius: '6px 6px 0 0',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.5 : 1,
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }
          : {
              padding,
              fontSize,
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-card)' : 'transparent',
              borderRadius: 6,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.5 : 1,
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
            };

        return (
          <div
            key={item.key}
            className={`tab ${isActive ? 'active' : ''}`}
            style={tabStyle}
            onClick={() => handleClick(item)}
          >
            {item.icon}
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default Tabs;