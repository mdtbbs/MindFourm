'use client';

import { useState, useEffect } from 'react';
import { notificationApi } from '@/lib/api/client';
import { Notification } from '@/types';
import { MessageSquare, AtSign, CheckCheck, Filter, Heart, Mail, Bell } from 'lucide-react';
import Link from 'next/link';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications(1);
  }, [filter]);

  const loadNotifications = async (page: number) => {
    setLoading(true);
    try {
      const res = await notificationApi.list({ page, limit: 50 });
      let filtered = res.data;
      if (filter === 'unread') filtered = res.data.filter(n => !n.is_read);
      if (filter === 'read') filtered = res.data.filter(n => n.is_read);
      setNotifications(filtered);
      setPagination(res.pagination);
    } catch {
      setNotifications([]);
    }
    setLoading(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleMarkRead = async (id: number) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'reply':
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case 'mention':
        return <AtSign className="w-5 h-5 text-orange-500" />;
      case 'post_like':
      case 'reply_like':
        return <Heart className="w-5 h-5 text-red-500" />;
      case 'message':
        return <Mail className="w-5 h-5 text-green-500" />;
      case 'system':
        return <Bell className="w-5 h-5 text-purple-500" />;
      default:
        return <Bell className="w-5 h-5 text-surface-400" />;
    }
  };

  const typeText = (type: string) => {
    switch (type) {
      case 'reply':
        return '回复了你的帖子';
      case 'mention':
        return '在帖子中提到了你';
      case 'post_like':
        return '点赞了你的帖子';
      case 'reply_like':
        return '点赞了你的回复';
      case 'message':
        return '给你发了私信';
      case 'system':
        return '系统通知';
      default:
        return '新通知';
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100">通知</h1>
        <button
          onClick={handleMarkAllRead}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-100 dark:bg-gray-700 hover:bg-surface-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-surface-700 dark:text-gray-300"
        >
          <CheckCheck className="w-4 h-4" />
          全部标记已读
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-surface-500 dark:text-gray-400" />
        {(['all', 'unread', 'read'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-surface-100 dark:bg-gray-700 text-surface-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-gray-600'
            }`}
          >
            {f === 'all' ? '全部' : f === 'unread' ? '未读' : '已读'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-surface-400 dark:text-gray-500">加载中...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-surface-400 dark:text-gray-500">
          <p>暂无通知</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`bg-white dark:bg-gray-800 rounded-lg border p-4 ${
                !n.is_read ? 'border-primary-200 dark:border-primary-700 bg-primary-50/20 dark:bg-primary-900/10' : 'border-surface-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0">{typeIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-surface-900 dark:text-gray-100">{n.actor_name}</span>
                    <span className="text-sm text-surface-500 dark:text-gray-400">{typeText(n.type)}</span>
                  </div>
                  {n.content && (
                    <p className="text-sm text-surface-600 dark:text-gray-300 line-clamp-2 mb-2">{n.content}</p>
                  )}
                  {n.post_title && (
                    <Link
                      href={`/posts/${n.post_id}${n.reply_id ? `#reply-${n.reply_id}` : ''}`}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      {n.post_title}
                    </Link>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-surface-400 dark:text-gray-500">
                      {new Date(n.created_at).toLocaleString('zh-CN')}
                    </span>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="text-xs text-surface-500 dark:text-gray-400 hover:text-primary-600"
                      >
                        标记已读
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => loadNotifications(p)}
              className={`px-3 py-1 rounded ${
                p === pagination.page ? 'bg-primary-600 text-white' : 'bg-surface-100 dark:bg-gray-700 text-surface-600 dark:text-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}