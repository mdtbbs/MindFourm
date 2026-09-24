'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BookOpen, Home, Plus, Search, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionTokens } from '@/lib/motion';

const publishOptions = [
  { href: '/posts/new', title: '发布帖子', description: '发起讨论或分享动态' },
  { href: '/resources/submit/schematic', title: '快速提交蓝图', description: '上传 .msch 或粘贴蓝图代码' },
  { href: '/resources/submit/map', title: '快速提交地图', description: '上传 .msav 并自动生成预览' },
  { href: '/resources/submit', title: '发布完整资源', description: '提交 Mod、工具及其他资源' },
];

export default function MobileBottomNavigation({ isAuthenticated, userId }: { isAuthenticated: boolean; userId?: number }) {
  const pathname = usePathname();
  const [publishOpen, setPublishOpen] = useState(false);
  const publishButton = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!publishOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = publishButton.current;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPublishOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [publishOpen]);

  const current = (href: string) => href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const itemClass = (active: boolean) => `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`;
  const accountHref = isAuthenticated && userId ? `/users/${userId}` : '/login';
  const accountActive = isAuthenticated ? pathname.startsWith('/users/') : pathname === '/login';

  return <>
    <nav aria-label="主要导航" data-testid="mobile-bottom-navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg-card)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-xl items-stretch px-1">
        <Link href="/" aria-current={current('/') ? 'page' : undefined} className={itemClass(current('/'))}><Home className={`h-5 w-5 transition-[scale,opacity] duration-[var(--motion-fast)] ${current('/') ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-75'}`} aria-hidden="true" /><span>首页</span></Link>
        <Link href="/resources" aria-current={current('/resources') ? 'page' : undefined} className={itemClass(current('/resources'))}><BookOpen className={`h-5 w-5 transition-[scale,opacity] duration-[var(--motion-fast)] ${current('/resources') ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-75'}`} aria-hidden="true" /><span>资源</span></Link>
        <button ref={publishButton} type="button" aria-label="打开发布菜单" aria-haspopup="dialog" aria-expanded={publishOpen} onClick={() => setPublishOpen(true)} className={`${itemClass(false)} transition-[color,scale] active:scale-[0.985] text-[var(--primary)]`}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-white"><Plus className="h-5 w-5" aria-hidden="true" /></span><span>发布</span></button>
        {isAuthenticated ? <Link href="/notifications" aria-current={current('/notifications') ? 'page' : undefined} className={itemClass(current('/notifications'))}><Bell className={`h-5 w-5 transition-[scale,opacity] duration-[var(--motion-fast)] ${current('/notifications') ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-75'}`} aria-hidden="true" /><span>通知</span></Link> : <Link href="/search" aria-current={current('/search') ? 'page' : undefined} className={itemClass(current('/search'))}><Search className={`h-5 w-5 transition-[scale,opacity] duration-[var(--motion-fast)] ${current('/search') ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-75'}`} aria-hidden="true" /><span>搜索</span></Link>}
        <Link href={accountHref} aria-current={accountActive ? 'page' : undefined} className={itemClass(accountActive)}><UserRound className={`h-5 w-5 transition-[scale,opacity] duration-[var(--motion-fast)] ${accountActive ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-75'}`} aria-hidden="true" /><span>{isAuthenticated ? '我的' : '登录'}</span></Link>
      </div>
    </nav>

    <AnimatePresence>
    {publishOpen && <motion.div className="fixed inset-0 z-[70] flex items-end lg:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-publish-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : motionTokens.normal, ease: motionTokens.easing }}>
      <button type="button" aria-label="关闭发布菜单" className="absolute inset-0 bg-black/45" onClick={() => setPublishOpen(false)} />
      <motion.section className="relative w-full rounded-t-[var(--radius-card)] border-t border-[var(--border)] bg-[var(--bg-card)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-[var(--shadow-modal)]" initial={reduceMotion ? false : { opacity: 0.9, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }} transition={{ duration: reduceMotion ? 0 : motionTokens.panel, ease: motionTokens.easing }}>
        <div className="mb-3 flex items-center justify-between"><div><h2 id="mobile-publish-title" className="text-base font-semibold text-[var(--text)]">选择发布内容</h2><p className="mt-1 text-xs text-[var(--text-muted)]">常用发布入口</p></div><button type="button" aria-label="关闭" onClick={() => setPublishOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-1">{publishOptions.map((option) => <Link key={option.href} href={option.href} onClick={() => setPublishOpen(false)} className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-2 hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><span className="min-w-0"><span className="block text-sm font-medium text-[var(--text)]">{option.title}</span><span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{option.description}</span></span><Plus className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" /></Link>)}</div>
      </motion.section>
    </motion.div>}
    </AnimatePresence>
  </>;
}
