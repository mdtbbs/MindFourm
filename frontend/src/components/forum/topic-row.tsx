import Link from 'next/link';
import { MessageSquare, Eye, Pin, Clock } from 'lucide-react';
import type { PostSummary } from '@/types';
import { formatTime } from '@/lib/utils';

export default function TopicRow({ post }: { post: PostSummary }) {
  return <article className="border-b border-[var(--border)] px-4 py-4 transition-colors last:border-b-0 hover:bg-[var(--bg-elevated)] sm:px-5">
    <div className="flex min-w-0 items-start gap-3">
      {post.is_pinned && <Pin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {post.category_name && <Link href={`/categories/${post.category_id}`} className="shrink-0 border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--primary)] hover:border-[var(--primary)]">{post.category_name}</Link>}
          {post.status === 'pending' && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700"><Clock className="h-3 w-3" />待审核</span>}
          <Link href={`/posts/${post.id}`} className="min-w-0 truncate text-[15px] font-semibold text-[var(--text)] hover:text-[var(--primary)]">{post.title}</Link>
        </div>
        {post.tags && post.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{post.tags.slice(0, 4).map((tag) => <Link key={tag.id} href={`/tags/${tag.slug}`} className="border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">#{tag.name}</Link>)}</div>}
        <div className="mt-2 text-xs text-[var(--text-muted)]">{post.author_name || '匿名用户'} · <time dateTime={post.created_at}>{formatTime(post.created_at)}</time></div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--text-muted)]"><span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{post.reply_count || 0}</span><span className="hidden items-center gap-1 sm:inline-flex"><Eye className="h-3.5 w-3.5" />{post.view_count || 0}</span></div>
    </div>
  </article>;
}
