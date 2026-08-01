import type { Metadata } from 'next';
import PostForm from '@/components/forum/post-form';

// Posting depends on the current visitor and should never be prerendered or shared-cached.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '发布帖子',
  robots: { index: false, follow: false },
};

export default function NewPostPage() {
  return <PostForm />;
}
