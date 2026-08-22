import type { PostSummary } from '@/types';
import TopicRow from './topic-row';

export default function PostCard({ post }: { post: PostSummary }) {
  return <TopicRow post={post} />;
}
