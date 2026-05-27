'use client';

import React from 'react';

export type MedalLevel = 1 | 2 | 3 | 4;

export interface MedalProps {
  level: MedalLevel;
  icon?: string;
  name?: string;
  description?: string;
  earnedAt?: string;
  progress?: string;
  size?: 'normal' | 'mini' | 'xs';
  showTooltip?: boolean;
  customColor?: string;
  onClick?: () => void;
}

const sizeMap = {
  normal: { width: 36, height: 36, fontSize: 16 },
  mini: { width: 20, height: 20, fontSize: 10 },
  xs: { width: 14, height: 14, fontSize: 8 },
};

const levelStyles: Record<MedalLevel, { bg: string; color: string; shadow?: string }> = {
  1: { bg: 'var(--badge-lv1)', color: '#666' },
  2: { bg: 'linear-gradient(135deg, var(--badge-lv2-start), var(--badge-lv2-end))', color: '#fff' },
  3: { bg: 'linear-gradient(135deg, var(--badge-lv3-start), var(--badge-lv3-end))', color: '#fff' },
  4: { bg: 'linear-gradient(135deg, var(--badge-lv4-start), var(--badge-lv4-end))', color: '#fff', shadow: '0 2px 8px rgba(255,107,53,0.3)' },
};

export function Medal({
  level,
  icon = '🏆',
  name,
  description,
  earnedAt,
  progress,
  size = 'normal',
  showTooltip = false,
  customColor,
  onClick,
}: MedalProps) {
  const { width, height, fontSize } = sizeMap[size];
  const style = levelStyles[level];

  return (
    <div className="medal-container" style={{ position: 'relative', display: 'inline-block' }} onClick={onClick}>
      <div
        className={`medal medal-lv${level}`}
        style={{
          width,
          height,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          background: customColor || style.bg,
          color: style.color,
          boxShadow: style.shadow,
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        {icon}
      </div>

      {showTooltip && name && (
        <div
          className="medal-tooltip"
          style={{
            position: 'absolute',
            bottom: size === 'normal' ? -80 : -70,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            minWidth: 180,
            boxShadow: 'var(--shadow-card)',
            zIndex: 100,
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: style.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: style.color,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lv.{level}</div>
            </div>
          </div>
          {description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{description}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {earnedAt && <div>获得时间: {earnedAt}</div>}
            {progress && <div>进度: {progress}</div>}
          </div>
        </div>
      )}

      <style>{`.medal-container:hover .medal-tooltip { opacity: 1; pointerEvents: auto; }`}</style>
    </div>
  );
}

export interface MedalGroupProps {
  medals: Array<{ level: MedalLevel; icon?: string }>;
  size?: 'normal' | 'mini' | 'xs';
  maxShow?: number;
}

export function MedalGroup({ medals, size = 'mini', maxShow = 5 }: MedalGroupProps) {
  const visibleMedals = medals.slice(0, maxShow);
  const remaining = medals.length - maxShow;

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {visibleMedals.map((medal, index) => (
        <Medal key={index} level={medal.level} icon={medal.icon} size={size} />
      ))}
      {remaining > 0 && (
        <div
          style={{
            width: size === 'normal' ? 36 : size === 'mini' ? 20 : 14,
            height: size === 'normal' ? 36 : size === 'mini' ? 20 : 14,
            borderRadius: 6,
            background: 'var(--bg-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size === 'normal' ? 12 : size === 'mini' ? 8 : 6,
            color: 'var(--text-muted)',
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

export default Medal;