import type { Metadata } from "next";
import ThreadList from "@/components/forum/thread-list";
import ErrorState from "@/components/ui/error-state";
import { createEmptyPaginatedResult } from "@/lib/api/response";
import { fetchApiPaginated } from "@/lib/api/server-fetch";
import type { PostListResponse } from "@/types";
import Pagination from "@/components/ui/pagination";
import { fetchPublicSettings } from "@/lib/settings/server";
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'threadsPage.title'), description: translate(locale, 'threadsPage.description') };
}

function parseFeaturedCategoryIds(value: string | undefined): number[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is number => Number.isInteger(id) && id > 0))]
      : [];
  } catch {
    return [];
  }
}

export default async function ThreadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const settings = await fetchPublicSettings();
  const featuredCategoryIds = parseFeaturedCategoryIds(settings.home_featured_category_ids);
  const excludeCategoryIds = featuredCategoryIds.length
    ? `&exclude_category_ids=${featuredCategoryIds.join(',')}`
    : '';
  let threads: PostListResponse;
  try {
    threads = await fetchApiPaginated<PostListResponse["data"][number]>(
      `/api/posts?page=${page}&limit=30&sort=last_activity_at&source=USER${excludeCategoryIds}`,
      {
        init: { cache: "no-store" },
        fallback:
          createEmptyPaginatedResult<PostListResponse["data"][number]>(30),
        throwOnError: true,
      },
    );
  } catch {
    return (
      <ErrorState
        title={t('threadsPage.loadFailed')}
        description={t('threadsPage.tryAgain')}
        action={{ label: t('threadsPage.reload'), href: "/threads" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 border-b border-[var(--border)] pb-4">
        <h1 className="text-3xl font-semibold text-[var(--text)]">{t('threadsPage.title')}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('threadsPage.sortDescription')}
        </p>
      </div>
      {threads.data.length > 0 ? (
        <>
          <ThreadList posts={threads.data} />
          <Pagination
            currentPage={threads.pagination.page}
            totalPages={threads.pagination.totalPages}
            basePath="/threads"
            queryParams={{ sort: "last_activity_at" }}
            className="mt-6"
          />
        </>
      ) : (
        <div className="border border-[var(--border)] p-8 text-center text-[var(--text-muted)]">{t('threadsPage.empty')}</div>
      )}
    </div>
  );
}
