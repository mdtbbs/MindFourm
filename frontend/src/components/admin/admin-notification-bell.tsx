'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ExternalLink, Radio } from 'lucide-react';
import { useSse } from '@/hooks/use-sse';
import Badge from '@/components/ui/badge';
import { AdminNotification } from '@/types';
import { useAdminNotificationStore } from '@/store/admin-notification-store';
import { useToastStore } from '@/store/toast-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ADMIN_SSE_ENDPOINT = `${API_URL}/api/admin/notifications/events`;

function getLevelVariant(level: AdminNotification['level']) {
  switch (level) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'default';
  }
}

export default function AdminNotificationBell() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    addNotification,
    setConnected,
  } = useAdminNotificationStore();

  const showSuccess = useToastStore((state) => state.showSuccess);
  const showInfo = useToastStore((state) => state.showInfo);
  const showWarning = useToastStore((state) => state.showWarning);
  const showError = useToastStore((state) => state.showError);

  useSse<AdminNotification>('admin-notification', (notification) => {
    addNotification(notification);

    if (notification.level === 'success') {
      showSuccess(notification.title);
    } else if (notification.level === 'warning') {
      showWarning(notification.title);
    } else if (notification.level === 'error') {
      showError(notification.title);
    } else {
      showInfo(notification.title);
    }
  }, {
    url: ADMIN_SSE_ENDPOINT,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
    onError: () => setConnected(false),
  });

  useEffect(() => {
    fetchNotifications(8).catch(() => undefined);
    fetchUnreadCount().catch(() => undefined);
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleOpen = async () => {
    if (!isOpen) {
      setIsOpen(true);
      await fetchNotifications(8).catch(() => undefined);
      await fetchUnreadCount().catch(() => undefined);
      return;
    }

    setIsOpen(false);
  };

  const handleClickNotification = async (notification: AdminNotification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id).catch(() => undefined);
    }

    setIsOpen(false);
    router.push(notification.action_url || '/admin/notifications');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
        aria-label={`后台通知${unreadCount > 0 ? `（${unreadCount} 条未读）` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-wiggle' : ''}`} />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-2 w-96 overflow-hidden rounded-lg border border-surface-200 bg-white shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
            <div>
              <div className="font-medium text-surface-900">后台通知</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-green-600' : 'text-surface-400'}`} />
                {isConnected ? '实时连接已建立' : '实时连接未建立'}
              </div>
            </div>
            {unreadCount > 0 ? (
              <button
                onClick={() => markAllAsRead().catch(() => undefined)}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                全部已读
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-surface-500">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-surface-500">暂无后台通知</div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleClickNotification(notification)}
                  className={`w-full border-b border-surface-100 px-4 py-3 text-left transition-colors hover:bg-surface-50 ${
                    notification.is_read ? 'bg-white' : 'bg-primary-50/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      <Badge variant={getLevelVariant(notification.level)}>
                        {notification.level}
                      </Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-surface-900">{notification.title}</div>
                      {notification.content ? (
                        <div className="mt-1 line-clamp-2 text-sm text-surface-600">
                          {notification.content}
                        </div>
                      ) : null}
                      <div className="mt-2 text-xs text-surface-400">
                        {new Date(notification.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center justify-between bg-surface-50 px-4 py-3">
            <span className="text-xs text-surface-500">最新 8 条后台通知</span>
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/admin/notifications');
              }}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              通知中心
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
