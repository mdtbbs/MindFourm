import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostEditForm from '@/components/forum/post-edit-form';
import { fetchApiData } from '@/lib/api/server-fetch';
import { extractIdFromHybridParam } from '@/lib/seo/hybrid-param';
import type { Post } from '@/types';

// Whether this page may be shown depends on who is asking, so it cannot be cached.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '编辑帖子',
  robots: { index: false, follow: false },
};

async function fetchViewer(): Promise<{ id: number; role: string } | null> {
  const result = await fetchApiData<{ authenticated?: boolean; user?: { id: number; role: string } } | null>(
    '/api/auth/check',
    { init: { cache: 'no-store' }, forwardCookies: true, fallback: null },
  );
  return result?.authenticated && result.user ? result.user : null;
}

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = extractIdFromHybridParam(id) ?? parseInt(id);
  if (!Number.isFinite(postId)) notFound();

  const [post, viewer] = await Promise.all([
    fetchApiData<Post | null>(`/api/posts/${postId}`, {
      init: { cache: 'no-store' },
      fallback: null,
      forwardCookies: true,
    }),
    fetchViewer(),
  ]);

  if (!post) notFound();

  // 404 rather than 403 for a stranger: revealing "this post exists but is not yours"
  // is more than the visitor needs, and the API rejects the write regardless — this
  // check only decides whether the form is worth rendering.
  const isOwner = viewer?.id === post.user_id;
  const isStaff = viewer?.role === 'admin' || viewer?.role === 'moderator';
  if (!isOwner && !isStaff) notFound();

  return <PostEditForm post={post} />;
}
