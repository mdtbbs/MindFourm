'use client';

import React from 'react';
import { motion, type Easing, type Variants } from 'framer-motion';
import { cn } from '../lib/utils';

const easeInOut: Easing = 'easeInOut';

export type TitleType = 'active' | 'core' | 'mod' | 'admin' | 'contributor' | 'custom';

export interface TitleProps {
  /** 称号类型 */
  type: TitleType;
  /** 显示文字 */
  text?: string;
  /** 图标 (emoji 或字符) */
  icon?: string;
  /** 尺寸 */
  size?: 'normal' | 'sm';
  /** 自定义颜色 */
  customColor?: string;
  /** 自定义图标颜色 */
  customIconColor?: string;
  /** 是否显示边框 */
  bordered?: boolean;
  /** 是否启用入场动画 */
  enableEntrance?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

interface TitleConfig {
  color: string;
  iconBg: string;
  defaultIcon: string;
  defaultText: string;
  animate?: boolean;
  shimmerGradient?: string;
  borderColor?: string;
}

const titleConfig: Record<TitleType, TitleConfig> = {
  active: {
    color: 'var(--title-active)',
    iconBg: 'var(--title-active)',
    defaultIcon: '✓',
    defaultText: '活跃用户',
  },
  core: {
    color: 'var(--title-core)',
    iconBg: 'var(--title-core)',
    defaultIcon: '⭐',
    defaultText: '核心成员',
  },
  mod: {
    color: 'var(--title-mod)',
    iconBg: 'var(--title-mod)',
    defaultIcon: '⭐',
    defaultText: '版主',
    animate: true,
    shimmerGradient: 'linear-gradient(90deg, rgba(255,107,53,0) 0%, rgba(255,107,53,0.3) 50%, rgba(255,107,53,0) 100%)',
    borderColor: 'rgba(255,107,53,0.5)',
  },
  admin: {
    color: '#b8860b',
    iconBg: 'linear-gradient(135deg, #ffd700, #ffb347)',
    defaultIcon: '👑',
    defaultText: '管理员',
    animate: true,
    shimmerGradient: 'linear-gradient(90deg, rgba(255,215,0,0) 0%, rgba(255,215,0,0.4) 50%, rgba(255,215,0,0) 100%)',
    borderColor: 'rgba(255,215,0,0.6)',
  },
  contributor: {
    color: 'var(--title-contributor)',
    iconBg: 'var(--title-contributor)',
    defaultIcon: '🚀',
    defaultText: '贡献者',
  },
  custom: {
    color: 'var(--text-secondary)',
    iconBg: 'var(--bg-elevated)',
    defaultIcon: '',
    defaultText: '',
  },
};

// 入场动画变体
const entranceVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: easeInOut,
    },
  },
};

// shimmer 动画变体
const shimmerVariants: Variants = {
  shimmer: {
    backgroundPosition: ['200% center', '-200% center'],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// 文字闪烁动画变体
const textGlowVariants: Variants = {
  glow: {
    textShadow: [
      '0 0 0px currentColor',
      '0 0 8px currentColor',
      '0 0 0px currentColor',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

// 边框光效动画变体
const borderGlowVariants: Variants = {
  glow: {
    boxShadow: [
      '0 0 0px rgba(255,107,53,0)',
      '0 0 10px rgba(255,107,53,0.3)',
      '0 0 0px rgba(255,107,53,0)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

export function Title({
  type,
  text,
  icon,
  size = 'normal',
  customColor,
  customIconColor,
  bordered = true,
  enableEntrance = true,
  onClick,
}: TitleProps) {
  const config = titleConfig[type];
  const displayText = text || config.defaultText;
  const displayIcon = icon || config.defaultIcon;

  const fontSize = size === 'normal' ? 13 : 11;
  const iconSize = size === 'normal' ? 20 : 16;
  const padding = size === 'normal' ? '4px 8px' : '2px 6px';

  // 获取背景颜色
  const getBgColor = () => {
    switch (type) {
      case 'admin':
        return 'rgba(255,193,7,0.15)';
      case 'mod':
        return 'rgba(255,107,53,0.1)';
      case 'active':
        return 'rgba(76,175,80,0.1)';
      case 'core':
        return 'rgba(33,150,243,0.1)';
      case 'contributor':
        return 'rgba(156,39,176,0.1)';
      default:
        return 'transparent';
    }
  };

  return (
    <motion.div
      className={cn(`title-badge title-${type}`, onClick && 'cursor-pointer')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding,
        fontSize,
        borderRadius: 4,
        position: 'relative',
        overflow: 'hidden',
      }}
      variants={enableEntrance ? entranceVariants : undefined}
      initial={enableEntrance ? 'hidden' : undefined}
      animate={enableEntrance ? 'visible' : undefined}
      whileHover={{ scale: 1.05 }}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      onClick={onClick}
    >
      {/* shimmer 背景 */}
      {config.animate && config.shimmerGradient && (
        <motion.div
          variants={shimmerVariants}
          animate="shimmer"
          style={{
            position: 'absolute',
            inset: 0,
            background: config.shimmerGradient,
            backgroundSize: '200% 100%',
            borderRadius: 4,
            opacity: 0.5,
          }}
        />
      )}

      {/* 主背景 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: getBgColor(),
          borderRadius: 4,
          zIndex: 0,
        }}
      />

      {/* 边框 */}
      {bordered && (
        <motion.div
          variants={config.animate ? borderGlowVariants : undefined}
          animate={config.animate ? 'glow' : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            border: `1px solid ${customColor || config.borderColor || config.color}`,
            borderRadius: 4,
            zIndex: 1,
          }}
        />
      )}

      {/* 内容容器 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* 图标 */}
        {displayIcon && (
          <motion.span
            className="title-icon"
            animate={config.animate ? {
              rotate: [0, 5, -5, 0],
              scale: [1, 1.1, 1],
              transition: {
                duration: 3,
                repeat: Infinity,
                ease: easeInOut,
              },
            } : undefined}
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: 4,
              background: customIconColor || config.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: size === 'normal' ? 10 : 8,
              color: '#fff',
            }}
          >
            {displayIcon}
          </motion.span>
        )}

        {/* 文字 */}
        <motion.span
          variants={config.animate ? textGlowVariants : undefined}
          animate={config.animate ? 'glow' : undefined}
          style={{
            color: customColor || config.color,
            fontWeight: 500,
          }}
        >
          {displayText}
        </motion.span>
      </div>
    </motion.div>
  );
}

/** 用户称号列表 */
export interface TitleListProps {
  titles: Array<{ type: TitleType; text?: string; icon?: string }>;
  size?: 'normal' | 'sm';
  maxShow?: number;
  stagger?: boolean;
}

export function TitleList({ titles, size = 'sm', maxShow = 2, stagger = true }: TitleListProps) {
  const visibleTitles = titles.slice(0, maxShow);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: stagger ? 0.1 : 0,
      },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
    >
      {visibleTitles.map((title, index) => (
        <Title
          key={index}
          type={title.type}
          text={title.text}
          icon={title.icon}
          size={size}
          enableEntrance={stagger}
        />
      ))}
    </motion.div>
  );
}

export default Title;