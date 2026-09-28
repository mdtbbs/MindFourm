'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { messageApi } from '@/lib/api/client';
import { Conversation } from '@/types';
import { formatTime } from '@/lib/utils';
import EmptyState from '@/components/ui/empty-state';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import Skeleton from '@/components/ui/skeleton';
import { useI18n } from '@/i18n/provider';

export default function MessagesPage() {
  const { locale, t } = useI18n();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await messageApi.getConversations();
      setConversations(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messages.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100">{t('messages.title')}</h1>
        {refreshing && <InlineLoading label={t('messages.refreshing')} className="min-h-0 py-0" />}
      </div>

      {loading ? (
        <div className="space-y-2" aria-label={t('messages.loadingList')}>
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}
        </div>
      ) : error && conversations.length === 0 ? (
        <ErrorState title={t('messages.errorTitle')} description={error} onRetry={() => void loadConversations()} />
      ) : conversations.length === 0 ? (
        <EmptyState title={t('messages.empty')} description={t('messages.emptyDescription')} />
      ) : (
        <>
          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <span>{error}</span>
              <button type="button" onClick={() => void loadConversations(true)} className="font-medium underline">{t('messages.retry')}</button>
            </div>
          )}
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link key={conv.user_id} href={`/messages/${conv.user_id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4 hover:border-primary-300 dark:hover:border-gray-600 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface-200 dark:bg-gray-700 flex items-center justify-center text-lg font-bold text-surface-500 dark:text-gray-400">
                    {conv.avatar_url ? <img src={conv.avatar_url} alt={conv.username} className="w-10 h-10 rounded-full object-cover" /> : conv.username?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-surface-900 dark:text-gray-100">{conv.username}</span>
                      <span className="text-xs text-surface-400 dark:text-gray-500">{formatTime(conv.last_at, locale)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm text-surface-500 dark:text-gray-400 truncate">{conv.last_content?.slice(0, 80) || t('messages.noContent')}</p>
                      {conv.unread_count > 0 && <span className="ml-2 px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">{conv.unread_count}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
