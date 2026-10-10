import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Search } from 'lucide-react';
import HomeBoardGrid from '@/components/portal/home-board-grid';
import HomeStatsStrip from '@/components/portal/home-stats-strip';
import HomeResourceKinds from '@/components/portal/home-resource-kinds';
import HomeSearchLauncher from '@/components/portal/home-search-launcher';
import ThreadList from '@/components/forum/thread-list';
import CompactResourceCard from '@/components/forum/compact-resource-card';
import { getHomeData, type HomeData } from '@/lib/api/v1/home';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';
import { getRequestContentLanguage } from '@/i18n/server';
import { prioritizeContentLanguage } from '@/lib/content-language';
import { formatTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const UNAVAILABLE_HOME: HomeData = {
  discussions: { state: 'unavailable', items: [] }, resources: { state: 'unavailable', items: [] },
  news: { state: 'unavailable', items: [] }, notices: { state: 'unavailable', items: [] },
  development: { issues: { state: 'unavailable', items: [] }, pull_requests: { state: 'unavailable', items: [] } },
  boards: [], resource_kinds: [], stats: null,
  generated_at: new Date(0).toISOString(),
};

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([fetchPublicSettings(), getRequestLocale()]);
  if (siteProfile.profile === 'mindustry-club') {
    return generatePageMetadata({
      title: siteProfile.branding.siteName,
      description: translate(locale, 'home.intro'),
      brandInfo: resolveBrand(settings), openGraphImage: settings.seo_og_image,
    });
  }
  return generatePageMetadata({
    title: '像素工厂中文论坛（Mindustry）- Mod、地图、蓝图与联机社区',
    description: 'MDTBBS 是面向 Mindustry（像素工厂）玩家的中文社区，提供 Mod、地图、蓝图、存档、游戏版本、联机交流、教程与资源分享。',
    brandInfo: resolveBrand(settings), openGraphImage: settings.seo_og_image,
  });
}

function SectionUnavailable({ retryHref = '/' }: { retryHref?: string }) {
  return <div className="border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">本区内容暂时不可用。<Link href={retryHref} className="ml-2 text-[var(--primary-text)] hover:underline">重新加载</Link></div>;
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return <div className="mb-3 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>{href && <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--primary-text)] hover:underline">查看全部 <ArrowRight className="h-4 w-4" /></Link>}</div>;
}

export default async function HomePage() {
  const [settings, loadedHome, preferredContentLanguage] = await Promise.all([
    fetchPublicSettings(),
    // The aggregate endpoint is cache-backed, so a slow upstream must not hold
    // the SSR shell indefinitely. Individual unavailable sections render their
    // own retry state below rather than turning the whole route into an error.
    getHomeData({ signal: AbortSignal.timeout(4500), init: { cache: 'no-store' } }).catch(() => UNAVAILABLE_HOME),
    getRequestContentLanguage(),
  ]);
  const home = siteProfile.contentLanguagePreference ? {
    ...loadedHome,
    discussions: { ...loadedHome.discussions, items: prioritizeContentLanguage(loadedHome.discussions.items, preferredContentLanguage) },
    resources: { ...loadedHome.resources, items: prioritizeContentLanguage(loadedHome.resources.items, preferredContentLanguage) },
  } : loadedHome;
  const brand = resolveBrand(settings);
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const staleSections = [home.discussions, home.resources, home.news, home.notices].filter((section) => section.state === 'stale').length;

  if (siteProfile.profile === 'mindustry-club') {
    const t = (key: string) => translate(locale, key);
    return <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <section className="border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary-text)]">{brand.siteName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Mindustry Club</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t('home.intro')}</p>
        <form action="/search" className="relative mt-5 max-w-2xl"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input name="q" aria-label={t('common.search')} placeholder={t('home.searchPlaceholder')} className="h-11 w-full rounded border border-[var(--border)] bg-[var(--bg-card)] pl-10 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_14%,transparent)]" /></form>
        <nav aria-label={t('navigation.siteNavigation')} className="mt-5 flex flex-wrap gap-2">
          {siteProfile.navigation.filter((entry) => ['posts', 'resources', 'discover'].includes(entry.key))
            .filter((entry) => !entry.feature || siteProfile.features[entry.feature])
            .map((entry) => <Link key={entry.key} href={entry.href} className="border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">{t(`navigation.${entry.key}`)} <ArrowRight aria-hidden className="inline h-3.5 w-3.5" /></Link>)}
          <Link href="/tools" className="border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">{t('navigation.tools')} <ArrowRight aria-hidden className="inline h-3.5 w-3.5" /></Link>
        </nav>
        <nav aria-label={t('home.quickLinks')} className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            { href: '/resources?resource_kind=mod', label: t('home.mods') },
            { href: '/resources?resource_kind=map', label: t('home.maps') },
            { href: '/resources?resource_kind=schematic', label: t('home.schematics') },
          ].map((entry) => <Link key={entry.href} href={entry.href} className="text-[var(--primary-text)] hover:underline">{entry.label} <ArrowRight aria-hidden className="inline h-3.5 w-3.5" /></Link>)}
        </nav>
      </section>

      {staleSections > 0 && <p role="status" className="mt-4 text-xs text-[var(--text-muted)]">{t('home.stale')}</p>}
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
        <section>
          <SectionHeading title={t('home.latestResources')} href="/resources" />
          {home.resources.state === 'unavailable'
            ? <p className="border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">{t('home.unavailable')} <Link href="/resources" className="ml-2 text-[var(--primary-text)] hover:underline">{t('home.reload')}</Link></p>
            : home.resources.items.length
              ? <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">{home.resources.items.map((resource) => <CompactResourceCard key={resource.id} resource={resource} />)}</div>
              : <p className="border-y border-[var(--border)] py-5 text-sm text-[var(--text-muted)]">{t('home.noResources')}</p>}
        </section>
        <section>
          <SectionHeading title={t('home.latestDiscussions')} href="/threads" />
          {home.discussions.state === 'unavailable'
            ? <p className="border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">{t('home.unavailable')} <Link href="/threads" className="ml-2 text-[var(--primary-text)] hover:underline">{t('home.reload')}</Link></p>
            : home.discussions.items.length
              ? <ThreadList posts={home.discussions.items} />
              : <p className="border-y border-[var(--border)] py-5 text-sm text-[var(--text-muted)]">{t('home.noDiscussions')}</p>}
        </section>
      </div>
    </main>;
  }

  // Two columns, no redesign of the shell: the rail stays exactly where it was,
  // and the reading column finally uses the width it already had. The secondary
  // rail only appears on 2xl, where the previous single column wasted ~200px.
  return (
    <main className="mx-auto w-full max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8">
      <section className="border-b border-[var(--border)] pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary-text)]">{brand.siteName}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Mindustry 中文玩家社区</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">找 Mod、地图、蓝图、服务器，或加入正在发生的讨论。</p>
          </div>
          <nav aria-label={t('home.quickLinks')} className="flex flex-wrap gap-2">{[
            { href: '/posts/new', label: t('create.post') },
            { href: '/resources/submit', label: t('create.mod') },
            { href: '/multiplayer', label: t('navigation.multiplayer') },
          ].map((entry) => <Link key={entry.href} href={entry.href} className="inline-flex min-h-11 items-center border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] hover:text-[var(--primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">{entry.label}</Link>)}</nav>
        </div>
        {/* The homepage search posts to the in-app command palette when the tour
            engine is available and to `/search` otherwise, so a guest can never
            land on a page that answers 401 (see `isDesktopLauncherEnabled`). */}
        <HomeSearchLauncher placeholder={t('home.searchPlaceholder')} label={t('common.search')} shortcutLabel="Ctrl K" />
      </section>

      {staleSections > 0 && <p role="status" className="mt-4 text-xs text-[var(--text-muted)]">部分内容来自最近一次成功加载的缓存。</p>}

      <div className="mt-6">
        <HomeStatsStrip stats={home.stats} labels={{ posts: '主题', replies: '回复', members: '成员', resources: '资源', today: '今日新帖' }} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_20rem_17rem]">
        <div className="min-w-0 space-y-9">
          <HomeBoardGrid boards={home.boards} title="社区版块" />
          <HomeResourceKinds kinds={home.resource_kinds} title="资源分类" />

          <section><SectionHeading title="正在讨论" href="/threads" />{home.discussions.state === 'unavailable' ? <SectionUnavailable /> : home.discussions.items.length ? <ThreadList posts={home.discussions.items} /> : <p className="border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">暂时没有社区讨论</p>}</section>

          <section><SectionHeading title="最新资源" href="/resources" />{home.resources.state === 'unavailable' ? <SectionUnavailable /> : home.resources.items.length ? <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">{home.resources.items.map((resource) => <CompactResourceCard key={resource.id} resource={resource} />)}</div> : <p className="border border-[var(--border)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-muted)]">暂时没有公开资源</p>}</section>
        </div>

        <div className="min-w-0 space-y-9 border-t border-[var(--border)] pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1">
          <section><SectionHeading title="社区公告" href="/notices" />{home.notices.state === 'unavailable' ? <SectionUnavailable /> : home.notices.items.length ? <ul className="border border-[var(--border)] bg-[var(--bg-card)]">{home.notices.items.map((notice) => <li key={notice.id} className="border-b border-[var(--border)] p-3 last:border-b-0"><Link href={`/notices/${notice.public_id}`} className="block hover:text-[var(--primary-text)]"><span className="line-clamp-2 text-sm font-medium text-[var(--text)]">{notice.title}</span>{notice.published_at && <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatTime(notice.published_at)}</span>}</Link></li>)}</ul> : <p className="border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">暂无社区公告</p>}</section>

          {/* Rendered only when the server actually has news. An empty section used
              to leave a bare heading floating above nothing. */}
          {home.news.state !== 'unavailable' && home.news.items.length > 0 && <section><SectionHeading title="像素快报" />{<ul className="border border-[var(--border)] bg-[var(--bg-card)]">{home.news.items.map((news) => <li key={news.id} className="border-b border-[var(--border)] p-3 last:border-b-0"><Link href={`/search?q=${encodeURIComponent(news.title)}`} className="block hover:text-[var(--primary-text)]"><span className="line-clamp-2 text-sm font-medium text-[var(--text)]">{news.title}</span>{news.category && <span className="mt-1 block text-xs text-[var(--text-muted)]">{news.category}</span>}</Link></li>)}</ul>}</section>}

          <nav aria-label={t('navigation.siteNavigation')} className="hidden 2xl:block">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">快捷入口</h2>
            <ul className="space-y-1 text-sm">
              {[
                { href: '/categories', label: t('navigation.categories') },
                { href: '/tags', label: t('navigation.tags') },
                { href: '/servers', label: t('navigation.servers') },
                { href: '/leaderboard', label: '积分排行榜' },
                { href: '/tools/blueprint-editor', label: t('tools.blueprintEditor') },
              ].map((entry) => <li key={entry.href}><Link href={entry.href} className="flex min-h-9 items-center border border-transparent px-2 text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--primary-text)]">{entry.label}</Link></li>)}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}
