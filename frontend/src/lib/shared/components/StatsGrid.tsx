import React from 'react';

export interface StatItem {
  value: string | number;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}

export interface StatsGridProps {
  /** 统计项列表 */
  items: StatItem[];
  /** 列数: 2, 3, 4, 5 */
  columns?: 2 | 3 | 4 | 5;
  /** 尺寸: normal, compact */
  size?: 'normal' | 'compact';
}

export function StatsGrid({ items, columns = 4, size = 'normal' }: StatsGridProps) {
  const padding = size === 'normal' ? 20 : 12;
  const valueFontSize = size === 'normal' ? 24 : 18;
  const labelFontSize = size === 'normal' ? 13 : 11;

  return (
    <div
      className={`stats-grid stats-grid-${columns}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 12,
      }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="stats-item"
          style={{
            textAlign: 'center',
            padding,
            background: 'var(--bg-elevated)',
            borderRadius: 6,
          }}
        >
          {item.icon && (
            <div style={{ marginBottom: 4 }}>{item.icon}</div>
          )}
          <div
            className="stats-value"
            style={{
              fontSize: valueFontSize,
              fontWeight: 500,
              color: item.color || 'var(--text)',
            }}
          >
            {item.value}
          </div>
          <div
            className="stats-label"
            style={{
              fontSize: labelFontSize,
              color: 'var(--text-muted)',
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default StatsGrid;