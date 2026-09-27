'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RotateCw, UserX } from 'lucide-react';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatTime } from '@/lib/utils';
import { userBlockApi, type BlockedUserItem } from '@/lib/api/user-blocks';
import { JsonRequestError } from '@/lib/api/request-json';
import { useToastStore } from '@/store/toast-store';
import { useI18n } from '@/i18n/provider';

const PAGE_SIZE = 20;

export default function BlockedUsersPage() {
  const { locale, t } = useI18n();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);

  const [items, setItems] = useState<BlockedUserItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // Separate from "no items": an empty list is a valid answer, a failed request is not,
  // and rendering the empty state for both tells the user their block list is empty when
  // it may be full.
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await userBlockApi.list({ page: targetPage, limit: PAGE_SIZE });
      setItems(res.data);
      setPage(res.pagination.page);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blockedUsers.loadFailed'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const unblock = async (item: BlockedUserItem) => {
    setRemovingId(item.user.id);
    try {
      await userBlockApi.unblock(item.user.id);
      showSuccess(t('blockedUsers.unblocked', { name: item.user.username || t('blockedUsers.anonymousUser', { id: item.user.id }) }));
      // Reloaded rather than spliced locally: removing the last row of a page would
      // otherwise leave the user looking at an empty page that still reports a total.
      await load(items.length === 1 && page > 1 ? page - 1 : page);
    } catch (err) {
      if (err instanceof JsonRequestError && err.status === 404) {
        // Already gone — the list was stale, so refresh instead of reporting a failure.
        await load(page);
      } else {
        showError(err instanceof Error ? err.message : t('blockedUsers.unblockFailed'));
      }
    }
    setRemovingId(null);
  };

  return (
    <div className="bg-[var(--bg)]">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-6">
          <Link href="/" className="hover:text-[var(--primary)]">
            {t('blockedUsers.home')}
          </Link>
          <span>/</span>
          <Link href="/settings" className="hover:text-[var(--primary)]">
            {t('blockedUsers.settings')}
          </Link>
          <span>/</span>
          <span>{t('blockedUsers.title')}</span>
        </nav>

        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('blockedUsers.title')}</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {t('blockedUsers.description', { count: total > 0 ? t('blockedUsers.count', { count: total }) : '' })}
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg border border-[var(--error)] bg-[var(--bg-card)] p-6 text-center"
          >
            <p className="text-sm text-[var(--error)] mb-4">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load(page)}>
              <RotateCw className="w-4 h-4 mr-1" />
              {t('blockedUsers.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
            <UserX className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-[var(--text)] font-medium mb-1">{t('blockedUsers.emptyTitle')}</p>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('blockedUsers.emptyDescription')}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-lg font-bold text-[var(--text-muted)] overflow-hidden">
                  {item.user.avatar_url ? (
                    /* Plain <img>, as everywhere else avatars are shown: they come from
                       a deployment-configured host that next/image would need declared
                       in next.config up front. */
                    <img
                      src={item.user.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    (item.user.username || '?').charAt(0).toUpperCase()
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <Link
                    href={`/users/${item.user.id}`}
                    className="font-medium text-[var(--text)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
                  >
                    {item.user.username || t('blockedUsers.anonymousUser', { id: item.user.id })}
                  </Link>
                  <p className="text-xs text-[var(--text-muted)]">
                    <time dateTime={item.created_at} suppressHydrationWarning>
                      {formatTime(item.created_at, locale)}
                    </time>
                    {t('blockedUsers.blockedOn')}
                  </p>
                  {item.reason && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)] break-words">
                      {t('blockedUsers.reason', { value: item.reason })}
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removingId === item.user.id}
                  onClick={() => void unblock(item)}
                  data-testid={`unblock-${item.user.id}`}
                >
                  {removingId === item.user.id ? t('blockedUsers.processing') : t('blockedUsers.unblock')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Self-contained paging: this list is fetched into component state, so the
            shared Pagination component's URL navigation would not move it. */}
        {!loading && !error && totalPages > 1 && (
          <nav className="flex items-center justify-center gap-4 mt-6" aria-label={t('blockedUsers.pagination')}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('blockedUsers.previous')}
            </Button>
            <span className="text-sm text-[var(--text-secondary)]" aria-live="polite">
              {t('blockedUsers.page', { page, total: totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => void load(page + 1)}
            >
              {t('blockedUsers.next')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </nav>
        )}
      </main>
    </div>
  );
}
