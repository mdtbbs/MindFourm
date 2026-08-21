import Link from 'next/link';
import { Eye, MessageSquare, Pin, ThumbsUp, Clock, Plus } from 'lucide-react';
import { PostSummary } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

interface LatestPostsSettings {
  title: string;
  description: string;
  density: 'compact' | 'comfortable';
  accentColor: string;
  showExcerpt: boolean;
  showTags: boolean;
  showStats: boolean;
  showIndex: boolean;
}

interface LatestPostsListProps {
  posts: PostSummary[];
  settings: LatestPostsSettings;
}

export default function LatestPostsList({ posts, settings }: LatestPostsListProps) {
  const comfortable = settings.density === 'comfortable';

  return (
    <section
      className="border border-[var(--border)] bg-[var(--card)]"
      style={{ ['--latest-accent' as string]: settings.accentColor }}
    >
      <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div
              role="heading"
              aria-level={2}
              className="text-base font-semibold text-[var(--foreground)]"
            >
              <MarkdownRenderer
                content={settings.title}
                className="[&_p]:m-0 [&_p]:text-inherit [&_p]:font-inherit [&_h1]:m-0 [&_h1]:text-inherit [&_h1]:font-inherit [&_h2]:m-0 [&_h2]:text-inherit [&_h2]:font-inherit [&_h3]:m-0 [&_h3]:text-inherit [&_h3]:font-inherit"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 text-xs text-[var(--muted-foreground)] sm:flex"><span className="font-medium text-[var(--foreground)]">最新发布</span><span>最新回复</span><span>热门</span></div>
            <Link href="/posts/new" className="inline-flex items-center gap-1.5 border border-[var(--latest-accent)] bg-[var(--latest-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"><Plus className="h-4 w-4" />发布主题</Link>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {posts.map((post, index) => {
          const excerpt = post.excerpt;

          return (
            <article
              key={post.id}
              data-testid="post-card"
              className={cn(
                'grid gap-3 bg-[var(--bg-card)] px-4 transition-colors sm:px-5',
                comfortable
                  ? 'py-4 sm:grid-cols-[3rem_minmax(0,1fr)_9rem]'
                  : 'py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_8rem]',
                !settings.showIndex
                  && (comfortable
                    ? 'sm:grid-cols-[minmax(0,1fr)_9rem]'
                    : 'sm:grid-cols-[minmax(0,1fr)_8rem]'),
                post.status === 'pending'
                  ? 'bg-amber-50/60 hover:bg-amber-50 border-l-3 border-l-amber-400'
                  : 'hover:bg-[var(--bg-elevated)]',
              )}
            >
              {settings.showIndex && (
                <div className="hidden sm:block">
                  <div
                    className={cn(
                      'border-l-2 pl-2 font-mono text-xs text-[var(--muted-foreground)]',
                      post.is_pinned && 'font-semibold text-[var(--latest-accent)]',
                    )}
                    style={{ borderColor: post.is_pinned ? 'var(--latest-accent)' : 'var(--border)' }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </div>
                </div>
              )}

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  {post.is_pinned && <Pin className="h-4 w-4 shrink-0 text-[var(--latest-accent)]" />}
                  {post.status === 'pending' && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      <Clock className="h-3 w-3" />
                      待审核
                    </span>
                  )}
                  {post.category_name && (
                    <Link
                      href={`/categories/${post.category_id}`}
                      className="shrink-0 border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary)] hover:border-[var(--latest-accent)]"
                    >
                      {post.category_name}
                    </Link>
                  )}
                  <Link
                    href={`/posts/${post.id}`}
                    data-testid="post-link"
                    className="min-w-0 truncate text-[15px] font-semibold text-[var(--foreground)] hover:text-[var(--latest-accent)]"
                  >
                    {post.title}
                  </Link>
                </div>

                {settings.showExcerpt && excerpt && (
                  <p
                    className={cn(
                      'mt-1 text-sm leading-6 text-[var(--muted-foreground)]',
                      'line-clamp-2',
                    )}
                  >
                    {excerpt}
                  </p>
                )}

                {settings.showTags && post.tags && post.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 4).map((tag) => (
                      <Link
                        key={tag.id}
                        href={`/tags/${tag.slug}`}
                        className="border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)] hover:border-[var(--latest-accent)] hover:text-[var(--latest-accent)]"
                      >
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {post.author_name || '匿名用户'} · {post.category_name || '未分类'} · <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString('zh-CN')}>{formatTime(post.created_at)}</time>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)] sm:block sm:text-right">
                {settings.showStats && (
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {post.reply_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {post.view_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {post.like_count || 0}
                    </span>
                  </div>
                )}
                <div className={cn(settings.showStats && 'sm:mt-2')}>
                  <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString('zh-CN')}>{formatTime(post.created_at)}</time>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export type { LatestPostsSettings };
