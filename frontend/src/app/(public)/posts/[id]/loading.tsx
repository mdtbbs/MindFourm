import { PostDetailSkeleton } from '@/components/forum/post-detail-skeleton';

/**
 * Loading state for a post page.
 *
 * Previously inherited the route group's full-screen spinner, which discarded the
 * layout entirely. `PostDetailSkeleton` already existed but was referenced nowhere.
 */
export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PostDetailSkeleton />
    </div>
  );
}
