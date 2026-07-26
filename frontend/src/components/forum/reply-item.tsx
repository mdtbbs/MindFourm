import MarkdownRenderer from '@/components/ui/markdown-renderer';
import ReplyActions from '@/components/forum/reply-actions';
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
}: ReplyItemProps) {
  const authorLabel = reply.author_mindauth_id ?? `#${reply.user_id}`;

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
        className={`bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between ${
          isNested ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {floor !== null ? (
            <span className="font-medium text-[var(--text)]">#{floor}</span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">回复</span>
          )}
          <span className="text-[var(--text-secondary)]">作者 ID: {authorLabel}</span>
          <span className="text-[var(--text-muted)]">|</span>
          <time
            dateTime={reply.created_at}
            className="text-[var(--text-secondary)]"
            // Relative times differ between server and client render; the server value
            // is authoritative for the initial paint.
            suppressHydrationWarning
          >
            {formatTime(reply.created_at)}
          </time>
          {isBestReply && (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--success)] px-2 py-0.5 text-xs font-medium text-white">
              <Check className="h-3 w-3" />
              已采纳
            </span>
          )}
        </div>
      </div>

      {/* Reply Content */}
      <div className={isNested ? 'px-3 py-3' : 'p-4'}>
        <MarkdownRenderer content={reply.content} />
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
