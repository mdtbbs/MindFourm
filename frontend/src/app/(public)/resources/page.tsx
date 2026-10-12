import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, AlertCircle } from "lucide-react";
import ErrorState from "@/components/ui/error-state";
import ResourceFilters from "@/components/forum/resource-list-filters-client";
import ResourceLoadMore from "@/components/forum/resource-load-more";
import ResourceCategoryNavigation from "@/components/forum/resources/resource-category-navigation";
import ResourceDiscoveryShelves from "@/components/forum/resources/resource-discovery-shelves";
import { fetchApiData } from "@/lib/api/server-fetch";
import { fetchPublicSettings } from "@/lib/settings/server";
import { resolveBrand } from "@/lib/theme/brand";
import { generatePageMetadata } from "@/lib/metadata";
import { Resource, ResourceCategory } from "@/types";
import { getRequestLocale } from "@/i18n/server";
import { translate } from "@/i18n";
import { MAP_FILTER_KEYS, normalizeResourceFilterParams, parseMapFilters } from "@/lib/resources/query";

export const revalidate = 60;

type ResourceFilterOptions = {
  supported_versions: string[];
  compatibility: string[];
  planets: string[];
};

type ResourcesSearchParams = Record<string, string | string[] | undefined>;

/** Flat, decoded query used for the canonical URL and for every downstream reader. */
function toSearchParams(raw: ResourcesSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first !== "") params.set(key, first);
  }
  return params;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ResourcesSearchParams>;
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

  return hasFilter ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}

async function fetchData(params: URLSearchParams) {
  const qs = new URLSearchParams(params);
  qs.set("limit", "30");

  const [resourcesResult, resourceCategories, filterOptions] = await Promise.all([
    fetchApiData<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(`/api/resources?${qs.toString()}`, {
      init: { next: { revalidate: 60 } }, fallback: { data: [], next_cursor: null, has_more: false }, throwOnError: true,
    }),
    fetchApiData<ResourceCategory[]>("/api/resources/categories", {
      init: { next: { tags: ["resource-categories"], revalidate: 300 } }, fallback: [], throwOnError: true,
    }),
    fetchApiData<ResourceFilterOptions>("/api/resources/filter-options", {
      init: { next: { revalidate: 300 } }, fallback: { supported_versions: [], compatibility: [], planets: [] }, throwOnError: false,
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

function canonicalResourcesHref(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `/resources?${query}` : '/resources';
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<ResourcesSearchParams>;
}) {
  const requested = toSearchParams(await searchParams);
  // Map/blueprint conditions are meaningful only while the list is filtered to
  // map or schematic: a kind switch, a hand-edited URL or an out-of-range
  // dimension is corrected here once, before anything reads the conditions.
  const params = normalizeResourceFilterParams(requested);
  if (params.toString() !== requested.toString()) redirect(canonicalResourcesHref(params));

  const [settings, locale] = await Promise.all([fetchPublicSettings(), getRequestLocale()]);
  const t = (key: string) => translate(locale, `resourceList.${key}`);
  const resourcesEnabled = settings.feature_resources_enabled !== "false";

  if (!resourcesEnabled) {
    return <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <div className="panel-surface inline-block px-8 py-10">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
        <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">{t('disabledTitle')}</h2>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('disabledDescription')}</p>
      </div>
    </div>;
  }

  let data: Awaited<ReturnType<typeof fetchData>>;
  try {
    data = await fetchData(params);
  } catch {
    return <ErrorState title={t('loadFailed')} description={t('loadDescription')} action={{ label: t('reload'), href: "/resources" }} />;
  }

  const { resources, nextCursor, hasMore, resourceCategories, filterOptions } = data;

  const categoryId = params.get('category_id') || undefined;
  if (categoryId && !resourceCategories.some((category) => String(category.id) === categoryId)) {
    params.delete('category_id');
    redirect(canonicalResourcesHref(params));
  }

  const resourceKind = params.get('resource_kind') || undefined;
  // One rule, one reader: a kind only carries the conditions its own renderer
  // metadata can answer (see `lib/resources/query.ts`), so a condition with no
  // source for this kind is removed instead of being queried.
  const mapFilters = parseMapFilters(resourceKind, {
    planet: params.get('planet'),
    block: params.get('block'),
    width: params.get('width'),
    height: params.get('height'),
  });
  const { planet, block, width, height } = mapFilters;
  const supportedVersion = params.get('supported_version') || undefined;
  const compatibility = params.get('compatibility') || undefined;
  const tag = params.get('tag') || undefined;
  const search = params.get('search') || undefined;
  const sort = params.get('sort') || undefined;

  const discoveryMode = !search && !categoryId && !tag && !supportedVersion
    && !compatibility && !sort && MAP_FILTER_KEYS.every((key) => !params.get(key));
  const submitHrefByKind: Record<string, string> = {
    mod: '/resources/submit/mod',
    map: '/resources/submit/map',
    schematic: '/resources/submit/schematic',
  };
  const selectedKindSubmitHref = resourceKind ? submitHrefByKind[resourceKind] : undefined;
  const selectedKindSubmitLabel = resourceKind === 'mod'
    ? translate(locale, 'resourceSubmit.modSubmit')
    : resourceKind === 'map'
      ? translate(locale, 'resourceSubmit.mapSubmit')
      : resourceKind === 'schematic'
        ? translate(locale, 'resourceSubmit.schematicSubmit')
        : undefined;

  return <div className="content-width-resources mx-auto min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h1 className="text-2xl font-bold text-[var(--text)]">{t('title')}</h1><p className="mt-1 text-sm text-[var(--text-muted)]">{t('description')}</p></div>
      {selectedKindSubmitHref && selectedKindSubmitLabel ? <Link href={selectedKindSubmitHref} className="inline-flex min-h-11 shrink-0 items-center justify-center bg-[var(--primary-button)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">{selectedKindSubmitLabel}</Link> : null}
    </div>

    <ResourceCategoryNavigation
      ariaLabel={t('resourceType')}
      selectedKind={resourceKind}
      labels={{ mod: t('resourceKind.mod'), schematic: t('resourceKind.schematic'), map: t('resourceKind.map'), pack: t('resourceKind.pack') }}
    />

    <main className="min-w-0 space-y-7">
      {discoveryMode ? <ResourceDiscoveryShelves kind={resourceKind} /> : null}

      <section id="resource-browse" className="space-y-4 scroll-mt-4" aria-label="资源浏览">
        <ResourceFilters
          categories={resourceCategories}
          initialCategory={categoryId}
          initialSearch={search}
          initialSort={sort}
          initialTag={tag}
          initialSupportedVersion={supportedVersion}
          initialCompatibility={compatibility}
          initialResourceKind={resourceKind}
          initialPlanet={planet}
          initialBlock={block}
          initialWidth={width ? String(width) : undefined}
          initialHeight={height ? String(height) : undefined}
          supportedVersions={filterOptions.supported_versions}
          compatibilityOptions={filterOptions.compatibility}
          planets={filterOptions.planets}
        />

        {resources.length === 0 ? <div className="border border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
          <p className="mb-4 text-[var(--text-muted)]">{t('empty')}</p>
          <Link href={selectedKindSubmitHref || '/resources/submit'} className="inline-flex min-h-11 items-center bg-[var(--primary-button)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">{selectedKindSubmitLabel || t('submitFirst')}</Link>
        </div> : <ResourceLoadMore
          key={params.toString()}
          initialResources={resources}
          initialCursor={nextCursor}
          hasMore={hasMore}
          categoryId={categoryId ? parseInt(categoryId) : undefined}
          search={search}
          sort={sort}
          tag={tag}
          supportedVersion={supportedVersion}
          compatibility={compatibility}
          resourceKind={resourceKind}
          mapFilters={mapFilters}
        />}
      </section>
    </main>
  </div>;
}
