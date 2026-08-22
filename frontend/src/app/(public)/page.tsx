import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import LatestPostsList from "@/components/forum/latest-posts-list";
import ErrorState from "@/components/ui/error-state";
import { createEmptyPaginatedResult } from "@/lib/api/response";
import { fetchApiPaginated } from "@/lib/api/server-fetch";
import { fetchPublicSettings } from "@/lib/settings/server";
import { resolveBrand } from "@/lib/theme/brand";
import { generatePageMetadata } from "@/lib/metadata";
import type { PostListResponse } from "@/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function fetchPosts(): Promise<PostListResponse> {
  return fetchApiPaginated<PostListResponse["data"][number]>(
    "/api/posts?page=1&limit=6",
    {
      init: { cache: "no-store" },
      fallback: createEmptyPaginatedResult<PostListResponse["data"][number]>(6),
      forwardCookies: true,
      throwOnError: true,
    },
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  return generatePageMetadata({
    title: "首页",
    brandInfo: resolveBrand(settings),
  });
}

export default async function HomePage() {
  const settings = await fetchPublicSettings();
  const brand = resolveBrand(settings);
  let postsResult: PostListResponse;

  try {
    [postsResult] = await Promise.all([
      fetchPosts(),
    ]);
  } catch {
    return (
      <ErrorState
        title="首页加载失败"
        description="暂时无法获取社区内容，请稍后重试。"
        action={{ label: "重新加载", href: "/" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-7 border-b border-[var(--border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          {brand.siteName}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">最新讨论</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">讨论、创作、分享属于玩家自己的内容。</p>
      </section>

      <div className="space-y-8">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              最新讨论
            </h2>
            <Link
              href="/threads"
              className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
            >
              查看全部 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {postsResult.data.length > 0 ? (
            <LatestPostsList posts={postsResult.data} />
          ) : (
            <div className="border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
              暂时没有讨论
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
