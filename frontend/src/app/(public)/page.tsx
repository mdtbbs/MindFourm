import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Radio, Bell, Boxes } from "lucide-react";
import LatestPostsList from "@/components/forum/latest-posts-list";
import ResourceRow from "@/components/forum/resource-row";
import ErrorState from "@/components/ui/error-state";
import { createEmptyPaginatedResult } from "@/lib/api/response";
import { fetchApiData, fetchApiPaginated } from "@/lib/api/server-fetch";
import { fetchPublicSettings } from "@/lib/settings/server";
import { resolveBrand } from "@/lib/theme/brand";
import { generatePageMetadata } from "@/lib/metadata";
import type { PostListResponse, Resource } from "@/types";

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
  let resources: Resource[];
  try {
    [postsResult, resources] = await Promise.all([
      fetchPosts(),
      fetchApiData<Resource[]>("/api/resources/featured", {
        init: { next: { revalidate: 300 } },
        fallback: [],
        throwOnError: false,
      }),
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

  const discoverItems = [
    {
      href: "/lanlink",
      icon: Radio,
      title: "联机房间",
      description: "查看公开的玩家联机房间",
    },
    {
      href: "/resources",
      icon: Boxes,
      title: "资源中心",
      description: "浏览 Mod、地图、蓝图和工具",
    },
    {
      href: "/notices",
      icon: Bell,
      title: "社区公告",
      description: "查看社区动态和活动",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-7 border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          {brand.siteName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
          Mindustry 中文玩家社区
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          讨论 · Mod · 地图 · 蓝图 · 工具 · 联机
        </p>
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

        {resources.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                推荐资源
              </h2>
              <Link
                href="/resources"
                className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
              >
                浏览资源 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
              {resources.slice(0, 3).map((resource) => (
                <ResourceRow key={resource.id} resource={resource} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
            发现
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {discoverItems.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={title}
                href={href}
                className="group border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)]"
              >
                <Icon className="h-5 w-5 text-[var(--primary)]" />
                <h3 className="mt-3 font-medium text-[var(--text)]">{title}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
