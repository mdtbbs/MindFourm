'use client';

import Button from '@/components/ui/button';
import { LikeButton } from '@/components/forum/like-button';
import { useReplyComposeStore } from '@/store/reply-compose-store';
import type { Reply } from '@/types';
import { Quote, Reply as ReplyIcon } from 'lucide-react';

interface ReplyActionsProps {
  reply: Reply;
  /** Scopes the compose target so only this post's composer reacts. */
  postId: number;
}

/**
 * The interactive footer of a reply.
 *
 * Split out so `ReplyItem` — and with it the Markdown rendering — can stay on the
 * server. Previously the whole reply was a client component solely because of these
 * buttons, so a 50-reply page shipped 50 client components that each re-parsed their
 * Markdown during hydration.
 */
export default function ReplyActions({ reply, postId }: ReplyActionsProps) {
  const quote = useReplyComposeStore((state) => state.quote);
  const replyTo = useReplyComposeStore((state) => state.replyTo);

  return (
    <div className="px-4 py-3 bg-[var(--bg-elevated)] border-t border-[var(--border)] flex items-center gap-2">
      <LikeButton type="reply" id={reply.id} initialCount={reply.like_count || 0} />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => quote(postId, reply)}
        className="text-[var(--text-secondary)]"
      >
        <Quote className="w-4 h-4 mr-1" />
        引用
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => replyTo(postId, reply)}
        className="text-[var(--text-secondary)]"
      >
        <ReplyIcon className="w-4 h-4 mr-1" />
        回复
      </Button>
    </div>
  );
}
