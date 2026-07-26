import MarkdownRenderer from '@/components/ui/markdown-renderer';
import ReplyActions from '@/components/forum/reply-actions';
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
}

/**
 * A single reply. Deliberately a server component: only the action row below needs
 * interactivity, so the Markdown is rendered once on the server rather than shipped
 * to the browser and re-parsed for every reply on the page.
 */
export default function ReplyItem({ reply, floor, postId, isNested = false }: ReplyItemProps) {
  const authorLabel = reply.author_mindauth_id ?? `#${reply.user_id}`;

  return (
    <div
      className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] overflow-hidden"
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
        </div>
      </div>

      {/* Reply Content */}
      <div className={isNested ? 'px-3 py-3' : 'p-4'}>
        <MarkdownRenderer content={reply.content} />
      </div>

      <ReplyActions reply={reply} postId={postId} />
    </div>
  );
}
