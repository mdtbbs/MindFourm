import React from 'react';

export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  width?: string | number;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T = Record<string, unknown>> {
  /** 列定义 */
  columns: TableColumn<T>[];
  /** 数据行 */
  data: T[];
  /** 行唯一标识字段 */
  rowKey?: string;
  /** 是否显示边框 */
  bordered?: boolean;
  /** 是否显示行悬停效果 */
  hoverable?: boolean;
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 空数据提示 */
  emptyText?: string;
  /** 行点击回调 */
  onRowClick?: (row: T, index: number) => void;
  /** 自定义行样式 */
  rowStyle?: (row: T, index: number) => React.CSSProperties;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  bordered = true,
  hoverable = true,
  compact = false,
  emptyText = '暂无数据',
  onRowClick,
  rowStyle,
}: DataTableProps<T>) {
  const padding = compact ? 8 : 12;
  const fontSize = compact ? 12 : 13;

  const gridTemplateColumns = columns
    .map(col => col.width || '1fr')
    .join(' ');

  return (
    <div
      className="data-table"
      style={{
        width: '100%',
        background: 'var(--bg-card)',
        border: bordered ? '1px solid var(--border)' : 'none',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="data-table-header"
        style={{
          display: 'grid',
          gridTemplateColumns,
          padding,
          background: 'var(--bg-elevated)',
          fontSize: 12,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {columns.map((col) => (
          <span key={col.key}>{col.header}</span>
        ))}
      </div>

      {/* Body */}
      {data.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize,
          }}
        >
          {emptyText}
        </div>
      ) : (
        data.map((row, index) => {
          const key = rowKey ? String(row[rowKey]) : index;
          return (
            <div
              key={key}
              className="data-table-row"
              style={{
                display: 'grid',
                gridTemplateColumns,
                padding,
                fontSize,
                color: 'var(--text)',
                borderBottom: index < data.length - 1 ? '1px solid var(--border-light)' : 'none',
                alignItems: 'center',
                background: hoverable ? 'transparent' : 'var(--bg-card)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.15s ease',
                ...rowStyle?.(row, index),
              }}
              onClick={() => onRowClick?.(row, index)}
            >
              {columns.map((col) => {
                const value = row[col.key];
                return (
                  <span key={col.key}>
                    {col.render ? col.render(value, row, index) : (value as React.ReactNode)}
                  </span>
                );
              })}
            </div>
          );
        })
      )}

      {/* Hover effect */}
      <style>{`
        .data-table-row:hover {
          background: var(--bg-hover);
        }
      `}</style>
    </div>
  );
}

export default DataTable;