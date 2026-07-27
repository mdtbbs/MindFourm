import React from 'react';

export interface ActivityData {
  hour: number; // 0-23
  value: number;
  highlight?: boolean;
}

export interface ActivityChartProps {
  /** 24小时数据 */
  data: ActivityData[];
  /** 峰值 */
  peak?: number;
  /** 峰值时间 */
  peakTime?: string;
  /** 平均值 */
  average?: number;
  /** 当前值 */
  current?: number;
  /** 最大高度 (px) */
  maxHeight?: number;
  /** 是否显示时间标签 */
  showTimeLabels?: boolean;
}

export function ActivityChart({
  data,
  peak,
  peakTime,
  average,
  current,
  maxHeight = 100,
  showTimeLabels = true,
}: ActivityChartProps) {
  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = 16;

  const hoursToShow = showTimeLabels ? [0, 6, 12, 18, 23] : [];

  return (
    <div style={{ width: '100%' }}>
      {/* Chart */}
      <div
        className="activity-chart"
        style={{
          display: 'flex',
          gap: 4,
          alignItems: 'flex-end',
          height: maxHeight,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 8,
        }}
      >
        {data.map((item, index) => {
          const heightPercent = maxValue > 0 ? (item.value / maxValue) * maxHeight : 0;
          return (
            <div
              key={index}
              className={`activity-bar ${item.highlight ? 'highlight' : ''}`}
              style={{
                width: barWidth,
                height: Math.max(4, heightPercent),
                borderRadius: '4px 4px 0 0',
                background: item.highlight ? 'var(--primary)' : 'var(--bg-elevated)',
                transition: 'height 0.3s ease',
              }}
            />
          );
        })}
      </div>

      {/* Time Labels */}
      {showTimeLabels && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 8,
          }}
        >
          {hoursToShow.map((hour) => (
            <span key={hour}>
              {hour === 23 ? '现在' : `${hour}:00`}
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {(peak || average || current) && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            fontSize: 13,
            color: 'var(--text-muted)',
            marginTop: 16,
          }}
        >
          {peak && (
            <div>
              峰值: <strong style={{ color: 'var(--text)' }}>{peak} 玩家</strong>
              {peakTime && <span> ({peakTime})</span>}
            </div>
          )}
          {average && (
            <div>
              平均: <strong style={{ color: 'var(--text)' }}>{average} 玩家</strong>
            </div>
          )}
          {current && (
            <div>
              当前: <strong style={{ color: 'var(--text)' }}>{current} 玩家</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 生成默认的24小时数据 (用于演示) */
export function generateDefaultActivityData(currentValue: number = 24): ActivityData[] {
  const basePattern = [
    15, 25, 20, 12, 18, 35, 30, 22, 40, 55, 45, 50,
    60, 70, 65, 80, 85, 90, 75, 50, 30, 20, 15, currentValue
  ];

  return basePattern.map((value, hour) => ({
    hour,
    value,
    highlight: hour >= 10 && hour <= 18, // 高峰时段
  }));
}

export default ActivityChart;