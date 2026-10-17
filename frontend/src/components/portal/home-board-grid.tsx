import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { HomeBoard } from '@/lib/api/v1/home';

/**
 * The homepage board directory.
 *
 * A forum homepage should show where things live before it shows what was said
 * last. Children render exactly like their parent, with the extra indent, so a
 * sub-board reads as part of the same list rather than a second section.
 */
export default function HomeBoardGrid({ boards, title }: { boards: HomeBoard[]; title: string }) {
  if (!boards.length) {
    return <p className="border border-[var(--border)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-muted)]">暂时没有可浏览的版块。</p>;
  }

  return <div>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
      <Link href="/categories" className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--primary-text)] hover:underline">全部分类 <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {boards.map((board) => <Link
        key={board.id}
        href={`/categories/${board.id}`}
        className={`group relative flex min-h-[92px] flex-col justify-between border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${board.depth ? 'sm:ml-4' : ''}`}
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: board.color || 'var(--primary)' }} />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[var(--text)] group-hover:text-[var(--primary-text)]">{board.name}</span>
          {board.description && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--text-secondary)]">{board.description}</span>}
        </span>
        <span className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>{board.post_count} 主题</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-[var(--primary-text)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">进入 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
        </span>
      </Link>)}
    </div>
  </div>;
}
