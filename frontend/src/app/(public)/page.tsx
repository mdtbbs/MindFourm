import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Search } from 'lucide-react';
import ThreadList from '@/components/forum/thread-list';
import CompactResourceCard from '@/components/forum/compact-resource-card';
import { getHomeData, type HomeData, type HomeSection } from '@/lib/api/v1/home';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export const dynamic = 'force-dynamic';

const UNAVAILABLE_HOME: HomeData = {
  discussions: { state: 'unavailable', items: [] }, resources: { state: 'unavailable', items: [] },
  news: { state: 'unavailable', items: [] }, notices: { state: 'unavailable', items: [] },
  development: { issues: { state: 'unavailable', items: [] }, pull_requests: { state: 'unavailable', items: [] } },
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
  return <div className="border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">本区内容暂时不可用。<Link href={retryHref} className="ml-2 text-[var(--primary)] hover:underline">重新加载</Link></div>;
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return <div className="mb-3 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>{href && <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--primary)] hover:underline">查看全部 <ArrowRight className="h-4 w-4" /></Link>}</div>;
}

export default async function HomePage() {
  const [settings, home] = await Promise.all([
    fetchPublicSettings(),
    // The aggregate endpoint is cache-backed, so a slow upstream must not hold
    // the SSR shell indefinitely. Individual unavailable sections render their
    // own retry state below rather than turning the whole route into an error.
    getHomeData({ signal: AbortSignal.timeout(4500), init: { cache: 'no-store' } }).catch(() => UNAVAILABLE_HOME),
  ]);
  const brand = resolveBrand(settings);
  const locale = await getRequestLocale();
  const staleSections = [home.discussions, home.resources, home.news, home.notices, home.development.issues, home.development.pull_requests].filter((section) => section.state === 'stale').length;

  if (siteProfile.profile === 'mindustry-club') {
    const t = (key: string) => translate(locale, key);
    return <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <section className="border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{brand.siteName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Mindustry Club</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t('home.intro')}</p>
        <form action="/search" className="relative mt-5 max-w-2xl"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input name="q" aria-label={t('common.search')} placeholder={t('home.searchPlaceholder')} className="h-11 w-full rounded border border-[var(--border)] bg-[var(--bg-card)] pl-10 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_14%,transparent)]" /></form>
        <nav aria-label={t('home.quickLinks')} className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            { href: '/resources?resource_kind=mod', label: t('home.mods') },
            { href: '/resources?resource_kind=map', label: t('home.maps') },
            { href: '/resources?resource_kind=schematic', label: t('home.schematics') },
            { href: '/game-servers', label: t('home.gameServers') },
          ].map((entry) => <Link key={entry.href} href={entry.href} className="text-[var(--primary)] hover:underline">{entry.label} <ArrowRight aria-hidden className="inline h-3.5 w-3.5" /></Link>)}
        </nav>
      </section>

      {staleSections > 0 && <p role="status" className="mt-4 text-xs text-[var(--text-muted)]">{t('home.stale')}</p>}
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
        <section>
          <SectionHeading title={t('home.latestResources')} href="/resources" />
          {home.resources.state === 'unavailable'
            ? <p className="border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">{t('home.unavailable')} <Link href="/resources" className="ml-2 text-[var(--primary)] hover:underline">{t('home.reload')}</Link></p>
            : home.resources.items.length
              ? <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">{home.resources.items.map((resource) => <CompactResourceCard key={resource.id} resource={resource} />)}</div>
              : <p className="border-y border-[var(--border)] py-5 text-sm text-[var(--text-muted)]">{t('home.noResources')}</p>}
        </section>
        <section>
          <SectionHeading title={t('home.latestDiscussions')} href="/threads" />
          {home.discussions.state === 'unavailable'
            ? <p className="border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">{t('home.unavailable')} <Link href="/threads" className="ml-2 text-[var(--primary)] hover:underline">{t('home.reload')}</Link></p>
            : home.discussions.items.length
              ? <ThreadList posts={home.discussions.items} />
              : <p className="border-y border-[var(--border)] py-5 text-sm text-[var(--text-muted)]">{t('home.noDiscussions')}</p>}
        </section>
      </div>
    </main>;
  }

  return (
    <main className="content-width-feed mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8 border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{brand.siteName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Mindustry 中文玩家社区</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">找 Mod、地图、蓝图、服务器，或加入正在发生的讨论。</p>
        <form action="/search" className="relative mt-5 max-w-xl"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input name="q" aria-label="搜索社区内容" placeholder="搜索 Mod、地图、蓝图、帖子、服务器…" className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] pl-10 pr-3 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_14%,transparent)]" /></form>
        <nav aria-label="快捷入口" className="mt-4 flex flex-wrap gap-2">{[{ href: '/resources?resource_kind=mod', label: '找 Mod' }, { href: '/resources?resource_kind=map', label: '找地图' }, { href: '/resources?resource_kind=schematic', label: '找蓝图' }, { href: '/servers', label: '找服务器' }].map((entry) => <Link key={entry.href} href={entry.href} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-[background-color,border-color,color,scale,translate] duration-[var(--motion-fast)] hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] hover:text-[var(--primary)] active:scale-[0.98]">{entry.label}</Link>)}</nav>
      </section>

      {staleSections > 0 && <p role="status" className="-mt-4 mb-5 text-xs text-[var(--text-muted)]">部分内容来自最近一次成功加载的缓存。</p>}

      <section><SectionHeading title="正在讨论" href="/threads" />{home.discussions.state === 'unavailable' ? <SectionUnavailable /> : home.discussions.items.length ? <ThreadList posts={home.discussions.items} /> : <p className="border border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">暂时没有社区讨论</p>}</section>

      <section className="mt-8"><SectionHeading title="最新资源" href="/resources" />{home.resources.state === 'unavailable' ? <SectionUnavailable /> : home.resources.items.length ? <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">{home.resources.items.map((resource) => <CompactResourceCard key={resource.id} resource={resource} />)}</div> : <p className="border border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">暂时没有公开资源</p>}</section>

      <section className="mt-8"><SectionHeading title="像素快报" />{home.news.state === 'unavailable' ? <SectionUnavailable /> : home.news.items.length ? <div className="grid gap-3 sm:grid-cols-2">{home.news.items.map((news) => <Link key={news.id} href={`/search?q=${encodeURIComponent(news.title)}`} className="border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><h3 className="font-medium text-[var(--text)]">{news.title}</h3>{news.category && <p className="mt-1 text-xs text-[var(--text-muted)]">{news.category}</p>}</Link>)}</div> : null}</section>

      <section className="mt-8"><SectionHeading title="社区公告" href="/notices" />{home.notices.state === 'unavailable' ? <SectionUnavailable /> : home.notices.items.length ? <div className="grid gap-3">{home.notices.items.map((notice) => <Link key={notice.id} href={`/notices/${notice.public_id}`} className="border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><h3 className="font-medium text-[var(--text)]">{notice.title}</h3>{notice.excerpt && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{notice.excerpt}</p>}</Link>)}</div> : null}</section>

      <section className="mt-10 border-t border-[var(--border)] pt-7"><SectionHeading title="Mindustry 开发动态" /><p className="-mt-1 mb-4 text-sm text-[var(--text-secondary)]">GitHub 自动同步内容，独立于社区讨论与用户主题统计。</p><div className="grid gap-6 md:grid-cols-2"><DeveloperList title="Issue" section={home.development.issues} /><DeveloperList title="Pull Request" section={home.development.pull_requests} /></div></section>
    </main>
  );
}

function DeveloperList({ title, section }: { title: string; section: HomeSection<HomeData['development']['issues']['items'][number]> }) {
  const categoryId = section.items[0]?.category_id;
  return <section><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h3>{categoryId ? <Link href={`/categories/${categoryId}`} className="text-xs text-[var(--primary)] hover:underline">查看板块</Link> : null}</div>{section.state === 'unavailable' ? <SectionUnavailable /> : section.items.length ? <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">{section.items.map((item) => <li key={item.id}><Link href={item.url} className="block p-3 hover:bg-[var(--bg-hover)]"><p className="text-sm font-medium text-[var(--text)]">#{item.external_id} {item.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{item.repository} · {item.state}</p></Link></li>)}</ul> : <p className="text-sm text-[var(--text-muted)]">暂无动态</p>}</section>;
}
