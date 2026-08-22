import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { PostSummary } from '@/types';
import TopicRow from './topic-row';

interface LatestPostsSettings {
  title: string;
  description: string;
}

export default function LatestPostsList({ posts, settings }: { posts: PostSummary[]; settings: LatestPostsSettings }) {
  return <section className="border border-[var(--border)] bg-[var(--bg-card)]"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5"><div><h2 className="text-base font-semibold text-[var(--text)]">{settings.title}</h2>{settings.description && <p className="mt-1 text-xs text-[var(--text-secondary)]">{settings.description}</p>}</div><Link href="/posts/new" className="inline-flex items-center gap-1.5 bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"><Plus className="h-4 w-4" />发布主题</Link></div><div>{posts.map((post) => <TopicRow key={post.id} post={post} />)}</div></section>;
}

export type { LatestPostsSettings };
