import React from 'react';
import { useI18n } from '@/i18n/provider';

export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  width?: string | number;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T = Record<string, unknown>> {
  /** Column definitions. */
  columns: TableColumn<T>[];
  /** Rows to render. */
  data: T[];
  /** Row identity field. */
  rowKey?: string;
  /** Draw the outer border. */
  bordered?: boolean;
  /** Highlight rows on hover. */
  hoverable?: boolean;
  /** Compact density. */
  compact?: boolean;
  /** Copy for the empty state. Falls back to the locale catalog. */
  emptyText?: string;
  /** Row click handler. */
  onRowClick?: (row: T, index: number) => void;
  /** Per-row style resolver. */
  rowStyle?: (row: T, index: number) => React.CSSProperties;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  bordered = true,
  hoverable = true,
  compact = false,
  emptyText,
  onRowClick,
  rowStyle,
}: DataTableProps<T>) {
  const { t } = useI18n();
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
          {emptyText ?? t('common.emptyTable')}
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