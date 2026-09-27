import { Metadata } from 'next';
import ThreadList from '@/components/forum/thread-list';
import CategoryHeader from '@/components/forum/category-header';
import Pagination from '@/components/ui/pagination';
import EmptyState from '@/components/ui/empty-state';
import { MessageCircle } from 'lucide-react';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiPaginated } from '@/lib/api/server-fetch';
import { getCategory } from '@/lib/api/v1/categories';
import { Category, PostListResponse } from '@/types';
import { notFound } from 'next/navigation';
import { getRequestLocale } from '@/i18n/server';
import { translate, type Locale } from '@/i18n';

export const revalidate = 300;

async function fetchPosts(page: number, categoryId: number): Promise<PostListResponse> {
  return fetchApiPaginated<PostListResponse['data'][number]>(`/api/posts?page=${page}&limit=20&category_id=${categoryId}`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(20),
    forwardCookies: true,
  });
}

async function fetchCategory(id: number): Promise<Category | null> {
  return getCategory(id, { init: { next: { tags: ['categories'], revalidate: 300 } } }).catch(() => null);
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const [{ id }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const locale = await getRequestLocale();
  const category = await fetchCategory(parseInt(id));
  if (!category) {
    // Not in the page body: `loading.tsx` flushes a 200 shell before the body runs, and
    // `notFound()` cannot change an already-sent status. generateMetadata runs first.
    notFound();
  }

  // Bare title — the root layout's `title.template` appends the site suffix. Hardcoding
  // it here produced "分类名 | MindForum | MindForum".
  const description = translate(locale, 'categoryPage.description', { category: category.name });
  const page = Number.parseInt(pageParam || '1', 10);
  const isPaginated = Number.isFinite(page) && page > 1;
  const canonical = isPaginated ? `/categories/${category.id}?page=${page}` : `/categories/${category.id}`;

  return {
    title: isPaginated ? translate(locale, 'categoryPage.pageTitle', { category: category.name, page }) : category.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: category.name,
      description,
      type: 'website',
      url: canonical,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const { id } = await params;
  const { page: pageStr } = await searchParams;
  const categoryId = parseInt(id);
  const page = parseInt(pageStr || '1');

  const [category, postsResult] = await Promise.all([
    fetchCategory(categoryId),
    fetchPosts(page, categoryId),
  ]);

  if (!category) return notFound();

  return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-4">
          <CategoryHeader
            category={category}
            locale={locale as Locale}
            descriptionFallback={t('categoryPage.categoryDescription')}
            postCountLabel={t('categoriesPage.postCount', { count: '{count}' })}
          />
          {postsResult.data.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-10 w-10" />}
              title={t('categoryPage.emptyTitle')}
              description={t('categoryPage.emptyDescription')}
              action={{ label: t('categoryPage.createPost'), href: '/posts/new' }}
            />
          ) : (
            <ThreadList posts={postsResult.data} showCategory={false} />
          )}
          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath={`/categories/${categoryId}`}
          />
      </div>
    </div>
  );
}
