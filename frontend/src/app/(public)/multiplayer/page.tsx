import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Radio, Server, Users } from 'lucide-react';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';
import { siteProfile } from '@/config/site-profile';
import { getDiscoverSummary } from '@/lib/api/v1/discover';
import MultiplayerPresencePreview from '@/components/lanlink/multiplayer-presence-preview';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'multiplayer.title'), description: translate(locale, 'multiplayer.description') };
}

export default async function MultiplayerPage() {
  const [locale, summary] = await Promise.all([
    getRequestLocale(),
    getDiscoverSummary({ signal: AbortSignal.timeout(3500) }).catch(() => null),
  ]);
  const t = (key: string) => translate(locale, key);
  const areas = [
    ...(siteProfile.features.lanlink ? [{ href: '/lanlink', title: t('multiplayer.lobby'), description: t('multiplayer.lobbyDescription'), icon: Radio }] : []),
    ...(siteProfile.features.serversDirectory ? [{ href: '/servers', title: t('navigation.servers'), description: t('multiplayer.serversDescription'), icon: Server }] : []),
    { href: '/friends', title: t('navigation.friends'), description: t('multiplayer.friendsDescription'), icon: Users },
  ];
  return <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
    <header className="border-b border-[var(--border)] pb-5"><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--primary)]">{t('navigation.multiplayer')}</p><h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">{t('multiplayer.title')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t('multiplayer.description')}</p></header>
    <nav aria-label={t('multiplayer.sections')} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{areas.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="flex min-h-32 items-start justify-between gap-3 border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><span className="flex min-w-0 items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" /><span><span className="block font-semibold text-[var(--text)]">{title}</span><span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{description}</span></span></span><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" /></Link>)}</nav>
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <MultiplayerPresencePreview />
      {siteProfile.features.serversDirectory && <section aria-labelledby="multiplayer-servers-title" className="border-y border-[var(--border)] py-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="multiplayer-servers-title" className="text-lg font-semibold text-[var(--text)]">{t('multiplayer.onlineServers')}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{t('multiplayer.onlineServersDescription')}</p></div><Link href="/servers" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--primary)] hover:underline">{t('navigation.servers')}</Link></div>
        {summary === null ? <p role="status" className="mt-4 text-sm text-[var(--text-muted)]">{t('multiplayer.serversUnavailable')} <Link href="/servers" className="text-[var(--primary)] hover:underline">{t('common.retry')}</Link></p>
          : summary.active_servers.length ? <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">{summary.active_servers.slice(0, 8).map((server) => <li key={server.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium text-[var(--text)]">{server.name}</span><span className="break-all text-xs text-[var(--text-muted)]">{server.hostname}:{server.port}</span></li>)}</ul>
            : <p className="mt-4 text-sm text-[var(--text-muted)]">{t('multiplayer.noActiveServers')}</p>}
      </section>}
    </div>
    <p className="mt-6 max-w-3xl text-sm text-[var(--text-muted)]">{t('multiplayer.featureNote')}</p>
  </main>;
}
