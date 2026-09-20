import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Search } from 'lucide-react';
import ThreadList from '@/components/forum/thread-list';
import { getHomeData, type HomeData, type HomeSection } from '@/lib/api/v1/home';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { resourceKindLabel } from '@/lib/display-labels';

export const dynamic = 'force-dynamic';

const UNAVAILABLE_HOME: HomeData = {
  discussions: { state: 'unavailable', items: [] }, resources: { state: 'unavailable', items: [] },
  news: { state: 'unavailable', items: [] }, notices: { state: 'unavailable', items: [] },
  development: { issues: { state: 'unavailable', items: [] }, pull_requests: { state: 'unavailable', items: [] } },
  generated_at: new Date(0).toISOString(),
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings();
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

function StateNote({ section }: { section: HomeSection<unknown> }) {
  return section.state === 'stale' ? <p className="mb-2 text-xs text-[var(--text-muted)]">正在显示最近一次成功加载的内容。</p> : null;
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8 border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{brand.siteName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Mindustry 中文玩家社区</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">找 Mod、地图、蓝图、服务器，或加入正在发生的讨论。</p>
        <form action="/search" className="relative mt-5 max-w-xl"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input name="q" aria-label="搜索社区内容" placeholder="搜索 Mod、地图、蓝图、帖子、服务器…" className="h-10 w-full border border-[var(--border)] bg-[var(--bg-card)] pl-10 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" /></form>
        <nav aria-label="快捷入口" className="mt-4 flex flex-wrap gap-2"><Link href="/resources?resource_kind=mod" className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">找 Mod</Link><Link href="/resources?resource_kind=map" className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">找地图</Link><Link href="/resources?resource_kind=schematic" className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">找蓝图</Link><Link href="/servers" className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">找服务器</Link></nav>
      </section>

      <section><SectionHeading title="正在讨论" href="/threads" /><StateNote section={home.discussions} />{home.discussions.state === 'unavailable' ? <SectionUnavailable /> : home.discussions.items.length ? <ThreadList posts={home.discussions.items} /> : <p className="border border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">暂时没有社区讨论</p>}</section>

      <section className="mt-8"><SectionHeading title="最新资源" href="/resources" /><StateNote section={home.resources} />{home.resources.state === 'unavailable' ? <SectionUnavailable /> : <div className="grid gap-3 sm:grid-cols-2">{home.resources.items.map((resource) => <Link key={resource.id} href={`/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`} className="border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><h3 className="font-medium text-[var(--text)]">{resource.title}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{resourceKindLabel(resource.resource_kind)}{resource.version ? ` · v${resource.version}` : ''}{resource.author_name ? ` · ${resource.author_name}` : ''}</p></Link>)}</div>}</section>

      <section className="mt-8"><SectionHeading title="像素快报" /><StateNote section={home.news} />{home.news.state === 'unavailable' ? <SectionUnavailable /> : home.news.items.length ? <div className="grid gap-3 sm:grid-cols-2">{home.news.items.map((news) => <Link key={news.id} href={`/search?q=${encodeURIComponent(news.title)}`} className="border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><h3 className="font-medium text-[var(--text)]">{news.title}</h3>{news.category && <p className="mt-1 text-xs text-[var(--text-muted)]">{news.category}</p>}</Link>)}</div> : null}</section>

      <section className="mt-8"><SectionHeading title="社区公告" href="/notices" /><StateNote section={home.notices} />{home.notices.state === 'unavailable' ? <SectionUnavailable /> : home.notices.items.length ? <div className="grid gap-3">{home.notices.items.map((notice) => <Link key={notice.id} href={`/notices/${notice.public_id}`} className="border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><h3 className="font-medium text-[var(--text)]">{notice.title}</h3>{notice.excerpt && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{notice.excerpt}</p>}</Link>)}</div> : null}</section>

      <section className="mt-10 border-t border-[var(--border)] pt-7"><SectionHeading title="Mindustry 开发动态" /><div className="grid gap-6 md:grid-cols-2"><DeveloperList title="Issue" section={home.development.issues} /><DeveloperList title="Pull Request" section={home.development.pull_requests} /></div></section>
    </main>
  );
}

function DeveloperList({ title, section }: { title: string; section: HomeSection<HomeData['development']['issues']['items'][number]> }) {
  return <section><h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{title}</h3><StateNote section={section} />{section.state === 'unavailable' ? <SectionUnavailable /> : section.items.length ? <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">{section.items.map((item) => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer" className="block p-3 hover:bg-[var(--bg-hover)]"><p className="text-sm font-medium text-[var(--text)]">#{item.external_id} {item.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{item.repository} · {item.state}</p></a></li>)}</ul> : <p className="text-sm text-[var(--text-muted)]">暂无动态</p>}</section>;
}
