'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationApi } from '@/lib/api/client';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Notification } from '@/types';
import { MessageSquare, AtSign, CheckCheck, Filter, Heart, Mail, Bell, UserPlus, UserCheck } from 'lucide-react';
import Link from 'next/link';
import EmptyState from '@/components/ui/empty-state';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import { useI18n } from '@/i18n/provider';

export default function NotificationsPage() {
  const { locale, t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      // The filter goes to the server. Fetching one page and filtering it here left the
      // page count describing unfiltered rows, so "unread only" showed an empty list whenever
      // the unread items were past page one — while the bell still reported them.
      const res = await notificationApi.list({ page, limit: 50, filter });
      setNotifications(res.data);
      setPagination(res.pagination);
    } catch {
      setError(t('notificationPage.loadError'));
    }
    setLoading(false);
  }, [filter, t]);

  useEffect(() => {
    loadNotifications(1);
  }, [filter, loadNotifications]);

  // Under a read/unread filter the server decides membership, so a row that just
  // changed state has to be re-fetched out of (or into) the list rather than mutated in
  // place — otherwise "仅未读" keeps showing rows it has just marked read.
  const isFiltered = filter !== 'all';

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      if (isFiltered) {
        await loadNotifications(1);
      } else {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      }
    } catch {
      setActionError(t('notificationPage.markAllReadFailed'));
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await notificationApi.markAsRead(id);
      if (isFiltered) {
        await loadNotifications(pagination.page);
      } else {
        setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    } catch {
      setActionError(t('notificationPage.markReadFailed'));
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'reply':
        return <MessageSquare className="w-5 h-5 text-[var(--primary-text)]" />;
      case 'mention':
        return <AtSign className="w-5 h-5 text-[var(--warning)]" />;
      case 'post_like':
      case 'reply_like':
        return <Heart className="w-5 h-5 text-[var(--error)]" />;
      case 'message':
        return <Mail className="w-5 h-5 text-[var(--success)]" />;
      case 'best_answer':
        return <CheckCheck className="w-5 h-5 text-[var(--success)]" />;
      case 'friend_request':
        return <UserPlus className="w-5 h-5 text-[var(--primary-text)]" />;
      case 'friend_accepted':
        return <UserCheck className="w-5 h-5 text-[var(--success)]" />;
      case 'system':
        return <Bell className="w-5 h-5 text-[var(--text-muted)]" />;
      default:
        return <Bell className="w-5 h-5 text-[var(--text-muted)]" />;
    }
  };

  const typeText = (type: string) => {
    switch (type) {
      case 'reply':
        return t('notificationPage.reply');
      case 'mention':
        return t('notificationPage.mention');
      case 'post_like':
        return t('notificationPage.postLike');
      case 'reply_like':
        return t('notificationPage.replyLike');
      case 'message':
        return t('notificationPage.message');
      case 'friend_request':
        return t('notificationPage.friendRequest');
      case 'friend_accepted':
        return t('notificationPage.friendAccepted');
      case 'system':
        return t('notificationPage.system');
      case 'best_answer':
        return t('notificationPage.bestAnswer');
      default:
        return t('notificationPage.new');
    }
  };

  const actorLabel = (notification: Notification) => {
    if (notification.type === 'system') {
      return null;
    }
    return notification.actor_name || t('notificationPage.community');
  };

  const renderContent = (notification: Notification) => {
    if (!notification.content) {
      return null;
    }

    if (notification.type === 'system') {
      return (
        <div className="mb-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <MarkdownRenderer
            content={notification.content}
            className="prose-p:my-1 prose-headings:my-2 prose-ul:my-2 prose-li:my-0"
          />
        </div>
      );
    }

    return (
      <p className="mb-2 line-clamp-2 text-sm text-[var(--text-secondary)]">{notification.content}</p>
    );
  };

  // First, last, and a window around the current page.
  const visiblePages = Array.from({ length: pagination.totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 2,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)]">{t('notificationPage.title')}</h1>
        <button
          onClick={handleMarkAllRead}
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <CheckCheck className="w-4 h-4" />
          {t('notificationPage.markAllRead')}
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Filter className="h-4 w-4 text-[var(--text-muted)]" />
        {(['all', 'unread', 'read'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-[var(--radius)] px-3 py-1 text-sm transition-colors ${
              filter === f
                ? 'bg-[var(--primary-button)] text-white'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {t(`notificationPage.${f}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <InlineLoading label={t('notificationPage.loading')} className="min-h-[180px]" />
      ) : error ? (
        <ErrorState title={t('notificationPage.errorTitle')} description={error} onRetry={() => void loadNotifications(pagination.page)} />
      ) : notifications.length === 0 ? (
        <EmptyState title={filter === 'unread' ? t('notificationPage.emptyUnread') : filter === 'read' ? t('notificationPage.emptyRead') : t('notificationPage.emptyAll')} />
      ) : (
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`min-w-0 px-3 py-4 sm:px-4 ${
                !n.is_read ? 'border-l-2 border-l-[var(--primary)] bg-[var(--primary-soft)]' : 'border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0">{typeIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {actorLabel(n) && (
                      <span className="font-medium text-[var(--text)]">{actorLabel(n)}</span>
                    )}
                    <span className="text-sm text-[var(--text-muted)]">{typeText(n.type)}</span>
                  </div>
                  {renderContent(n)}
                  {n.post_title && (
                    <Link
                      href={`/posts/${n.post_id}${n.reply_id ? `#reply-${n.reply_id}` : ''}`}
                      className="break-words text-sm text-[var(--primary-text)] hover:text-[var(--primary-dark)]"
                    >
                      {n.post_title}
                    </Link>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(n.created_at))}
                    </span>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="min-h-11 text-xs text-[var(--text-secondary)] hover:text-[var(--primary-text)]"
                      >
                        {t('notificationPage.markRead')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--error)]/30 bg-[var(--error)]/10 px-3 py-2 text-sm text-[var(--error)]" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-medium underline">{t('notificationPage.close')}</button>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {/* Windowed: rendering one button per page allocated an array the length of
              totalPages on every render and produced an unusable strip once the count
              grew. Mirrors the windowing in components/ui/pagination.tsx. */}
          {visiblePages.map((p, idx) => {
            const previous = visiblePages[idx - 1];
            const gap = previous !== undefined && p - previous > 1;

            return (
              <span key={p} className="inline-flex items-center gap-2">
                {gap && <span className="px-1 text-[var(--text-muted)]">…</span>}
                <button
                  onClick={() => loadNotifications(p)}
                  aria-current={p === pagination.page ? 'page' : undefined}
                  className={`min-h-11 rounded-[var(--radius)] px-3 py-1 ${
                    p === pagination.page
                      ? 'bg-[var(--primary-button)] text-white'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {p}
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
