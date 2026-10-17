'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { useI18n } from '@/i18n/provider';
import { Bookmark, Bell, FileText, FolderKanban, Mail, MessageSquare, Settings, Users, Wrench } from 'lucide-react';

export default function MySpaceDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useI18n();
  if (isLoading) return <main aria-label={t('common.loading')} className="mx-auto w-full max-w-6xl animate-pulse px-4 py-8"><div className="h-8 w-48 bg-[var(--bg-elevated)]" /><div className="mt-6 h-32 border border-[var(--border)] bg-[var(--bg-card)]" /></main>;
  if (!isAuthenticated || !user) return <main className="mx-auto w-full max-w-3xl px-4 py-10"><h1 className="text-2xl font-semibold text-[var(--text)]">{t('mySpace.title')}</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">{t('mySpace.loginDescription')}</p><Link href="/login?redirect=%2Fme" className="mt-4 inline-flex min-h-11 items-center bg-[var(--primary-button)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">{t('navigation.login')}</Link></main>;

  const items = [
    { href: '/notifications', title: t('navigation.notifications'), description: t('mySpace.notificationsDescription'), icon: Bell },
    { href: '/messages', title: t('navigation.messages'), description: t('mySpace.messagesDescription'), icon: Mail },
    { href: '/friends', title: t('navigation.friends'), description: t('mySpace.friendsDescription'), icon: Users },
    { href: '/bookmarks', title: t('navigation.bookmarks'), description: t('mySpace.bookmarksDescription'), icon: Bookmark },
    { href: `/users/${user.id}`, title: t('mySpace.posts'), description: t('mySpace.postsDescription'), icon: MessageSquare },
    { href: '/resources/my', title: t('navigation.myResources'), description: t('mySpace.resourcesDescription'), icon: FolderKanban },
    { href: '/tools', title: t('mySpace.tools'), description: t('mySpace.toolsDescription'), icon: Wrench },
    { href: '/settings', title: t('navigation.settings'), description: t('mySpace.settingsDescription'), icon: Settings },
    { href: '/posts/new', title: t('mySpace.postDrafts'), description: t('mySpace.postDraftsDescription'), icon: FileText },
    { href: '/resources/submit', title: t('mySpace.resourceDrafts'), description: t('mySpace.resourceDraftsDescription'), icon: FileText },
  ];

  return <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
    <header className="border-b border-[var(--border)] pb-5"><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--primary-text)]">{t('navigation.me')}</p><h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">{t('mySpace.welcome', { name: user.username || t('navigation.profile') })}</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">{t('mySpace.description')}</p></header>
    <section className="mt-6" aria-label={t('mySpace.sections')}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(({ href, title, description, icon: Icon }) => <Link key={`${href}:${title}`} href={href} className="flex min-h-28 items-start gap-3 border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary-text)]" aria-hidden="true" /><span><span className="block font-semibold text-[var(--text)]">{title}</span><span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{description}</span></span></Link>)}</div></section>
    <section className="mt-7 border-t border-[var(--border)] pt-5"><h2 className="text-lg font-semibold text-[var(--text)]">{t('mySpace.downloads')}</h2><p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{t('mySpace.downloadsUnavailable')}</p><span aria-disabled="true" className="mt-3 inline-flex min-h-10 items-center border border-[var(--border)] px-3 text-sm text-[var(--text-muted)]">{t('community.comingSoon')}</span></section>
  </main>;
}
