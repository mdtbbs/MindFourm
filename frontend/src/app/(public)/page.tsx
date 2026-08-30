import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import ThreadList from "@/components/forum/thread-list";
import ErrorState from "@/components/ui/error-state";
import { createEmptyPaginatedResult } from "@/lib/api/response";
import { fetchApiData, fetchApiPaginated } from "@/lib/api/server-fetch";
import { fetchPublicSettings } from "@/lib/settings/server";
import { resolveBrand } from "@/lib/theme/brand";
import { generatePageMetadata } from "@/lib/metadata";
import type { Category, PostListResponse, ResourceCategory } from "@/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

async function fetchPosts(categoryId?: number, excludedCategoryIds: number[] = []): Promise<PostListResponse> {
  const params = new URLSearchParams({ page: '1', limit: '6', sort: 'last_activity_at' });
  if (categoryId) params.set('category_id', String(categoryId));
  if (excludedCategoryIds.length) params.set('exclude_category_ids', excludedCategoryIds.join(','));
  return fetchApiPaginated<PostListResponse["data"][number]>(
    `/api/posts?${params.toString()}`,
    {
      init: { cache: "no-store" },
      fallback: createEmptyPaginatedResult<PostListResponse["data"][number]>(6),
      forwardCookies: true,
      throwOnError: true,
    },
  );
}

async function fetchPublicNavigation(): Promise<{ categories: Category[]; resourceCategories: ResourceCategory[] }> {
  const [categories, resourceCategories] = await Promise.all([
    fetchApiData<Category[]>('/api/categories', { init: { next: { revalidate: 300 } }, fallback: [] }),
    fetchApiData<ResourceCategory[]>('/api/resources/categories', { init: { next: { revalidate: 300 } }, fallback: [] }),
  ]);
  return { categories, resourceCategories };
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  return generatePageMetadata({
    title: "像素工厂中文论坛（Mindustry）- Mod、地图、蓝图与联机社区",
    description: "MDTBBS 是面向 Mindustry（像素工厂）玩家的中文社区，提供 Mod、地图、蓝图、存档、游戏版本、联机交流、教程与资源分享。",
    brandInfo: resolveBrand(settings),
  });
}

export default async function HomePage() {
  const settings = await fetchPublicSettings();
  const brand = resolveBrand(settings);
  let postsResult: PostListResponse;
  let navigation: Awaited<ReturnType<typeof fetchPublicNavigation>>;
  let featuredCategorySections: Array<{ category: Category; posts: PostListResponse }> = [];

  try {
    navigation = await fetchPublicNavigation();
    const featuredCategoryIds = parseFeaturedCategoryIds(settings.home_featured_category_ids);
    const featuredCategories = featuredCategoryIds
      .map((id) => navigation.categories.find((category) => category.id === id))
      .filter((category): category is Category => Boolean(category));
    const [latestPosts, ...featuredPosts] = await Promise.all([
      fetchPosts(undefined, featuredCategories.map((category) => category.id)),
      ...featuredCategories.map((category) => fetchPosts(category.id)),
    ]);
    postsResult = latestPosts;
    featuredCategorySections = featuredCategories.map((category, index) => ({
      category,
      posts: featuredPosts[index],
    }));
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
      <section className="mb-5 border-b border-[var(--border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          {brand.siteName}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">像素工厂中文论坛</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Mindustry 玩家讨论、资源分享、联机与创作社区。</p>
      </section>

      <div>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">最新讨论</h2>
            <Link
              href="/threads"
              className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
            >
              查看全部 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {postsResult.data.length > 0 ? (
            <ThreadList posts={postsResult.data} />
          ) : (
            <div className="border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
              暂时没有讨论
            </div>
          )}
        </section>

        {featuredCategorySections.map(({ category, posts }) => (
          <section key={category.id} className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">{category.name}</h2>
              <Link href={`/categories/${category.id}`} className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline">
                查看板块 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {posts.data.length > 0 ? (
              <ThreadList posts={posts.data} />
            ) : (
              <div className="border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
                该板块暂时没有讨论
              </div>
            )}
          </section>
        ))}

        {(navigation.categories.length > 0 || navigation.resourceCategories.length > 0) && (
          <nav aria-label="论坛与资源分类" className="mt-8 grid gap-6 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
            {navigation.categories.length > 0 && <section>
              <h2 className="text-base font-semibold text-[var(--text)]">讨论板块</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {navigation.categories.map((category) => <Link key={category.id} href={`/categories/${category.id}`} className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">{category.name}</Link>)}
              </div>
            </section>}
            {navigation.resourceCategories.length > 0 && <section>
              <h2 className="text-base font-semibold text-[var(--text)]">资源分类</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {navigation.resourceCategories.map((category) => <Link key={category.id} href={`/resources?category_id=${category.id}`} className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">{category.name}</Link>)}
              </div>
            </section>}
          </nav>
        )}

      </div>
    </div>
  );
}
