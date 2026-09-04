import type { Metadata } from "next";
import ThreadList from "@/components/forum/thread-list";
import ErrorState from "@/components/ui/error-state";
import { createEmptyPaginatedResult } from "@/lib/api/response";
import { fetchApiPaginated } from "@/lib/api/server-fetch";
import type { PostListResponse } from "@/types";
import Pagination from "@/components/ui/pagination";
import { fetchPublicSettings } from "@/lib/settings/server";

export const metadata: Metadata = {
  title: "讨论",
  description: "Mindustry 社区讨论区",
};

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
      `/api/posts?page=${page}&limit=30&sort=last_activity_at${excludeCategoryIds}`,
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
        title="讨论列表加载失败"
        description="请稍后再试。"
        action={{ label: "重新加载", href: "/threads" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 border-b border-[var(--border)] pb-4">
        <h1 className="text-3xl font-semibold text-[var(--text)]">讨论</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          按最后活跃时间浏览社区讨论。
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
        <div className="border border-[var(--border)] p-8 text-center text-[var(--text-muted)]">
          暂时没有讨论
        </div>
      )}
    </div>
  );
}
