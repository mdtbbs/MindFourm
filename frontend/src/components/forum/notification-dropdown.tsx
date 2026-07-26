/**
 * NotificationDropdown - Notification dropdown with SSE real-time updates
 *
 * Features:
 * - Real-time notification updates via SSE
 * - Unread count badge with animation
 * - Quick notification preview
 * - Mark all as read functionality
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { notificationApi } from '@/lib/api/client';
import { useNotificationStore } from '@/store/notification-store';
import { useSse } from '@/hooks/use-sse';
import { useToast } from '@/store/toast-store';
import { Notification } from '@/types';
import { Bell, CheckCheck, MessageSquare, AtSign, Heart, ExternalLink } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';

export default function NotificationDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Zustand store
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    addNotification,
  } = useNotificationStore();

  const showToast = useToast().showSuccess;

  // Drives a one-shot bell/badge animation when the unread count goes up.
  const [justArrived, setJustArrived] = useState(false);
  const previousUnreadRef = useRef(unreadCount);

  useEffect(() => {
    const rose = unreadCount > previousUnreadRef.current;
    previousUnreadRef.current = unreadCount;
    if (!rose) return;

    setJustArrived(true);
    const timer = window.setTimeout(() => setJustArrived(false), 1200);
    return () => window.clearTimeout(timer);
  }, [unreadCount]);

  // Stable identity: useSse keeps the handler in a ref, but a fresh closure every
  // render still churns that ref for no reason.
  const handleNotification = useCallback(
    (notification: Notification) => {
      addNotification(notification);

      const typeText =
        notification.type === 'reply' ? '回复了你的帖子'
          : notification.type === 'mention' ? '提到了你'
          : notification.type === 'post_like' ? '点赞了你的帖子'
          : notification.type === 'reply_like' ? '点赞了你的回复'
          : '新通知';

      showToast(`${notification.actor_name} ${typeText}`);
    },
    [addNotification, showToast],
  );

  // SSE real-time notifications
  useSse<Notification>('notification', handleNotification);

  // Fetch unread count on mount
  useEffect(() => {
    fetchNotifications(5);
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleOpen = async () => {
    if (!isOpen) {
      setIsOpen(true);
      // Refresh notifications when opening
      await fetchNotifications(5);
    } else {
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleClickNotification = async (n: Notification) => {
    if (!n.is_read) {
      await markAsRead(n.id);
    }
    setIsOpen(false);
    if (n.post_id) {
      router.push(`/posts/${n.post_id}${n.reply_id ? `#reply-${n.reply_id}` : ''}`);
    }
  };

  const typeIcon = (type: string) =>
    type === 'reply' ? <MessageSquare className="w-4 h-4" />
      : type === 'mention' ? <AtSign className="w-4 h-4" />
      : type === 'post_like' || type === 'reply_like' ? <Heart className="w-4 h-4 text-red-500" />
      : <Bell className="w-4 h-4" />;

  const typeText = (type: string) =>
    type === 'reply' ? '回复了你的帖子'
      : type === 'mention' ? '提到了你'
      : type === 'post_like' ? '点赞了你的帖子'
      : type === 'reply_like' ? '点赞了你的回复'
      : '通知';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 text-surface-600 dark:text-gray-300 hover:text-primary-600 transition-colors"
        title="通知"
        aria-label={`通知 ${unreadCount > 0 ? `(${unreadCount}条未读)` : ''}`}
        aria-expanded={isOpen}
      >
        {/* Animates once when the count rises, not continuously. Keying the class off
            `unreadCount > 0` meant a permanently shaking bell and a permanently
            pulsing badge — constant compositor work for no added information. */}
        <Bell className={`w-5 h-5 transition-transform ${justArrived ? 'animate-wiggle' : ''}`} />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center shadow-sm ${
              justArrived ? 'animate-badge-pulse' : ''
            }`}
            aria-live="polite"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-surface-200 dark:border-gray-700 z-50"
          role="menu"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-gray-700">
            <span className="font-medium text-surface-900 dark:text-gray-100">通知</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                aria-label="全部标记为已读"
              >
                <CheckCheck className="w-3 h-3" />
                全部已读
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingSpinner variant="orbital" size="md" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-surface-400 dark:text-gray-500">暂无通知</div>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-50 dark:hover:bg-gray-700 border-b border-surface-50 dark:border-gray-700 last:border-0 ${
                    !n.is_read ? 'bg-primary-50/30 dark:bg-primary-900/20' : ''
                  }`}
                  role="menuitem"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-surface-500 dark:text-gray-400">{typeIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-700 dark:text-gray-300 line-clamp-2">
                        {n.actor_name} {typeText(n.type)}
                      </p>
                      {n.post_title && (
                        <p className="text-xs text-surface-500 dark:text-gray-400 truncate mt-1">
                          {n.post_title}
                        </p>
                      )}
                      <p className="text-xs text-surface-400 dark:text-gray-500 mt-1">
                        {new Date(n.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t border-surface-100 dark:border-gray-700 bg-surface-50 dark:bg-gray-700/50">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/notifications');
              }}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              查看全部通知
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}