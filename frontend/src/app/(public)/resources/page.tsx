import Link from 'next/link';
import { Metadata } from 'next';
import { FileText, AlertCircle } from 'lucide-react';
import ForumContentLayout from '@/components/forum/forum-content-layout';
import ResourceFilters from '@/components/forum/resource-list-filters-client';
import ResourceLoadMore from '@/components/forum/resource-load-more';
import HotResources from '@/components/forum/hot-resources';
import { fetchApiData } from '@/lib/api/server-fetch';
import { fetchPublicSettings } from '@/lib/settings/server';
import { Category, Resource, ResourceCategory, Tag } from '@/types';

export const revalidate = 60;

const RESOURCES_DESCRIPTION = '浏览和下载社区贡献的资源、模组和工具';

export async function generateMetadata(): Promise<Metadata> {
  // Bare title — the root layout's `title.template` appends the site suffix.
  return {
    title: '资源中心',
    description: RESOURCES_DESCRIPTION,
    // Filter and sort params produce the same listing in a different order, so they
    // all fold onto one canonical URL.
    alternates: { canonical: '/resources' },
    openGraph: {
      title: '资源中心',
      description: RESOURCES_DESCRIPTION,
      type: 'website',
      url: '/resources',
    },
  };
}

async function fetchData(params: { category_id?: string; search?: string; sort?: string }) {
  const qs = new URLSearchParams();
  qs.set('limit', '30');
  if (params.category_id) qs.set('category_id', params.category_id);
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);

  const [resourcesResult, resourceCategories, forumCategories, tags, hotResources] = await Promise.all([
    fetchApiData<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/resources?${qs.toString()}`,
      {
        init: { next: { revalidate: 60 } },
        fallback: { data: [], next_cursor: null, has_more: false },
      },
    ),
    fetchApiData<ResourceCategory[]>('/api/resources/categories', {
      init: { next: { revalidate: 300 } },
      fallback: [],
    }),
    fetchApiData<Category[]>('/api/categories', {
      init: { next: { tags: ['categories'] } },
      fallback: [],
    }),
    fetchApiData<Tag[]>('/api/tags', {
      init: { next: { tags: ['tags'] } },
      fallback: [],
    }),
    fetchApiData<Resource[]>('/api/resources/hot', {
      init: { next: { revalidate: 300 } },
      fallback: [],
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

  const { resources, nextCursor, hasMore, resourceCategories, forumCategories, tags, hotResources } = await fetchData(params);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ForumContentLayout
        categories={forumCategories}
        tags={tags}
        activeQuickLinkHref="/resources"
        highlightAllPosts={false}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">资源中心</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">按列表浏览社区资源，快速查看版本、简介和下载信息。</p>
            </div>
            <Link
              href="/resources/submit"
              className="inline-flex items-center rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
            >
              提交资源
            </Link>
          </div>

          {hotResources.length > 0 && <HotResources resources={hotResources} />}

          <ResourceFilters
            categories={resourceCategories}
            initialCategory={params.category_id}
            initialSearch={params.search}
            initialSort={params.sort}
          />

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
            <ResourceLoadMore
              initialResources={resources}
              initialCursor={nextCursor}
              hasMore={hasMore}
              categoryId={params.category_id ? parseInt(params.category_id) : undefined}
              search={params.search}
              sort={params.sort}
            />
          )}
        </div>
      </ForumContentLayout>
    </div>
  );
}
