'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminNotificationApi } from '@/lib/api/client';
import { useAdminNotificationStore } from '@/store/admin-notification-store';
import { AdminNotification } from '@/types';
import Alert from '@/components/ui/alert';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';

const PAGE_SIZE = 20;

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

export default function AdminNotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastEventAt = useAdminNotificationStore((state) => state.lastEventAt);
  const syncLatest = useAdminNotificationStore((state) => state.setNotifications);
  const syncMarkAll = useAdminNotificationStore((state) => state.markAllAsRead);
  const currentPage = Number(searchParams?.get('page')) || 1;

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminNotificationApi.list({ page, limit: PAGE_SIZE });
      setNotifications(result.data);
      setTotalPages(result.pagination.totalPages);

      if (page === 1) {
        syncLatest(result.data.slice(0, 10));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载后台通知失败');
    } finally {
      setLoading(false);
    }
  }, [syncLatest]);

  useEffect(() => {
    fetchNotifications(currentPage);
  }, [currentPage, fetchNotifications]);

  useEffect(() => {
    if (currentPage === 1 && lastEventAt > 0) {
      fetchNotifications(1);
    }
  }, [currentPage, lastEventAt, fetchNotifications]);

  const handleMarkRead = async (notification: AdminNotification) => {
    if (notification.is_read) {
      if (notification.action_url) router.push(notification.action_url);
      return;
    }

    setSaving(true);
    try {
      await adminNotificationApi.markAsRead(notification.id);
      setNotifications((prev) => prev.map((item) =>
        item.id === notification.id ? { ...item, is_read: true } : item
      ));
    } finally {
      setSaving(false);
    }

    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const handleMarkAllRead = async () => {
    setSaving(true);
    try {
      await syncMarkAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900">后台通知中心</h1>
          <p className="text-sm text-surface-500">集中查看待审核提醒、审核结果和后续扩展的后台事件。</p>
        </div>
        <Button onClick={handleMarkAllRead} disabled={saving || notifications.length === 0}>
          全部标记已读
        </Button>
      </div>

      {error ? <Alert type="error" message={error} /> : null}

      <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-surface-500">加载中...</div>
        ) : notifications.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-surface-500">暂无后台通知</div>
        ) : (
          <div className="divide-y divide-surface-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex flex-col gap-3 px-6 py-4 md:flex-row md:items-start md:justify-between ${
                  notification.is_read ? 'bg-white' : 'bg-primary-50/20'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getLevelVariant(notification.level)}>
                      {notification.level}
                    </Badge>
                    <Badge variant="default">{notification.category}</Badge>
                    {!notification.is_read ? <Badge variant="primary">未读</Badge> : null}
                  </div>
                  <div className="mt-2 text-base font-semibold text-surface-900">
                    {notification.title}
                  </div>
                  {notification.content ? (
                    <div className="mt-2 text-sm leading-6 text-surface-600">
                      {notification.content}
                    </div>
                  ) : null}
                  <div className="mt-3 text-xs text-surface-400">
                    {new Date(notification.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => handleMarkRead(notification)}
                  >
                    {notification.action_url ? '查看详情' : notification.is_read ? '已读' : '标记已读'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/admin/notifications" />
    </div>
  );
}
