import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, AlertCircle } from "lucide-react";
import ErrorState from "@/components/ui/error-state";
import ResourceFilters from "@/components/forum/resource-list-filters-client";
import ResourceLoadMore from "@/components/forum/resource-load-more";
import ResourceCategoryNavigation from "@/components/forum/resources/resource-category-navigation";
import { fetchApiData } from "@/lib/api/server-fetch";
import { fetchPublicSettings } from "@/lib/settings/server";
import { resolveBrand } from "@/lib/theme/brand";
import { generatePageMetadata } from "@/lib/metadata";
import { Resource, ResourceCategory } from "@/types";
import { getRequestLocale } from "@/i18n/server";
import { translate } from "@/i18n";

export const revalidate = 60;

type ResourceFilterOptions = {
  supported_versions: string[];
  compatibility: string[];
  planets: string[];
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  const brandInfo = resolveBrand(settings);
  const locale = await getRequestLocale();
  const params = await searchParams;
  const hasFilter = Object.values(params).some((value) => Boolean(value));

  const metadata = generatePageMetadata({
    title: translate(locale, 'resourceList.metaTitle'),
    description: translate(locale, 'resourceList.metaDescription'),
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
  planet?: string;
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
  if (params.planet) qs.set("planet", params.planet);

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
        fallback: { supported_versions: [], compatibility: [], planets: [] },
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
    planet?: string;
  }>;
}) {
  const params = await searchParams;
  const [settings, locale] = await Promise.all([fetchPublicSettings(), getRequestLocale()]);
  const t = (key: string) => translate(locale, `resourceList.${key}`);

  const resourcesEnabled = settings.feature_resources_enabled !== "false";

  if (!resourcesEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="panel-surface inline-block px-8 py-10">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
          <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
            {t('disabledTitle')}
          </h2>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            {t('disabledDescription')}
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
        title={t('loadFailed')}
        description={t('loadDescription')}
        action={{ label: t('reload'), href: "/resources" }}
      />
    );
  }

  const { resources, nextCursor, hasMore, resourceCategories, filterOptions } =
    data;

  // Resource categories are now a single, active taxonomy. Old bookmarks and
  // legacy UI links may still carry a deleted category_id; treating that as a
  // valid filter produced a convincing but false “暂无资源” page. Canonicalize
  // the URL instead of hiding the problem in the empty-state copy.
  if (params.category_id && !resourceCategories.some((category) => String(category.id) === params.category_id)) {
    const canonical = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'category_id' && value) canonical.set(key, value);
    });
    redirect(canonical.size ? `/resources?${canonical.toString()}` : '/resources');
  }

  return (
    <div className="content-width-resources mx-auto min-w-0 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">{t('title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {t('description')}
          </p>
        </div>
      </div>

      <ResourceCategoryNavigation
        ariaLabel={t('resourceType')}
        selectedKind={params.resource_kind}
        labels={{
          mod: t('resourceKind.mod'),
          schematic: t('resourceKind.schematic'),
          map: t('resourceKind.map'),
          pack: t('resourceKind.pack'),
        }}
      />

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
          planets={filterOptions.planets}
        />

        {/* Resource list */}
        {resources.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
            <p className="mb-4 text-[var(--text-muted)]">{t('empty')}</p>
            <Link
              href="/resources/submit"
              className="inline-block rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
            >
              {t('submitFirst')}
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
              planet={params.planet}
            />
          </div>
        )}
      </main>
    </div>
  );
}
