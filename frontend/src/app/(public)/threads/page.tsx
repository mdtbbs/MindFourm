import type { Metadata } from 'next';
import TopicRow from '@/components/forum/topic-row';
import ErrorState from '@/components/ui/error-state';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiPaginated } from '@/lib/api/server-fetch';
import type { PostListResponse } from '@/types';

export const metadata: Metadata = { title: '讨论', description: 'Mindustry 社区讨论区' };

export default async function ThreadsPage() {
  let threads: PostListResponse;
  try {
    threads = await fetchApiPaginated<PostListResponse['data'][number]>('/api/posts?page=1&limit=30&sort=last_activity_at', {
      init: { cache: 'no-store' },
      fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(30),
      throwOnError: true,
    });
  } catch {
    return <ErrorState title="讨论列表加载失败" description="请稍后再试。" action={{ label: '重新加载', href: '/threads' }} />;
  }

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"><div className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="text-3xl font-semibold text-[var(--text)]">讨论</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">按最后活跃时间浏览社区讨论。</p></div>{threads.data.length > 0 ? <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">{threads.data.map((post) => <TopicRow key={post.id} post={post} />)}</div> : <div className="border border-[var(--border)] p-8 text-center text-[var(--text-muted)]">暂时没有讨论</div>}</div>;
}
