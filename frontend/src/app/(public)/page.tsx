import Sidebar from '@/components/forum/sidebar';
import Pagination from '@/components/ui/pagination';
import ServerSection from '@/components/forum/server-section';
import { Category, Tag, PostListResponse } from '@/types';
import Link from 'next/link';
import LatestPostsList, { LatestPostsSettings } from '@/components/forum/latest-posts-list';

export const revalidate = 30;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/api/categories`, { next: { tags: ['categories'] } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchTags(): Promise<Tag[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tags`, { next: { tags: ['tags'] } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const json = await res.json();
    return json.success ? json.data : {};
  } catch {
    return {};
  }
}

async function fetchPosts(page: number, limit: number, categoryId?: number): Promise<PostListResponse> {
  try {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('limit', String(limit));
    if (categoryId) qs.set('category_id', String(categoryId));
    const res = await fetch(`${API_BASE}/api/posts?${qs}`, { next: { tags: ['posts'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    const responseData = json.data || {};
    return {
      data: Array.isArray(responseData.data) ? responseData.data : Array.isArray(json.data) ? json.data : [],
      pagination: {
        page: responseData.page || 1,
        limit: responseData.limit || limit,
        total: responseData.total || 0,
        totalPages: responseData.totalPages || 1,
      },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
  }
}

function parseBooleanSetting(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

function parseLatestPostsSettings(settings: Record<string, string>): LatestPostsSettings {
  const density = settings.latest_posts_density === 'comfortable' ? 'comfortable' : 'compact';
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(settings.latest_posts_accent_color || '')
    ? settings.latest_posts_accent_color
    : '#2f80ed';

  return {
    title: settings.latest_posts_title || '最新帖子',
    description: settings.latest_posts_description || '浅蓝、直角、低噪音的论坛界面，重点放在帖子层级和浏览效率。',
    density,
    accentColor,
    showExcerpt: parseBooleanSetting(settings.latest_posts_show_excerpt, true),
    showTags: parseBooleanSetting(settings.latest_posts_show_tags, true),
    showStats: parseBooleanSetting(settings.latest_posts_show_stats, true),
    showIndex: parseBooleanSetting(settings.latest_posts_show_index, true),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string; category_id?: string };
}) {
  const page = parseInt(searchParams.page || '1');
  const categoryId = searchParams.category_id ? parseInt(searchParams.category_id) : undefined;

  const settings = await fetchSettings();
  const postsPerPage = parseInt(settings?.posts_per_page || '20');
  const latestPostsSettings = parseLatestPostsSettings(settings);

  const [categories, tags, postsResult] = await Promise.all([
    fetchCategories(),
    fetchTags(),
    fetchPosts(page, postsPerPage, categoryId),
  ]);

  const activeCategoryName = categoryId
    ? categories.find((c) => c.id === categoryId)?.name || '分类'
    : '最新帖子';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 overflow-hidden panel-surface">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="border-b border-[var(--border)] p-6 lg:border-b-0 lg:border-r">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              MindForum
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {activeCategoryName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              浅蓝、直角、低噪音的论坛界面，重点放在帖子层级和浏览效率。
            </p>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-3 lg:grid-cols-1">
            <div className="border border-[var(--border)] bg-[var(--muted)] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">帖子</div>
              <div className="mt-2 text-lg font-semibold text-[var(--foreground)]">{postsResult.pagination.total}</div>
            </div>
            <div className="border border-[var(--border)] bg-[var(--muted)] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">分类</div>
              <div className="mt-2 text-lg font-semibold text-[var(--foreground)]">{categories.length}</div>
            </div>
            <div className="border border-[var(--border)] bg-[var(--muted)] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">标签</div>
              <div className="mt-2 text-lg font-semibold text-[var(--foreground)]">{tags.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        <div className="hidden w-60 flex-shrink-0 lg:block">
          <Sidebar categories={categories} tags={tags} selectedCategory={categoryId} />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <ServerSection />

          {postsResult.data.length === 0 ? (
            <div className="panel-surface px-6 py-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">暂时没有帖子</p>
              <Link
                href="/posts/new"
                className="mt-4 inline-flex items-center border border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgba(47,128,237,0.9)]"
              >
                发布第一篇帖子
              </Link>
            </div>
          ) : (
            <LatestPostsList posts={postsResult.data} settings={latestPostsSettings} />
          )}

          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath="/"
            queryParams={categoryId ? { category_id: String(categoryId) } : {}}
          />
        </div>
      </div>
    </div>
  );
}
