import Link from 'next/link';
import { Eye, MessageSquare, Pin, ThumbsUp, Clock } from 'lucide-react';
import { PostSummary } from '@/types';
import { cn } from '@/lib/utils';
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

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function LatestPostsList({ posts, settings }: LatestPostsListProps) {
  const comfortable = settings.density === 'comfortable';

  return (
    <section
      className="border border-[var(--border)] bg-[var(--card)]"
      style={{ ['--latest-accent' as string]: settings.accentColor }}
    >
      <div className="border-b border-[var(--border)] bg-[#f7fbff] px-4 py-3 sm:px-5">
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
            {settings.description && (
              <MarkdownRenderer
                content={settings.description}
                className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] [&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0"
              />
            )}
          </div>
          <Link
            href="/posts/new"
            className="border border-[var(--latest-accent)] bg-[var(--latest-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            发帖
          </Link>
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
                'grid gap-3 bg-white px-4 transition-colors sm:px-5',
                comfortable
                  ? 'py-4 sm:grid-cols-[3rem_minmax(0,1fr)_9rem]'
                  : 'py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_8rem]',
                !settings.showIndex
                  && (comfortable
                    ? 'sm:grid-cols-[minmax(0,1fr)_9rem]'
                    : 'sm:grid-cols-[minmax(0,1fr)_8rem]'),
                post.status === 'pending'
                  ? 'bg-amber-50/60 hover:bg-amber-50 border-l-3 border-l-amber-400'
                  : 'hover:bg-[#f7fbff]',
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
                      className="shrink-0 border border-[#cfe0f5] bg-[#edf6ff] px-2 py-0.5 text-[11px] font-medium text-[#1d5ea8] hover:border-[var(--latest-accent)]"
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
                      comfortable ? 'line-clamp-2' : 'line-clamp-1',
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
                  {formatTime(post.created_at)}
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
