'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { notificationApi } from '@/lib/api/client';
import { Notification } from '@/types';
import { Bell, CheckCheck, MessageSquare, AtSign, ExternalLink } from 'lucide-react';

export default function NotificationDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notificationApi.unreadCount().then(res => setUnreadCount(res.count)).catch(() => {});
    const interval = setInterval(() => {
      notificationApi.unreadCount().then(res => setUnreadCount(res.count)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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
      setLoading(true);
      const res = await notificationApi.list({ page: 1, limit: 5 });
      setNotifications(res.data);
      setLoading(false);
    } else {
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await notificationApi.markAllAsRead();
    setUnreadCount(0);
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
  };

  const handleClickNotification = async (n: Notification) => {
    if (!n.is_read) {
      await notificationApi.markAsRead(n.id);
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setIsOpen(false);
    if (n.post_id) {
      router.push(`/posts/${n.post_id}${n.reply_id ? `#reply-${n.reply_id}` : ''}`);
    }
  };

  const typeIcon = (type: string) =>
    type === 'reply' ? <MessageSquare className="w-4 h-4" /> : <AtSign className="w-4 h-4" />;

  const typeText = (type: string) =>
    type === 'reply' ? '回复了你的帖子' : '提到了你';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 text-surface-600 dark:text-gray-300 hover:text-primary-600 transition-colors"
        title="通知"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-surface-200 dark:border-gray-700 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-gray-700">
            <span className="font-medium text-surface-900 dark:text-gray-100">通知</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" />
                全部已读
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-surface-400 dark:text-gray-500">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-surface-400 dark:text-gray-500">暂无通知</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-50 dark:hover:bg-gray-700 border-b border-surface-50 dark:border-gray-700 last:border-0 ${
                    !n.is_read ? 'bg-primary-50/30 dark:bg-primary-900/20' : ''
                  }`}
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
              onClick={() => { setIsOpen(false); router.push('/notifications'); }}
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