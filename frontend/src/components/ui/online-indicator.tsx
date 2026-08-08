'use client';

import { useEffect } from 'react';
import { usePresence, usePresences } from '@/store';
import { presenceApi } from '@/lib/api/client';

interface OnlineIndicatorProps {
  userId: number;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { dot: 'w-2 h-2', text: 'text-xs' },
  md: { dot: 'w-2.5 h-2.5', text: 'text-sm' },
  lg: { dot: 'w-3 h-3', text: 'text-base' },
};

const statusConfig = {
  online: { color: 'bg-green-500', text: '在线' },
  hosting: { color: 'bg-blue-500', text: '开房中' },
  playing: { color: 'bg-yellow-500', text: '游戏中' },
  offline: { color: 'bg-gray-400', text: '离线' },
};

/**
 * OnlineIndicator - 显示用户在线状态的小圆点
 *
 * @param userId - 用户 ID
 * @param size - 尺寸：'sm' (2px) | 'md' (2.5px, 默认) | 'lg' (3px)
 * @param showText - 是否显示状态文字（默认 false）
 * @param className - 额外的 CSS 类名
 *
 * @example
 * // 头像旁的小圆点
 * <div className="relative">
 *   <Avatar src={user.avatar_url} />
 *   <OnlineIndicator userId={user.id} size="sm" className="absolute bottom-0 right-0" />
 * </div>
 *
 * @example
 * // 用户主页，显示状态文字
 * <OnlineIndicator userId={user.id} size="lg" showText />
 */
export function OnlineIndicator({
  userId,
  size = 'md',
  showText = false,
  className = '',
}: OnlineIndicatorProps) {
  const status = usePresence(userId);
  const config = sizeConfig[size];
  const statusStyle = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={statusStyle.text}
    >
      <span
        className={`${config.dot} ${statusStyle.color} rounded-full ring-2 ring-background`}
      />
      {showText && (
        <span className={`${config.text} text-muted-foreground`}>
          {statusStyle.text}
        </span>
      )}
    </span>
  );
}

interface OnlineIndicatorBatchProps {
  userIds: number[];
  children: (presences: Map<number, 'online' | 'hosting' | 'playing' | 'offline'>) => React.ReactNode;
}

/**
 * OnlineIndicatorBatch - 批量加载多个用户的在线状态
 *
 * 用于需要在一次请求中加载多个用户在线状态的场景，
 * 避免多个 OnlineIndicator 组件各自发起请求。
 *
 * @example
 * <OnlineIndicatorBatch userIds={[1, 2, 3]}>
 *   {(presences) => (
 *     <div>
 *       {users.map(user => (
 *         <div key={user.id}>
 *           <Avatar src={user.avatar_url} />
 *           <StatusDot status={presences.get(user.id)} />
 *         </div>
 *       ))}
 *     </div>
 *   )}
 * </OnlineIndicatorBatch>
 */
export function OnlineIndicatorBatch({ userIds, children }: OnlineIndicatorBatchProps) {
  const presences = usePresences(userIds);

  useEffect(() => {
    if (userIds.length === 0) return;

    // 批量查询在线状态并更新 store
    presenceApi.getPresences(userIds).then((data) => {
      // 通过 store 的 setPresences 方法更新
      import('@/store').then(({ useOnlineStore }) => {
        useOnlineStore.getState().setPresences(data);
      });
    }).catch(() => {
      // 静默失败，不影响用户体验
    });
  }, [userIds]);

  return <>{children(presences)}</>;
}

interface StatusDotProps {
  status: 'online' | 'hosting' | 'playing' | 'offline' | undefined;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * StatusDot - 根据状态显示对应颜色的圆点
 *
 * 用于已经获取到在线状态数据的场景，不需要再次请求。
 */
export function StatusDot({ status = 'offline', size = 'md' }: StatusDotProps) {
  const config = sizeConfig[size];
  const statusStyle = statusConfig[status];

  return (
    <span
      className={`${config.dot} ${statusStyle.color} rounded-full ring-2 ring-background inline-block`}
      title={statusStyle.text}
    />
  );
}
