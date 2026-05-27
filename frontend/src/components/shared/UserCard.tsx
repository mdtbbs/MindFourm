'use client';

import React from 'react';
import Link from 'next/link';
import { Medal, MedalLevel } from './Medal';
import { Title, TitleType } from './Title';

export interface UserCardProps {
  userId?: string | number;
  username: string;
  avatarUrl?: string;
  title?: { type: TitleType; text?: string };
  medals?: Array<{ level: MedalLevel; icon?: string }>;
  stats?: { posts?: number; replies?: number; likes?: number };
  size?: 'standard' | 'mini';
  showStats?: boolean;
  onClick?: () => void;
}

export function UserCard({
  username,
  avatarUrl,
  title,
  medals,
  stats,
  size = 'standard',
  showStats = true,
  onClick,
}: UserCardProps) {
  const isMini = size === 'mini';
  const width = isMini ? 100 : 140;
  const avatarSize = isMini ? 36 : 48;
  const medalSize = isMini ? 'xs' : 'mini';

  return (
    <div
      className={`user-card ${isMini ? 'user-card-mini' : ''}`}
      style={{
        width,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: isMini ? 8 : 16,
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <div style={{ width: avatarSize, height: avatarSize, borderRadius: 6, margin: '0 auto', marginBottom: isMini ? 4 : 8, background: avatarUrl ? 'transparent' : 'var(--bg-elevated)', overflow: 'hidden' }}>
        {avatarUrl && <img src={avatarUrl} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ fontSize: isMini ? 12 : 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
        {username}
      </div>
      {title && <div style={{ marginBottom: isMini ? 4 : 6 }}><Title type={title.type} text={title.text} size="sm" bordered={false} /></div>}
      {medals && medals.length > 0 && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: isMini ? 0 : 12 }}>
          {medals.slice(0, isMini ? 2 : 5).map((medal, index) => <Medal key={index} level={medal.level} icon={medal.icon} size={medalSize} />)}
        </div>
      )}
      {showStats && stats && !isMini && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {stats.posts !== undefined && <div>帖子: <strong style={{ color: 'var(--text)' }}>{stats.posts}</strong></div>}
          {stats.replies !== undefined && <div>回复: <strong style={{ color: 'var(--text)' }}>{stats.replies}</strong></div>}
          {stats.likes !== undefined && <div>赞: <strong style={{ color: 'var(--text)' }}>{stats.likes}</strong></div>}
        </div>
      )}
    </div>
  );
}

export default UserCard;