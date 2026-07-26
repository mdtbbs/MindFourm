import { PostListSkeleton } from '@/components/forum/post-skeleton';

/**
 * Loading state for the public routes.
 *
 * A list skeleton rather than a full-screen spinner: it holds the layout so the page
 * does not visibly jump when content lands, and it shows what is arriving.
 * `PostListSkeleton` already existed but was referenced nowhere.
 */
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PostListSkeleton count={6} />
    </div>
  );
}