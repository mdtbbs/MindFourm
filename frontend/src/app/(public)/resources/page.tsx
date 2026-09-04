import Link from "next/link";
import { Metadata } from "next";
import { FileText, AlertCircle } from "lucide-react";
import ErrorState from "@/components/ui/error-state";
import ResourceFilters from "@/components/forum/resource-list-filters-client";
import ResourceLoadMore from "@/components/forum/resource-load-more";
import { fetchApiData } from "@/lib/api/server-fetch";
import { fetchPublicSettings } from "@/lib/settings/server";
import { resolveBrand } from "@/lib/theme/brand";
import { generatePageMetadata } from "@/lib/metadata";
import { Resource, ResourceCategory } from "@/types";

export const revalidate = 60;

const RESOURCES_DESCRIPTION = "浏览和下载社区贡献的资源、模组和工具";
type ResourceFilterOptions = {
  supported_versions: string[];
  compatibility: string[];
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  const brandInfo = resolveBrand(settings);
  const params = await searchParams;
  const hasFilter = Object.values(params).some((value) => Boolean(value));

  const metadata = generatePageMetadata({
    title: "Mindustry 资源中心 - Mod、地图、蓝图、存档与版本下载",
    description: "MDTBBS Mindustry 资源中心，浏览 Mod、地图、蓝图、存档、游戏版本与实用工具。",
    path: "/resources",
    brandInfo,
    openGraphImage: settings.seo_og_image,
  });

  // Filter, sort, tag, cursor and search combinations are useful to visitors but
  // produce an unbounded duplicate-content surface. The unfiltered hub remains the
  // canonical crawl target; individual resources keep their own canonical pages.
  return hasFilter ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}

async function fetchData(params: {
  category_id?: string;
  search?: string;
  sort?: string;
  tag?: string;
  supported_version?: string;
  compatibility?: string;
  resource_kind?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("limit", "30");
  if (params.category_id) qs.set("category_id", params.category_id);
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  if (params.tag) qs.set("tag", params.tag);
  if (params.supported_version)
    qs.set("supported_version", params.supported_version);
  if (params.compatibility) qs.set("compatibility", params.compatibility);
  if (params.resource_kind) qs.set("resource_kind", params.resource_kind);

  const [resourcesResult, resourceCategories, filterOptions] =
    await Promise.all([
      fetchApiData<{
        data: Resource[];
        next_cursor: string | null;
        has_more: boolean;
      }>(`/api/resources?${qs.toString()}`, {
        init: { next: { revalidate: 60 } },
        fallback: { data: [], next_cursor: null, has_more: false },
        throwOnError: true,
      }),
      fetchApiData<ResourceCategory[]>("/api/resources/categories", {
        init: { next: { tags: ["resource-categories"], revalidate: 300 } },
        fallback: [],
        throwOnError: true,
      }),
      fetchApiData<ResourceFilterOptions>("/api/resources/filter-options", {
        init: { next: { revalidate: 300 } },
        fallback: { supported_versions: [], compatibility: [] },
        throwOnError: false,
      }),
    ]);

  return {
    resources: resourcesResult.data,
    nextCursor: resourcesResult.next_cursor,
    hasMore: resourcesResult.has_more,
    resourceCategories,
    filterOptions,
  };
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{
    category_id?: string;
    search?: string;
    sort?: string;
    tag?: string;
    supported_version?: string;
    compatibility?: string;
    resource_kind?: string;
  }>;
}) {
  const params = await searchParams;
  const settings = await fetchPublicSettings();

  const resourcesEnabled = settings.feature_resources_enabled !== "false";

  if (!resourcesEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="panel-surface inline-block px-8 py-10">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
          <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
            资源中心已关闭
          </h2>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            管理员已关闭此功能，如需开启请联系管理员。
          </p>
        </div>
      </div>
    );
  }

  let data: Awaited<ReturnType<typeof fetchData>>;
  try {
    data = await fetchData(params);
  } catch {
    return (
      <ErrorState
        title="资源加载失败"
        description="暂时无法获取资源列表，请稍后重试。"
        action={{ label: "重新加载", href: "/resources" }}
      />
    );
  }

  const { resources, nextCursor, hasMore, resourceCategories, filterOptions } =
    data;

  return (
    <div className="min-w-0 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">资源中心</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            浏览社区资源，快速查看版本、简介和下载信息。
          </p>
        </div>
        <Link
          href="/resources/submit"
          className="inline-flex shrink-0 items-center rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          提交资源
        </Link>
      </div>

      {/* Main content */}
      <main className="min-w-0 space-y-4">
        {/* Filters */}
        <ResourceFilters
          categories={resourceCategories}
          initialCategory={params.category_id}
          initialSearch={params.search}
          initialSort={params.sort}
          initialTag={params.tag}
          initialSupportedVersion={params.supported_version}
          initialCompatibility={params.compatibility}
          initialResourceKind={params.resource_kind}
          supportedVersions={filterOptions.supported_versions}
          compatibilityOptions={filterOptions.compatibility}
        />

        {/* Resource list */}
        {resources.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
            <p className="mb-4 text-[var(--text-muted)]">暂无资源</p>
            <Link
              href="/resources/submit"
              className="inline-block rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
            >
              提交第一个资源
            </Link>
          </div>
        ) : (
          <div>
            <ResourceLoadMore
              key={JSON.stringify(params)}
              initialResources={resources}
              initialCursor={nextCursor}
              hasMore={hasMore}
              categoryId={
                params.category_id ? parseInt(params.category_id) : undefined
              }
              search={params.search}
              sort={params.sort}
              tag={params.tag}
              supportedVersion={params.supported_version}
              compatibility={params.compatibility}
              resourceKind={params.resource_kind}
            />
          </div>
        )}
      </main>
    </div>
  );
}
