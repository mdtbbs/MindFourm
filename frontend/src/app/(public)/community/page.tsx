import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bell, Compass, Folder, Hash, MessageCircle } from 'lucide-react';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'community.title'), description: translate(locale, 'community.description') };
}

export default async function CommunityPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const sections = [
    { href: '/discover', title: t('community.recommended'), description: t('community.recommendedDescription'), icon: Compass },
    { href: '/threads', title: t('community.latest'), description: t('community.latestDescription'), icon: MessageCircle },
    { href: '/categories', title: t('community.categories'), description: t('community.categoriesDescription'), icon: Folder },
    { href: '/tags', title: t('community.tags'), description: t('community.tagsDescription'), icon: Hash },
    { href: '/notices', title: t('community.announcements'), description: t('community.announcementsDescription'), icon: Bell },
  ];
  return <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-5"><div><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--primary)]">{t('navigation.community')}</p><h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">{t('community.title')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t('community.description')}</p></div><Link href="/posts/new" className="inline-flex min-h-11 items-center gap-2 bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">{t('community.createPost')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></header>
    <nav aria-label={t('community.sections')} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sections.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="flex min-h-28 items-start gap-3 border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" /><span><span className="block font-semibold text-[var(--text)]">{title}</span><span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{description}</span></span></Link>)}</nav>
    <section className="mt-7 border-t border-[var(--border)] pt-5"><h2 className="text-lg font-semibold text-[var(--text)]">{t('community.following')}</h2><p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{t('community.followingUnavailable')}</p><span aria-disabled="true" className="mt-3 inline-flex min-h-10 items-center border border-[var(--border)] px-3 text-sm text-[var(--text-muted)]">{t('community.comingSoon')}</span></section>
  </main>;
}
