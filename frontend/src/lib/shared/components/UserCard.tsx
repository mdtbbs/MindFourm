'use client';

import React from 'react';
import { motion, type Easing, type Variants } from 'framer-motion';
import { Medal, MedalLevel } from './Medal';
import { Title, TitleType } from './Title';
import { cn } from '../lib/utils';

const easeInOut: Easing = 'easeInOut';

export interface UserCardProps {
  /** 用户ID */
  userId?: string | number;
  /** 用户名 */
  username: string;
  /** 用户头像 URL */
  avatarUrl?: string;
  /** 称号 */
  title?: {
    type: TitleType;
    text?: string;
  };
  /** 勋章列表 */
  medals?: Array<{ level: MedalLevel; icon?: string }>;
  /** 统计数据 */
  stats?: {
    posts?: number;
    replies?: number;
    likes?: number;
  };
  /** 尺寸: standard(140px), mini(100px) */
  size?: 'standard' | 'mini';
  /** 是否显示统计数据 */
  showStats?: boolean;
  /** 是否启用入场动画 */
  enableEntrance?: boolean;
  /** 是否显示边框光效 */
  showBorderGlow?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

// 入场动画变体
const cardEntranceVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: easeInOut,
    },
  },
};

// 头像动画变体
const avatarVariants: Variants = {
  hidden: {
    scale: 0.8,
    opacity: 0,
  },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      delay: 0.1,
      duration: 0.3,
      ease: easeInOut,
    },
  },
  hover: {
    scale: 1.1,
    transition: {
      duration: 0.2,
      ease: easeInOut,
    },
  },
};

// 头像光环动画变体
const avatarRingVariants: Variants = {
  pulse: {
    scale: [1, 1.15, 1],
    opacity: [0.5, 0.8, 0.5],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

// 内容淡入动画变体
const contentVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 5,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: easeInOut,
    },
  },
};

// 统计数字动画变体
const statVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: 0.5 + i * 0.1,
      duration: 0.3,
      ease: easeInOut,
    },
  }),
};

// 边框光效动画变体
const borderGlowVariants: Variants = {
  idle: {
    boxShadow: '0 0 0px rgba(255,107,53,0)',
  },
  hover: {
    boxShadow: '0 0 15px rgba(255,107,53,0.2), 0 4px 12px rgba(0,0,0,0.1)',
    transition: {
      duration: 0.3,
      ease: easeInOut,
    },
  },
};

export function UserCard({
  username,
  avatarUrl,
  title,
  medals,
  stats,
  size = 'standard',
  showStats = true,
  enableEntrance = true,
  showBorderGlow = true,
  onClick,
}: UserCardProps) {
  const isMini = size === 'mini';
  const width = isMini ? 100 : 140;
  const avatarSize = isMini ? 36 : 48;
  const medalSize = isMini ? 'xs' : 'mini';

  return (
    <motion.div
      className={cn('user-card', isMini && 'user-card-mini')}
      variants={cardEntranceVariants}
      initial={enableEntrance ? 'hidden' : 'visible'}
      animate="visible"
      whileHover={{
        scale: 1.02,
        y: -2,
        transition: { duration: 0.2 },
      }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      style={{
        width,
        position: 'relative',
        borderRadius: 8,
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      {/* 背景层 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--bg-card)',
          borderRadius: 8,
        }}
      />

      {/* 边框层 */}
      <motion.div
        variants={borderGlowVariants}
        initial="idle"
        whileHover="hover"
        style={{
          position: 'absolute',
          inset: 0,
          border: '1px solid var(--border)',
          borderRadius: 8,
          pointerEvents: 'none',
        }}
      />

      {/* 顶部渐变装饰 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ delay: 0.3 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          background: 'linear-gradient(to bottom, rgba(255,107,53,0.3), transparent)',
          borderRadius: '8px 8px 0 0',
        }}
      />

      {/* 内容层 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: isMini ? 8 : 16,
          textAlign: 'center',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        {/* Avatar */}
        <motion.div
          variants={avatarVariants}
          initial={enableEntrance ? 'hidden' : 'visible'}
          animate="visible"
          whileHover="hover"
          style={{
            position: 'relative',
            width: avatarSize,
            height: avatarSize,
            borderRadius: 6,
            margin: '0 auto',
            marginBottom: isMini ? 4 : 8,
            overflow: 'visible',
          }}
        >
          {/* 头像光环 */}
          {showBorderGlow && (
            <motion.div
              variants={avatarRingVariants}
              animate="pulse"
              style={{
                position: 'absolute',
                inset: -3,
                borderRadius: 8,
                border: '1px solid rgba(255,107,53,0.3)',
                background: 'transparent',
              }}
            />
          )}

          {/* 头像内容 */}
          <div
            style={{
              position: 'relative',
              width: avatarSize,
              height: avatarSize,
              borderRadius: 6,
              background: avatarUrl ? 'transparent' : 'var(--bg-elevated)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: avatarSize * 0.4,
              color: 'var(--text-muted)',
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={username}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              username.charAt(0).toUpperCase()
            )}
          </div>
        </motion.div>

        {/* Username */}
        <motion.div
          variants={contentVariants}
          initial={enableEntrance ? 'hidden' : 'visible'}
          animate="visible"
          transition={{ delay: 0.2 }}
          style={{
            fontSize: isMini ? 12 : 13,
            fontWeight: 500,
            color: 'var(--text)',
            marginBottom: 2,
          }}
        >
          {username}
        </motion.div>

        {/* Title */}
        {title && (
          <motion.div
            variants={contentVariants}
            initial={enableEntrance ? 'hidden' : 'visible'}
            animate="visible"
            transition={{ delay: 0.3 }}
            style={{ marginBottom: isMini ? 4 : 6 }}
          >
            <Title
              type={title.type}
              text={title.text}
              size="sm"
              bordered={false}
              enableEntrance={false}
            />
          </motion.div>
        )}

        {/* Medals */}
        {medals && medals.length > 0 && (
          <motion.div
            variants={contentVariants}
            initial={enableEntrance ? 'hidden' : 'visible'}
            animate="visible"
            transition={{ delay: 0.4 }}
            style={{
              display: 'flex',
              gap: 4,
              justifyContent: 'center',
              marginBottom: isMini ? 0 : 12,
            }}
          >
            {medals.slice(0, isMini ? 2 : 5).map((medal, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: 0.5 + index * 0.05,
                  duration: 0.2,
                  ease: 'backOut',
                }}
              >
                <Medal level={medal.level} icon={medal.icon} size={medalSize} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Stats */}
        {showStats && stats && !isMini && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}
          >
            {stats.posts !== undefined && (
              <motion.div custom={0} variants={statVariants} initial="hidden" animate="visible">
                帖子: <strong style={{ color: 'var(--text)' }}>{stats.posts}</strong>
              </motion.div>
            )}
            {stats.replies !== undefined && (
              <motion.div custom={1} variants={statVariants} initial="hidden" animate="visible">
                回复: <strong style={{ color: 'var(--text)' }}>{stats.replies}</strong>
              </motion.div>
            )}
            {stats.likes !== undefined && (
              <motion.div custom={2} variants={statVariants} initial="hidden" animate="visible">
                赞: <strong style={{ color: 'var(--text)' }}>{stats.likes}</strong>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default UserCard;