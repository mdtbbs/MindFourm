'use client';

import React from 'react';
import { motion, type Easing } from 'framer-motion';
import { cn } from '../lib/utils';

export type MedalLevel = 1 | 2 | 3 | 4;

export interface MedalProps {
  /** 勋章等级 1-4 */
  level: MedalLevel;
  /** 勋章图标 (emoji 或字符) */
  icon?: string;
  /** 勋章名称 */
  name?: string;
  /** 勋章描述 */
  description?: string;
  /** 获得时间 */
  earnedAt?: string;
  /** 进度信息 (如 "128/500") */
  progress?: string;
  /** 尺寸: normal(36px), mini(20px), xs(14px) */
  size?: 'normal' | 'mini' | 'xs';
  /** 是否显示详情弹窗 */
  showTooltip?: boolean;
  /** 自定义背景色 */
  customColor?: string;
  /** 点击回调 */
  onClick?: () => void;
}

const sizeMap = {
  normal: { width: 36, height: 36, fontSize: 16 },
  mini: { width: 20, height: 20, fontSize: 10 },
  xs: { width: 14, height: 14, fontSize: 8 },
};

const levelStyles: Record<MedalLevel, { bg: string; color: string; glow?: string }> = {
  1: {
    bg: 'var(--badge-lv1)',
    color: '#666',
  },
  2: {
    bg: 'linear-gradient(135deg, var(--badge-lv2-start), var(--badge-lv2-end))',
    color: '#fff',
  },
  3: {
    bg: 'linear-gradient(135deg, var(--badge-lv3-start), var(--badge-lv3-end))',
    color: '#fff',
    glow: '0 0 10px rgba(255,193,7,0.5)',
  },
  4: {
    bg: 'linear-gradient(135deg, var(--badge-lv4-start), var(--badge-lv4-end))',
    color: '#fff',
    glow: '0 0 15px rgba(255,107,53,0.6)',
  },
};

const easeInOut: Easing = 'easeInOut';

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

  // 动画变体
  const pulseAnimation = {
    scale: [1, 1.05, 1],
    boxShadow: level >= 3
      ? ['0 0 10px rgba(255,107,53,0.4)', '0 0 20px rgba(255,107,53,0.6)', '0 0 10px rgba(255,107,53,0.4)']
      : undefined,
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: easeInOut,
    },
  };

  return (
    <div
      className="medal-container"
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={onClick}
    >
      <motion.div
        className={cn(`medal medal-lv${level}`, onClick && 'cursor-pointer')}
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
          boxShadow: style.glow,
        }}
        animate={level >= 3 ? pulseAnimation : undefined}
        whileHover={{ scale: 1.1 }}
        whileTap={onClick ? { scale: 0.95 } : undefined}
      >
        {icon}
      </motion.div>

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
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                {name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Lv.{level}
              </div>
            </div>
          </div>
          {description && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {description}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {earnedAt && <div>获得时间: {earnedAt}</div>}
            {progress && <div>进度: {progress}</div>}
          </div>
        </div>
      )}

      <style>{`
        .medal-container:hover .medal-tooltip {
          opacity: 1;
          pointerEvents: auto;
        }
      `}</style>
    </div>
  );
}

/** 勋章组 - 多个勋章横向排列 */
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