import Link from 'next/link';
import { Circle, Clock, Eye, MessageSquare, Pin } from 'lucide-react';
import type { PostSummary } from '@/types';
import { formatTime } from '@/lib/utils';

export default function TopicRow({
  post,
  showCategory = true,
}: {
  post: PostSummary;
  showCategory?: boolean;
}) {
  const categoryColor = post.category_color || '#64748b';
  const activityAt = post.last_activity_at || post.created_at;

  return (
    <article className="border-b border-[var(--border)] px-4 py-4 transition-colors last:border-b-0 hover:bg-[var(--bg-elevated)] sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary)]">
          {post.author_avatar_url ? <img src={post.author_avatar_url} alt="" className="h-full w-full object-cover" /> : (post.author_name || '匿').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {showCategory && post.category_name && (
            <Link href={`/categories/${post.category_id}`} className="mb-1 inline-flex items-center gap-1 text-xs font-medium" style={{ color: categoryColor }}>
              <Circle className="h-2.5 w-2.5 fill-current" />{post.category_name}
            </Link>
          )}
          <div className="flex min-w-0 items-start gap-2">
            {post.is_pinned && <Pin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-label="置顶" />}
            {post.status === 'pending' && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700"><Clock className="h-3 w-3" />待审核</span>}
            <Link href={`/posts/${post.id}`} className="min-w-0 text-[15px] font-semibold leading-6 text-[var(--text)] hover:text-[var(--primary)] sm:truncate">{post.title}</Link>
          </div>
          {post.excerpt && <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{post.excerpt}</p>}
          {post.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag, index) => <Link key={tag.id} href={`/tags/${tag.slug}`} className={`rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--primary)] ${index > 1 ? 'hidden sm:inline-flex' : ''}`}>#{tag.name}</Link>)}
          </div>}
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            {post.author_name || '匿名用户'} · <time dateTime={activityAt}>{formatTime(activityAt)}</time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{post.reply_count || 0}</span>
          <span className="hidden items-center gap-1 sm:inline-flex"><Eye className="h-3.5 w-3.5" />{post.view_count || 0}</span>
        </div>
      </div>
    </article>
  );
}
