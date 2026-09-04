'use client';

import ReplyForm from '@/components/forum/reply-form';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import type { Reply } from '@/types';

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
      <div className="mt-8 space-y-3 py-8" aria-busy="true" aria-label="正在初始化回复表单">
        <div className="h-10 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mt-8 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-8 text-center">
        <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
          登录后参与回复
        </h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          登录你可以回复帖子、参与讨论、关注感兴趣的内容
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            登录
          </Link>
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            浏览更多
          </Link>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">该帖子已被锁定，不再接受新回复。</p>;
  }

  return (
    <ReplyForm
      postId={postId}
      onReplyCreated={onReplyCreated}
    />
  );
}
