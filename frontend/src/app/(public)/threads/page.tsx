import type { Metadata } from 'next';
import Link from 'next/link';
import { listThreads } from '@/lib/api/v1/threads';
import { Eye, MessageSquare, Pin } from 'lucide-react';

export const metadata: Metadata = {
  title: '讨论',
  description: 'Mindustry 社区讨论区',
};

export default async function ThreadsPage() {
  let threads;
  try {
    threads = await listThreads({ limit: 30 });
  } catch {
    threads = null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold mb-8">讨论</h1>

      {threads ? (
        <div className="space-y-2">
          {threads.map(thread => (
            <Link
              key={thread.id}
              href={`/posts/${thread.id}`}
              className="block bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4 hover:border-[var(--primary)] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {thread.is_pinned && (
                      <Pin className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0" />
                    )}
                    <h2 className="text-base font-medium truncate">
                      {thread.title}
                    </h2>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {thread.view_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {thread.reply_count}
                    </span>
                    <span>{new Date(thread.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {threads.length === 0 && (
            <div className="text-center text-[var(--text-muted)] py-12">
              暂无讨论
            </div>
          )}
        </div>
      ) : (
        <div className="text-[var(--text-muted)]">
          讨论列表暂时不可用，请稍后再试。
        </div>
      )}
    </div>
  );
}
