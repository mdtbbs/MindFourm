'use client';

import React from 'react';
import { motion, type Easing, type Variants } from 'framer-motion';
import { cn } from '../lib/utils';

const easeInOut: Easing = 'easeInOut';

export interface ServerStatus {
  type: 'online' | 'offline' | 'pending';
  text?: string;
}

export interface ServerCardProps {
  /** 服务器ID */
  serverId?: string | number;
  /** 服务器名称 */
  name: string;
  /** 服务器图标 URL 或 emoji */
  icon?: string;
  /** 服务器描述 */
  description?: string;
  /** 标签列表 */
  tags?: string[];
  /** 服务器状态 */
  status: ServerStatus;
  /** 统计数据 */
  stats?: {
    players?: number;
    maxPlayers?: number;
    ping?: number;
    mode?: string;
    region?: string;
    uptime?: number;
  };
  /** Owner 信息 */
  owner?: {
    username: string;
    avatarUrl?: string;
  };
  /** 当前地图 */
  currentMap?: string;
  /** 是否收藏 */
  isFavorite?: boolean;
  /** 是否推荐 */
  featured?: boolean;
  /** 是否可编辑 (管理员视角) */
  editable?: boolean;
  /** 是否启用入场动画 */
  enableEntrance?: boolean;
  /** 是否显示 shimmer 效果 */
  showShimmer?: boolean;
  /** 加入按钮点击回调 */
  onJoin?: () => void;
  /** 收藏按钮点击回调 */
  onFavorite?: () => void;
  /** 编辑按钮点击回调 */
  onEdit?: () => void;
}

const statusColors = {
  online: { bg: '#4caf50', text: '在线', glow: 'rgba(76,175,80,0.3)' },
  offline: { bg: '#888', text: '离线', glow: 'rgba(136,136,136,0.3)' },
  pending: { bg: '#ffc107', text: '等待中', glow: 'rgba(255,193,7,0.3)' },
};

const pingColors = (ping: number) => {
  if (ping < 50) return '#4caf50';
  if (ping < 100) return '#ffc107';
  return '#f44336';
};

// 卡片入场动画变体
const cardEntranceVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.98,
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

// 推荐服务器 shimmer 动画变体
const shimmerVariants: Variants = {
  shimmer: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// 在线状态脉冲动画变体
const statusPulseVariants: Variants = {
  online: {
    scale: [1, 1.05, 1],
    boxShadow: [
      '0 0 0px rgba(76,175,80,0)',
      '0 0 8px rgba(76,175,80,0.4)',
      '0 0 0px rgba(76,175,80,0)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

// 统计数字淡入动画变体
const statFadeVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 5,
  },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.4 + i * 0.05,
      duration: 0.3,
      ease: easeInOut,
    },
  }),
};

// 玩家数量动画变体
const playerCountVariants: Variants = {
  pulse: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

// 图标动画变体
const iconVariants: Variants = {
  featured: {
    scale: [1, 1.08, 1],
    rotate: [0, 2, -2, 0],
    boxShadow: [
      '0 0 0px rgba(255,107,53,0)',
      '0 0 20px rgba(255,107,53,0.4)',
      '0 0 0px rgba(255,107,53,0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: easeInOut,
    },
  },
};

// 标签动画变体
const tagVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      delay: 0.2 + i * 0.05,
      duration: 0.2,
      ease: 'backOut',
    },
  }),
  hover: {
    scale: 1.05,
    background: 'rgba(255,107,53,0.1)',
    color: 'var(--primary)',
  },
};

export function ServerCard({
  name,
  icon,
  description,
  tags,
  status,
  stats,
  owner,
  currentMap,
  isFavorite,
  featured,
  editable,
  enableEntrance = true,
  showShimmer = true,
  onJoin,
  onFavorite,
  onEdit,
}: ServerCardProps) {
  const statusConfig = statusColors[status.type];
  const displayStatus = status.text || statusConfig.text;

  return (
    <motion.div
      className="server-card-full"
      variants={cardEntranceVariants}
      initial={enableEntrance ? 'hidden' : 'visible'}
      animate="visible"
      whileHover={{
        scale: 1.01,
        y: -2,
        transition: { duration: 0.2 },
      }}
      style={{
        position: 'relative',
        borderRadius: 8,
        marginBottom: 12,
        overflow: 'hidden',
      }}
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

      {/* 推荐服务器 shimmer 效果 */}
      {featured && showShimmer && (
        <motion.div
          variants={shimmerVariants}
          animate="shimmer"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(255,107,53,0) 0%, rgba(255,107,53,0.1) 50%, rgba(255,107,53,0) 100%)',
            backgroundSize: '200% 100%',
            borderRadius: 8,
          }}
        />
      )}

      {/* 边框层 */}
      <motion.div
        initial={{ borderColor: 'var(--border)' }}
        whileHover={{
          borderColor: featured ? 'rgba(255,107,53,0.3)' : 'rgba(255,107,53,0.2)',
          boxShadow: '0 4px 20px rgba(255,107,53,0.1)',
        }}
        style={{
          position: 'absolute',
          inset: 0,
          border: '1px solid var(--border)',
          borderRadius: 8,
          pointerEvents: 'none',
        }}
      />

      {/* 内容层 */}
      <div style={{ position: 'relative', zIndex: 2, padding: 20 }}>
        {/* Header */}
        <div
          className="server-card-full-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          {/* Icon */}
          <motion.div
            className={cn('server-card-full-icon', featured && 'featured')}
            variants={iconVariants}
            animate={featured ? 'featured' : undefined}
            whileHover={!featured ? { scale: 1.1, rotate: 5 } : undefined}
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: featured
                ? 'linear-gradient(135deg, #ff6b35, #ff8c5a)'
                : 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              color: featured ? '#fff' : 'var(--text)',
            }}
          >
            {icon || '🎮'}
          </motion.div>

          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <motion.span
                initial={enableEntrance ? { opacity: 0, x: -10 } : undefined}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}
              >
                {name}
              </motion.span>
              {editable && (
                <motion.span
                  whileHover={{ scale: 1.1, color: '#1976d2' }}
                  whileTap={{ scale: 0.9 }}
                  style={{ fontSize: 11, color: '#2196f3', cursor: 'pointer' }}
                  onClick={onEdit}
                >
                  ✏️ 编辑
                </motion.span>
              )}
            </div>
            {tags && tags.length > 0 && (
              <motion.div
                initial={enableEntrance ? { opacity: 0 } : undefined}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="server-card-full-tags"
                style={{ display: 'flex', gap: 6, marginTop: 4 }}
              >
                {tags.map((tag, index) => (
                  <motion.span
                    key={index}
                    variants={tagVariants}
                    initial="hidden"
                    animate="visible"
                    custom={index}
                    whileHover="hover"
                    style={{
                      background: 'var(--bg-elevated)',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {tag}
                  </motion.span>
                ))}
              </motion.div>
            )}
          </div>

          {/* Status */}
          <motion.div
            variants={status.type === 'online' ? statusPulseVariants : undefined}
            animate={status.type === 'online' ? 'online' : undefined}
            style={{
              background: statusConfig.bg,
              color: '#fff',
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <motion.span
              animate={status.type === 'online' ? {
                scale: [1, 1.2, 1],
                transition: { duration: 1, repeat: Infinity },
              } : undefined}
            >
              {status.type === 'online' ? '🟢' : status.type === 'offline' ? '⚪' : '⏳'}
            </motion.span>
            {displayStatus}
          </motion.div>
        </div>

        {/* Description */}
        {description && (
          <motion.div
            initial={enableEntrance ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {description}
          </motion.div>
        )}

        {/* Stats Grid */}
        {stats && (
          <motion.div
            initial={enableEntrance ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {stats.players !== undefined && (
              <motion.div
                variants={statFadeVariants}
                initial="hidden"
                animate="visible"
                custom={0}
                whileHover={{ scale: 1.05, y: -2 }}
                style={{
                  textAlign: 'center',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                  borderRadius: 6,
                }}
              >
                <motion.div
                  variants={playerCountVariants}
                  animate="pulse"
                  style={{ fontSize: 18, fontWeight: 500, color: '#4caf50' }}
                >
                  {stats.players}
                </motion.div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>玩家</div>
              </motion.div>
            )}
            {stats.maxPlayers !== undefined && (
              <motion.div
                variants={statFadeVariants}
                initial="hidden"
                animate="visible"
                custom={1}
                whileHover={{ scale: 1.05, y: -2 }}
                style={{
                  textAlign: 'center',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
                  {stats.maxPlayers}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>容量</div>
              </motion.div>
            )}
            {stats.ping !== undefined && (
              <motion.div
                variants={statFadeVariants}
                initial="hidden"
                animate="visible"
                custom={2}
                whileHover={{ scale: 1.05, y: -2 }}
                style={{
                  textAlign: 'center',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: pingColors(stats.ping) }}>
                  {stats.ping}ms
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>延迟</div>
              </motion.div>
            )}
            {stats.mode && (
              <motion.div
                variants={statFadeVariants}
                initial="hidden"
                animate="visible"
                custom={3}
                whileHover={{ scale: 1.05, y: -2 }}
                style={{
                  textAlign: 'center',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
                  {stats.mode}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>模式</div>
              </motion.div>
            )}
            {stats.region && (
              <motion.div
                variants={statFadeVariants}
                initial="hidden"
                animate="visible"
                custom={4}
                whileHover={{ scale: 1.05, y: -2 }}
                style={{
                  textAlign: 'center',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
                  {stats.region}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>地区</div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={enableEntrance ? { opacity: 0 } : undefined}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--border-light)',
            paddingTop: 12,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {owner && (
              <span>
                Owner: <motion.span
                  whileHover={{ color: '#ff6b35' }}
                  style={{ color: '#ff6b35', cursor: 'pointer' }}
                >
                  @{owner.username}
                </motion.span>
                {currentMap && <span> · 地图: <strong style={{ color: 'var(--text)' }}>{currentMap}</strong></span>}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              onClick={onFavorite}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: isFavorite ? '#ffebee' : 'var(--bg-elevated)',
                color: isFavorite ? '#f44336' : 'var(--text-secondary)',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isFavorite ? '❤️ 已收藏' : '🔖 收藏'}
            </motion.button>
            {status.type === 'online' && onJoin && (
              <motion.button
                onClick={onJoin}
                whileHover={{ scale: 1.05, background: '#ff6b35' }}
                whileTap={{ scale: 0.95 }}
                style={{
                  background: '#333',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                加入服务器
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default ServerCard;