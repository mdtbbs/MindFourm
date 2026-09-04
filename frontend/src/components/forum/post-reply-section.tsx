'use client';

import { useEffect, useState } from 'react';
import Pagination from '@/components/ui/pagination';
import ReplyThread, { buildReplyTree } from '@/components/forum/reply-thread';
import ReplyFormWrapper from '@/components/forum/reply-form-wrapper';
import type { Reply } from '@/types';

interface ReplyPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function PostReplySection({
  postId,
  postPath,
  replies: initialReplies,
  pagination,
  canAcceptAnswer,
  bestReplyId,
  postOwnerId,
  initialLocked,
}: {
  postId: number;
  postPath: string;
  replies: Reply[];
  pagination: ReplyPagination;
  canAcceptAnswer: boolean;
  bestReplyId: number | null;
  postOwnerId: number;
  initialLocked: boolean;
}) {
  const [replies, setReplies] = useState(initialReplies);
  const [total, setTotal] = useState(pagination.total);
  const [activeBestReplyId, setActiveBestReplyId] = useState(bestReplyId);

  // Navigating to another reply page supplies a fresh server snapshot. Keeping the
  // local list in sync also makes browser Back/Forward deterministic.
  useEffect(() => {
    setReplies(initialReplies);
    setTotal(pagination.total);
    setActiveBestReplyId(bestReplyId);
  }, [initialReplies, pagination.total, pagination.page, bestReplyId]);

  useEffect(() => {
    const handleReplyMutation = (event: Event) => {
      const detail = (event as CustomEvent<{ postId: number; type: 'update' | 'delete' | 'best'; reply?: Reply; replyId?: number | null }>).detail;
      if (detail?.postId !== postId) return;
      if (detail.type === 'update' && detail.reply) {
        setReplies((current) => current.map((item) => item.id === detail.reply!.id ? detail.reply! : item));
      }
      if (detail.type === 'delete' && detail.replyId) {
        setReplies((current) => current.filter((item) => item.id !== detail.replyId));
        setTotal((current) => Math.max(0, current - 1));
      }
      if (detail.type === 'best') setActiveBestReplyId(detail.replyId ?? null);
    };
    window.addEventListener('mdtbbs:reply-mutation', handleReplyMutation);
    return () => window.removeEventListener('mdtbbs:reply-mutation', handleReplyMutation);
  }, [postId]);

  const handleReplyCreated = (reply: Reply) => {
    if (reply.status !== 'published') return;
    setReplies((current) => current.some((item) => item.id === reply.id) ? current : [...current, reply]);
    setTotal((current) => current + 1);
    requestAnimationFrame(() => document.getElementById(`reply-${reply.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return (
    <section className="mt-8 space-y-4" aria-label="回复">
      <h2 className="text-lg font-semibold text-[var(--text)]">回复 ({total})</h2>
      {replies.length === 0 ? (
        <div className="py-8 text-center text-[var(--text-secondary)]">暂无回复，快来抢沙发吧</div>
      ) : (
        <ReplyThread
          nodes={buildReplyTree(replies, (pagination.page - 1) * pagination.limit)}
          postId={postId}
          canAcceptAnswer={canAcceptAnswer}
          bestReplyId={activeBestReplyId}
          postOwnerId={postOwnerId}
        />
      )}
      <Pagination currentPage={pagination.page} totalPages={pagination.totalPages} basePath={postPath} />
      <div className="mt-8">
        <ReplyFormWrapper postId={postId} initialLocked={initialLocked} onReplyCreated={handleReplyCreated} />
      </div>
    </section>
  );
}
