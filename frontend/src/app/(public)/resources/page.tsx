import Link from 'next/link';
import { Metadata } from 'next';
import { FileText, AlertCircle } from 'lucide-react';
import ErrorState from '@/components/ui/error-state';
import ResourceFilters from '@/components/forum/resource-list-filters-client';
import ResourceLoadMore from '@/components/forum/resource-load-more';
import ResourceCategoryTree from '@/components/forum/resource-category-tree';
import ResourceCarousel from '@/components/forum/resource-carousel';
import ResourceSidebar from '@/components/forum/resource-sidebar';
import ResourceListItem from '@/components/forum/resource-list-item';
import { fetchApiData } from '@/lib/api/server-fetch';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { Category, Resource, ResourceCategory, Tag } from '@/types';
import '@/styles/resources-responsive.css';

export const revalidate = 60;

const RESOURCES_DESCRIPTION = '浏览和下载社区贡献的资源、模组和工具';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  const brandInfo = resolveBrand(settings);

  return generatePageMetadata({
    title: '资源中心',
    description: RESOURCES_DESCRIPTION,
    path: '/resources',
    brandInfo,
  });
}

async function fetchData(params: { category_id?: string; search?: string; sort?: string }) {
  const qs = new URLSearchParams();
  qs.set('limit', '30');
  if (params.category_id) qs.set('category_id', params.category_id);
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);

  const [resourcesResult, resourceCategories, forumCategories, tags, hotResources, featuredResources] = await Promise.all([
    fetchApiData<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/resources?${qs.toString()}`,
      {
        init: { next: { revalidate: 60 } },
        fallback: { data: [], next_cursor: null, has_more: false },
        throwOnError: true,
      },
    ),
    fetchApiData<ResourceCategory[]>('/api/resources/categories', {
      init: { next: { revalidate: 300 } },
      fallback: [],
      throwOnError: true,
    }),
    fetchApiData<Category[]>('/api/categories', {
      init: { next: { tags: ['categories'] } },
      fallback: [],
      throwOnError: true,
    }),
    fetchApiData<Tag[]>('/api/tags', {
      init: { next: { tags: ['tags'] } },
      fallback: [],
      throwOnError: true,
    }),
    fetchApiData<Resource[]>('/api/resources/hot', {
      init: { next: { revalidate: 300 } },
      fallback: [],
      throwOnError: true,
    }),
    // Featured resources - using hot resources as fallback if API doesn't exist yet
    fetchApiData<Resource[]>('/api/resources/featured', {
      init: { next: { revalidate: 300 } },
      fallback: [],
      throwOnError: false, // Don't throw if endpoint doesn't exist yet
    }),
  ]);

  return {
    resources: resourcesResult.data,
    nextCursor: resourcesResult.next_cursor,
    hasMore: resourcesResult.has_more,
    resourceCategories,
    forumCategories,
    tags,
    hotResources,
    featuredResources: featuredResources.length > 0 ? featuredResources : hotResources.slice(0, 4),
  };
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ category_id?: string; search?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const settings = await fetchPublicSettings();

  const resourcesEnabled = settings.feature_resources_enabled !== 'false';

  if (!resourcesEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="panel-surface inline-block px-8 py-10">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
          <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">资源中心已关闭</h2>
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
    return <ErrorState title="资源加载失败" description="暂时无法获取资源列表，请稍后重试。" action={{ label: '重新加载', href: '/resources' }} />;
  }

  const { resources, nextCursor, hasMore, resourceCategories, forumCategories, tags, hotResources, featuredResources } = data;

  return (
    <div className="min-w-0 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">资源中心</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">浏览社区资源，快速查看版本、简介和下载信息。</p>
        </div>
        <Link
          href="/resources/submit"
          className="inline-flex shrink-0 items-center rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          提交资源
        </Link>
      </div>

      {/* Three-column responsive layout
       * - Mobile (<768px): single column, categories shown below main content
       * - Tablet/Small desktop (768–1023px): single column, sidebars hidden
       * - Desktop (≥1024px): three columns [240px | 1fr | 260px]
       * Layout wrapper (layout.tsx) applies min-w-0 + overflow-x-hidden */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr_260px]">
        {/* Left sidebar - Category tree (desktop only) */}
        <aside className="hidden lg:block min-w-0">
          <div className="sticky top-4">
            <ResourceCategoryTree
              categories={resourceCategories}
              currentCategoryId={params.category_id}
            />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 space-y-4">
          {/* Featured carousel */}
          {featuredResources.length > 0 && (
            <ResourceCarousel resources={featuredResources} />
          )}

          {/* Filters */}
          <ResourceFilters
            categories={resourceCategories}
            initialCategory={params.category_id}
            initialSearch={params.search}
            initialSort={params.sort}
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
            <div className="space-y-3">
              {resources.map((resource) => (
                <ResourceListItem key={resource.id} resource={resource} />
              ))}
              {/* Load more */}
              {hasMore && (
                <ResourceLoadMore
                  initialResources={[]}
                  initialCursor={nextCursor}
                  hasMore={hasMore}
                  categoryId={params.category_id ? parseInt(params.category_id) : undefined}
                  search={params.search}
                  sort={params.sort}
                />
              )}
            </div>
          )}
        </main>

        {/* Right sidebar (desktop only) */}
        <aside className="hidden lg:block min-w-0">
          <div className="sticky top-4">
            <ResourceSidebar
              hotResources={hotResources}
              totalResources={resources.length}
            />
          </div>
        </aside>
      </div>

      {/* Mobile/Tablet: Show categories below main content (hidden on desktop) */}
      <div className="mt-6 space-y-4 lg:hidden">
        <ResourceCategoryTree
          categories={resourceCategories}
          currentCategoryId={params.category_id}
        />
      </div>
    </div>
  );
}
