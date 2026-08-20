'use client';

import ReplyForm from '@/components/forum/reply-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

export default function ReplyFormWrapper({ postId }: { postId: number }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="mt-8 flex items-center justify-center py-8">
        <div className="text-[var(--text-muted)] text-sm">加载中...</div>
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

  return (
    <ReplyForm
      postId={postId}
      onReplyCreated={(reply) => {
        if (reply.status === 'published') {
          router.refresh();
        }
      }}
    />
  );
}
