import Link from 'next/link';
import type { Metadata } from 'next';
import ForumContentLayout from '@/components/forum/forum-content-layout';
import ServerSection from '@/components/forum/server-section';
import LatestPostsList, { LatestPostsSettings } from '@/components/forum/latest-posts-list';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import Pagination from '@/components/ui/pagination';
import ErrorState from '@/components/ui/error-state';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { Category, PostListResponse } from '@/types';
import { parseFooterFriendlyLinks, isExternalHref, isSafeFooterHref } from '@/lib/footer/footer-settings';

export const revalidate = 30;

interface ForumOverviewStats {
  total_posts: number;
  total_replies: number;
  total_users: number;
  total_resources: number;
}

const emptyOverview: ForumOverviewStats = {
  total_posts: 0,
  total_replies: 0,
  total_users: 0,
  total_resources: 0,
};

async function fetchCategories(): Promise<Category[]> {
  return fetchApiData<Category[]>('/api/categories', {
    init: { next: { tags: ['categories'] } },
    fallback: [],
    throwOnError: true,
  });
}

async function fetchForumOverview(): Promise<ForumOverviewStats> {
  const overview = await fetchApiData<ForumOverviewStats>('/api/stats/overview', {
    init: { next: { revalidate: 30 } },
    fallback: emptyOverview,
    throwOnError: true,
  });
  return { ...emptyOverview, ...overview };
}

async function fetchPosts(page: number, limit: number, categoryId?: number): Promise<PostListResponse> {
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  if (categoryId) qs.set('category_id', String(categoryId));

  return fetchApiPaginated<PostListResponse['data'][number]>(`/api/posts?${qs.toString()}`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(limit),
    forwardCookies: true,
    throwOnError: true,
  });
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

function formatStatValue(value: number): string {
  return value.toLocaleString('zh-CN');
}

interface StaffPresence {
  id: number;
  username: string;
  avatar_url: string | null;
  role: string;
  status: string;
}

type HomeAdSlot = { title: string; description?: string; href?: string };

function parseAdSlots(raw: string | undefined): HomeAdSlot[] {
  try {
    const value = JSON.parse(raw || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .map((item): HomeAdSlot | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const candidate = item as Record<string, unknown>;
        const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
        const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
        const href = typeof candidate.href === 'string' ? candidate.href.trim() : '';
        if (!title || (href && !isSafeFooterHref(href))) return null;
        return { title, ...(description ? { description } : {}), ...(href ? { href } : {}) };
      })
      .filter((item): item is HomeAdSlot => item !== null)
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  const brandInfo = resolveBrand(settings);

  return generatePageMetadata({
    title: '首页',
    brandInfo,
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category_id?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const categoryId = params.category_id ? parseInt(params.category_id, 10) : undefined;

  const settings = await fetchPublicSettings();
  const brand = resolveBrand(settings);
  const postsPerPage = parseInt(settings.posts_per_page || '20', 10);
  const latestPostsSettings = parseLatestPostsSettings(settings);

  let categories: Category[];
  let postsResult: PostListResponse;
  let forumOverview: ForumOverviewStats;
  let staffPresence: StaffPresence[];
  try {
    [categories, postsResult, forumOverview, staffPresence] = await Promise.all([
      fetchCategories(),
      fetchPosts(page, postsPerPage, categoryId),
      fetchForumOverview(),
      fetchApiData<StaffPresence[]>('/api/presence/staff', {
        init: { next: { revalidate: 30 } },
        fallback: [],
        throwOnError: false,
      }),
    ]);
  } catch {
    return <ErrorState title="首页加载失败" description="暂时无法获取论坛内容，请稍后重试。" action={{ label: '重新加载', href: '/' }} />;
  }

  const activeCategoryName = categoryId
    ? categories.find((category) => category.id === categoryId)?.name || '分类'
    : latestPostsSettings.title;
  const heroDescription = latestPostsSettings.description;
  const statCards = [
    { label: '用户', value: formatStatValue(forumOverview.total_users) },
    { label: '回复', value: formatStatValue(forumOverview.total_replies) },
    { label: '主题', value: formatStatValue(forumOverview.total_posts) },
    { label: '资源', value: formatStatValue(forumOverview.total_resources) },
  ];
  const friendlyLinks = parseFooterFriendlyLinks(settings.footer_friendly_links);
  const adSlots = parseAdSlots(settings.home_ad_slots);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 overflow-hidden panel-surface">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="border-b border-[var(--border)] p-6 lg:border-b-0 lg:border-r">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {brand.siteName}
            </p>
            {/* An h1, not a div: the site's most important page had no top-level
                heading at all. The Markdown renderer's own headings are flattened to
                inherit, so the outer element carries the semantics. */}
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              <MarkdownRenderer
                content={activeCategoryName}
                className="[&_p]:m-0 [&_p]:text-inherit [&_p]:font-inherit [&_h1]:m-0 [&_h1]:text-inherit [&_h1]:font-inherit [&_h2]:m-0 [&_h2]:text-inherit [&_h2]:font-inherit [&_h3]:m-0 [&_h3]:text-inherit [&_h3]:font-inherit"
              />
            </h1>
            <MarkdownRenderer
              content={heroDescription}
              className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] [&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0"
            />
          </div>

          <div className="grid gap-3 p-6 sm:grid-cols-2">
            {statCards.map((item) => (
              <div
                key={item.label}
                className="border border-[var(--border)] bg-[var(--muted)] p-3"
              >
                <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  {item.label}
                </div>
                <div className="mt-2 truncate text-lg font-semibold text-[var(--foreground)]">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ForumContentLayout>
        <div className="space-y-4">
          {categories.length > 0 && (
            <section className="panel-surface overflow-hidden">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <h2 className="text-base font-semibold text-[var(--foreground)]">论坛板块</h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">按主题进入讨论，查看每个板块的最新内容。</p>
              </div>
              <div className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {categories.map((category) => (
                  <Link key={category.id} href={`/?category_id=${category.id}`} className="group px-5 py-4 transition-colors hover:bg-[var(--muted)]">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium text-[var(--foreground)] group-hover:text-[var(--primary)]">{category.name}</h3>
                      <span className="text-xs text-[var(--muted-foreground)]">{category.post_count ?? 0} 主题</span>
                    </div>
                    {category.description && <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">{category.description}</p>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="panel-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">在线管理</h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">当前可协助处理社区事务的管理成员</p>
              </div>
              <span className="text-xs text-[var(--muted-foreground)]">
                {staffPresence.filter((staff) => staff.status !== 'offline').length} 在线
              </span>
            </div>
            {staffPresence.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {staffPresence.map((staff) => (
                  <Link key={staff.id} href={`/users/${staff.id}`} className="flex min-w-36 items-center gap-2 border border-[var(--border)] px-3 py-2 hover:border-[var(--primary)]">
                    <span className={`h-2 w-2 rounded-full ${staff.status === 'offline' ? 'bg-[var(--muted-foreground)]' : 'bg-emerald-500'}`} aria-label={staff.status === 'offline' ? '离线' : '在线'} />
                    {staff.avatar_url ? <img src={staff.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--muted)] text-xs">{staff.username.slice(0, 1)}</span>}
                    <span className="truncate text-sm text-[var(--foreground)]">{staff.username}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-[var(--muted-foreground)]">暂无公开的管理成员状态。</p>}
          </section>

          {adSlots.length > 0 && (
            <section className="grid gap-3 sm:grid-cols-2">
              {adSlots.map((slot, index) => {
                const content = <><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">推广位</p><h2 className="mt-2 text-base font-semibold text-[var(--foreground)]">{slot.title}</h2>{slot.description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{slot.description}</p>}</>;
                return slot.href ? (
                  <Link key={`${slot.title}-${index}`} href={slot.href} target={isExternalHref(slot.href) ? '_blank' : undefined} rel={isExternalHref(slot.href) ? 'noreferrer' : undefined} className="border border-[var(--border)] bg-[var(--bg-card)] p-5 transition-colors hover:border-[var(--primary)]">{content}</Link>
                ) : <div key={`${slot.title}-${index}`} className="border border-[var(--border)] bg-[var(--bg-card)] p-5">{content}</div>;
              })}
            </section>
          )}

          {parseBooleanSetting(settings.feature_servers_enabled, false) && <ServerSection />}

          {postsResult.data.length === 0 ? (
            <div className="panel-surface px-6 py-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">暂时没有帖子</p>
              <Link
                href="/posts/new"
                className="mt-4 inline-flex items-center border border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
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

          {friendlyLinks.length > 0 && (
            <section className="panel-surface p-5">
              <h2 className="text-base font-semibold text-[var(--foreground)]">友情链接</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {friendlyLinks.map((link) => (
                  <Link key={`${link.label}-${link.href}`} href={link.href} target={isExternalHref(link.href) ? '_blank' : undefined} rel={isExternalHref(link.href) ? 'noreferrer' : undefined} className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]" title={link.description}>{link.label}</Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </ForumContentLayout>
    </div>
  );
}
