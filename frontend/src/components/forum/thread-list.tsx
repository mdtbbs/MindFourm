import type { PostSummary } from '@/types';
import TopicRow from './topic-row';

export default function ThreadList({
  posts,
  showCategory = true,
  highlightTerm,
}: {
  posts: PostSummary[];
  showCategory?: boolean;
  highlightTerm?: string;
}) {
  return (
    <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
      {posts.map((post) => <TopicRow key={post.id} post={post} showCategory={showCategory} highlightTerm={highlightTerm} />)}
    </div>
  );
}
