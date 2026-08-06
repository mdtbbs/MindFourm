import { PostListSkeleton } from '@/components/forum/post-skeleton';

/**
 * Posts route loading state
 */
export default function Loading() {
  return <PostListSkeleton count={5} />;
}
