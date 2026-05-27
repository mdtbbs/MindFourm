'use client';

import React from 'react';

export type TitleType = 'active' | 'core' | 'mod' | 'admin' | 'contributor' | 'custom';

export interface TitleProps {
  type: TitleType;
  text?: string;
  icon?: string;
  size?: 'normal' | 'sm';
  customColor?: string;
  customIconColor?: string;
  bordered?: boolean;
  onClick?: () => void;
}

const titleConfig: Record<TitleType, { color: string; iconBg: string; defaultIcon: string; defaultText: string }> = {
  active: { color: 'var(--title-active)', iconBg: 'var(--title-active)', defaultIcon: '✓', defaultText: '活跃用户' },
  core: { color: 'var(--title-core)', iconBg: 'var(--title-core)', defaultIcon: '⭐', defaultText: '核心成员' },
  mod: { color: 'var(--title-mod)', iconBg: 'var(--title-mod)', defaultIcon: '⭐', defaultText: '版主' },
  admin: { color: '#b8860b', iconBg: 'linear-gradient(135deg, #ffd700, #ffb347)', defaultIcon: '👑', defaultText: '管理员' },
  contributor: { color: 'var(--title-contributor)', iconBg: 'var(--title-contributor)', defaultIcon: '🚀', defaultText: '贡献者' },
  custom: { color: 'var(--text-secondary)', iconBg: 'var(--bg-elevated)', defaultIcon: '', defaultText: '' },
};

export function Title({
  type,
  text,
  icon,
  size = 'normal',
  customColor,
  customIconColor,
  bordered = true,
  onClick,
}: TitleProps) {
  const config = titleConfig[type];
  const displayText = text || config.defaultText;
  const displayIcon = icon || config.defaultIcon;

  const fontSize = size === 'normal' ? 13 : 11;
  const iconSize = size === 'normal' ? 20 : 16;
  const padding = size === 'normal' ? '4px 8px' : '2px 6px';

  return (
    <div
      className={`title-badge title-${type}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding,
        fontSize,
        borderRadius: 4,
        background: type === 'custom' ? 'transparent' : `rgba(${type === 'admin' ? '255,193,7' : type === 'mod' ? '255,107,53' : type === 'active' ? '76,175,80' : type === 'core' ? '33,150,243' : '156,39,176'},0.1)`,
        border: bordered ? `1px solid ${customColor || config.color}` : 'none',
        color: customColor || config.color,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      {displayIcon && (
        <span
          className="title-icon"
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
        </span>
      )}
      <span>{displayText}</span>
    </div>
  );
}

export interface TitleListProps {
  titles: Array<{ type: TitleType; text?: string; icon?: string }>;
  size?: 'normal' | 'sm';
  maxShow?: number;
}

export function TitleList({ titles, size = 'sm', maxShow = 2 }: TitleListProps) {
  const visibleTitles = titles.slice(0, maxShow);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {visibleTitles.map((title, index) => (
        <Title key={index} type={title.type} text={title.text} icon={title.icon} size={size} />
      ))}
    </div>
  );
}

export default Title;