import MarkdownRenderer from '@/components/ui/markdown-renderer';
import ReplyActions from '@/components/forum/reply-actions';
import { formatTime } from '@/lib/utils';
import type { Reply } from '@/types';

interface ReplyItemProps {
  reply: Reply;
  index: number;
  /** Scopes the quote/reply target to this post's composer. */
  postId: number;
}

/**
 * A single reply. Deliberately a server component: only the action row below needs
 * interactivity, so the Markdown is rendered once on the server rather than shipped
 * to the browser and re-parsed for every reply on the page.
 */
export default function ReplyItem({ reply, index, postId }: ReplyItemProps) {
  const authorLabel = reply.author_mindauth_id ?? `#${reply.user_id}`;

  return (
    <div
      className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] overflow-hidden"
      id={`reply-${reply.id}`}
    >
      {/* Reply Header */}
      <div className="px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-[var(--text)]">#{index + 1}</span>
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
      <div className="p-4">
        <MarkdownRenderer content={reply.content} />
      </div>

      <ReplyActions reply={reply} postId={postId} />
    </div>
  );
}
