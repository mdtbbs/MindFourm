'use client';

import MarkdownRenderer from '@/components/ui/markdown-renderer';
import ReplyActions from '@/components/forum/reply-actions';
import AuthorLink from '@/components/forum/author-link';
import ReplyAttachmentList from '@/components/forum/reply-attachment-list';
import { Check } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import type { Reply } from '@/types';

interface ReplyItemProps {
  reply: Reply;
  /**
   * Floor number, or null for a nested reply.
   *
   * Only root replies get one: numbering a nested reply would imply it holds a position
   * in the post's sequence of floors, which it does not.
   */
  floor: number | null;
  /** Scopes the quote/reply target to this post's composer. */
  postId: number;
  isNested?: boolean;
  /** Whether the viewer may accept an answer here — the post's author, or staff. */
  canAcceptAnswer?: boolean;
  /** True when this reply is the accepted answer. */
  isBestReply?: boolean;
  /** Shows the original poster marker on their own replies. */
  isOriginalPoster?: boolean;
}

/**
 * A single reply. Deliberately a server component: only the action row below needs
 * interactivity, so the Markdown is rendered once on the server rather than shipped
 * to the browser and re-parsed for every reply on the page.
 */
export default function ReplyItem({
  reply,
  floor,
  postId,
  isNested = false,
  canAcceptAnswer = false,
  isBestReply = false,
  isOriginalPoster = false,
}: ReplyItemProps) {
  return (
    <div
      className={`bg-[var(--bg-card)] rounded-lg border overflow-hidden ${
        // A ring rather than a background tint: the accepted answer has to stand out
        // without making its body text sit on a different surface from every other reply.
        isBestReply
          ? 'border-[var(--success)] ring-1 ring-[var(--success)]'
          : 'border-[var(--border)]'
      }`}
      id={`reply-${reply.id}`}
    >
      {/* Reply Header */}
      <div
        className={`border-b border-[var(--border)] bg-[var(--bg-card)] flex items-center justify-between ${
          isNested ? 'px-3 py-2' : 'px-4 py-2.5'
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {floor !== null ? (
            <span className="shrink-0 font-medium text-[var(--text)]">#{floor}</span>
          ) : (
            <span className="shrink-0 text-xs text-[var(--text-muted)]">回复</span>
          )}
          <AuthorLink
            userId={reply.user_id}
            name={reply.author_name}
            avatarUrl={reply.author_avatar_url}
            role={reply.author_role}
            size={isNested ? 'sm' : 'md'}
            showMeta={!isNested}
            className="min-w-0"
          />
          {isOriginalPoster && <span className="rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary)]">楼主</span>}
          <span className="text-[var(--text-muted)]">|</span>
          <time
            dateTime={reply.created_at}
            title={new Date(reply.created_at).toLocaleString('zh-CN')}
            className="text-[var(--text-secondary)]"
            // Relative times differ between server and client render; the server value
            // is authoritative for the initial paint.
            suppressHydrationWarning
          >
            {formatTime(reply.created_at)}
          </time>
          {reply.location_label && (
            <span className="text-xs text-[var(--text-muted)]">{reply.location_label}</span>
          )}
          {isBestReply && (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--success)] px-2 py-0.5 text-xs font-medium text-white">
              <Check className="h-3 w-3" />
              已采纳
            </span>
          )}
        </div>
      </div>

      {/* Reply Content */}
      <div className={isNested ? 'px-3 py-3' : 'px-4 py-5'}>
        <MarkdownRenderer content={reply.content} className="text-[var(--text)]" />
        <ReplyAttachmentList replyId={reply.id} />
      </div>

      <ReplyActions
        reply={reply}
        postId={postId}
        canAcceptAnswer={canAcceptAnswer}
        isBestReply={isBestReply}
      />
    </div>
  );
}
