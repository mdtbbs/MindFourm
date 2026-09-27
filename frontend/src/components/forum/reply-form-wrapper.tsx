'use client';

import ReplyForm from '@/components/forum/reply-form';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import type { Reply } from '@/types';
import { useI18n } from '@/i18n/provider';

export default function ReplyFormWrapper({
  postId,
  initialLocked = false,
  onReplyCreated,
}: {
  postId: number;
  initialLocked?: boolean;
  onReplyCreated?: (reply: Reply) => void;
}) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const [isLocked, setIsLocked] = useState(initialLocked);

  useEffect(() => {
    const handleLockChange = (event: Event) => {
      const detail = (event as CustomEvent<{ postId: number; isLocked: boolean }>).detail;
      if (detail?.postId === postId) setIsLocked(detail.isLocked);
    };
    window.addEventListener('mdtbbs:post-lock-change', handleLockChange);
    return () => window.removeEventListener('mdtbbs:post-lock-change', handleLockChange);
  }, [postId]);

  if (authLoading) {
    return (
      <div className="mt-8 space-y-3 py-8" aria-busy="true" aria-label={t('replyForm.loading')}>
        <div className="h-10 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mt-8 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-8 text-center">
        <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
          {t('replyForm.signInTitle')}
        </h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          {t('replyForm.signInDescription')}
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            {t('replyForm.signIn')}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            {t('replyForm.browseMore')}
          </Link>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">{t('replyForm.locked')}</p>;
  }

  return (
    <ReplyForm
      postId={postId}
      onReplyCreated={onReplyCreated}
    />
  );
}
