import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import PostContent from '@/components/forum/post-content';
import PostReplySection from '@/components/forum/post-reply-section';
import AttachmentList from '@/components/forum/attachment-list';
import Link from 'next/link';
import { fetchApiData } from '@/lib/api/server-fetch';
import { fetchPublicSettings } from '@/lib/settings/server';
import { Post, Attachment, UserRole } from '@/types';
import { toMetaDescription } from '@/lib/seo/description';
import { absoluteUrl } from '@/lib/seo/site-url';
import JsonLd from '@/components/seo/json-ld';
import { buildHybridParam, extractIdFromHybridParam } from '@/lib/seo/hybrid-param';

// This page forwards cookies (each viewer sees a different moderation state), which
// calls `cookies()` and forces dynamic rendering — so the `revalidate` export that
// used to sit here was inert. Declaring it was misleading rather than useful.
export const dynamic = 'force-dynamic';

const fetchSettings = cache(fetchPublicSettings);

/**
 * Memoised per request: `generateMetadata` and the page body both need the post, and
 * without `cache()` that was two identical round trips for every page view.
 */
const fetchPost = cache(
  async (id: number, page: number, limit: number): Promise<Post | null> => {
    return fetchApiData<Post | null>(`/api/posts/${id}?reply_page=${page}&reply_limit=${limit}`, {
      init: { cache: 'no-store' },
      fallback: null,
      forwardCookies: true,
      notFoundOn404: true,
      throwOnError: true,
    });
  },
);

/**
 * Resolves the post with the same arguments the page body uses, so React's `cache()`
 * actually deduplicates the two calls. Requesting a different reply page here would
 * be a distinct cache key and therefore a second identical round trip.
 */
async function loadPost(idParam: string, pageParam?: string) {
  const postId = extractIdFromHybridParam(idParam) ?? parseInt(idParam);
  const page = parseInt(pageParam || '1');

  if (!Number.isFinite(postId)) {
    return { postId, page, repliesPerPage: 50, post: null };
  }

  const settings = await fetchSettings();
  const repliesPerPage = parseInt(settings.replies_per_page || '50');
  const post = await fetchPost(postId, page, repliesPerPage);

  return { postId, page, repliesPerPage, post, settings };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ id }, { page: pageStr }] = await Promise.all([params, searchParams]);
  const { post, settings = {} } = await loadPost(id, pageStr);

  if (!post) {
    // Raised here rather than only in the page body. `posts/[id]/loading.tsx` puts the
    // page inside a Suspense boundary, so by the time the body runs the 200 shell has
    // already been flushed and `notFound()` can no longer change the status — the
    // deleted post rendered a "帖子不存在" page under HTTP 200, which is the soft-404
    // this was meant to fix. generateMetadata runs before the first flush, so the
    // status is still open. `loadPost` is cached, so this costs no extra fetch.
    notFound();
  }

  // Bare title: the root layout's `title.template` appends the suffix. Appending it
  // here too produced "标题 | MindForum | MindForum".
  const description = toMetaDescription(post.content);
  // One canonical form per post, so `/posts/123`, `/posts/123-slug` and
  // `/posts/123-anything` stop competing as separate URLs.
  const canonical = `/posts/${buildHybridParam(post.id, post.slug || '')}`;

  const meta: Metadata = {
    title: post.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      url: canonical,
    },
    twitter: {
      card: settings.seo_og_image ? 'summary_large_image' : 'summary',
      title: post.title,
      description,
    },
  };

  if (settings.seo_og_image) {
    meta.openGraph = { ...meta.openGraph, images: [settings.seo_og_image] };
    meta.twitter = { ...meta.twitter, images: [settings.seo_og_image] };
  }

  return meta;
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ id }, { page: pageStr }] = await Promise.all([params, searchParams]);
  // Accepts both `/posts/123` and `/posts/123-slug`. Resolved through the same helper
  // generateMetadata uses, so the post is fetched once per request rather than twice.
  const { postId, page, repliesPerPage, post } = await loadPost(id, pageStr);

  if (!post) {
    // A missing or unpublished post must answer 404. Rendering a "帖子不存在" body
    // with HTTP 200 kept every deleted post indexed as a thin-content page.
    notFound();
  }

  const attachments = await fetchApiData<Attachment[]>(`/api/attachments/post/${postId}`, {
    init: { cache: 'no-store' },
    fallback: [],
  });

  const replies = post.replies ?? [];
  const pagination = post.replyPagination ?? { page: 1, limit: repliesPerPage, totalPages: 1, total: 0 };
  const postPath = `/posts/${buildHybridParam(post.id, post.slug || '')}`;

  // `DiscussionForumPosting` is the schema Google uses for forum rich results and
  // discussion carousels; the breadcrumb mirrors the visual trail rendered below.
  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      '@id': absoluteUrl(postPath),
      url: absoluteUrl(postPath),
      headline: post.title,
      articleBody: toMetaDescription(post.content, 5000),
      datePublished: post.created_at,
      dateModified: post.updated_at || post.created_at,
      commentCount: pagination.total,
      author: {
        '@type': 'Person',
        name: post.author_name || `用户 #${post.user_id}`,
        url: absoluteUrl(`/users/${post.user_id}`),
        ...(post.author_avatar_url ? { image: absoluteUrl(post.author_avatar_url) } : {}),
      },
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/CommentAction',
          userInteractionCount: pagination.total,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/LikeAction',
          userInteractionCount: post.like_count ?? 0,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/ViewAction',
          userInteractionCount: post.view_count ?? 0,
        },
      ],
      ...(replies.length > 0
        ? {
            comment: replies
              .filter((reply) => reply.status !== 'deleted')
              .map((reply) => ({
                '@type': 'Comment',
                text: toMetaDescription(reply.content, 5000),
                datePublished: reply.created_at,
                dateModified: reply.updated_at || reply.created_at,
                author: {
                  '@type': 'Person',
                  name: reply.author_name || `用户 #${reply.user_id}`,
                  url: absoluteUrl(`/users/${reply.user_id}`),
                  ...(reply.author_avatar_url ? { image: absoluteUrl(reply.author_avatar_url) } : {}),
                },
              })),
          }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
        ...(post.category_name
          ? [{
              '@type': 'ListItem',
              position: 2,
              name: post.category_name,
              item: absoluteUrl(`/categories/${post.category_id}`),
            }]
          : []),
        {
          '@type': 'ListItem',
          position: post.category_name ? 3 : 2,
          name: post.title,
          item: absoluteUrl(postPath),
        },
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-[var(--text-secondary)]">
        <Link href="/" className="hover:text-[var(--primary)]">首页</Link>
        <span className="mx-2">/</span>
        {post.category_name ? (
          <>
            <Link href={`/categories/${post.category_id}`} className="font-medium hover:opacity-80" style={{ color: post.category_color || 'var(--primary)' }}>
              {post.category_name}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-[var(--text)]">{post.title}</span>
      </nav>

      {/* Pending moderation banner */}
      {post.status === 'pending' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">此帖子正在等待审核</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {post.current_user_role === 'admin' || post.current_user_role === 'moderator'
                ? '您可以审核此帖子。'
                : '审核通过后将对其他用户可见。如有疑问请联系管理组。'}
            </p>
          </div>
        </div>
      )}

      {/* Post Content */}
      <PostContent
        post={post}
        postId={postId}
        currentUserRole={post.current_user_role as UserRole | null}
        isOwner={post.is_owner ?? false}
      />
      <AttachmentList attachments={attachments} />

      <PostReplySection
        postId={postId}
        postPath={postPath}
        replies={replies}
        pagination={pagination}
        canAcceptAnswer={(post.is_owner ?? false) || post.current_user_role === 'admin' || post.current_user_role === 'moderator'}
        bestReplyId={post.best_reply_id ?? null}
        postOwnerId={post.user_id}
        initialLocked={post.is_locked ?? false}
      />
    </div>
  );
}
