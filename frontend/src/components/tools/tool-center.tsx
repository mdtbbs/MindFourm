'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Blocks, Cloud, Map as MapIcon, ScanSearch, Waves } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

const TOOLS = [
  { id: 'blueprint-editor', href: '/tools/blueprint-editor', titleKey: 'tools.blueprintEditor', descriptionKey: 'tools.blueprintEditorDescription', icon: Blocks },
  { id: 'map-editor', href: '/tools/map-editor', titleKey: 'tools.mapEditor', descriptionKey: 'tools.mapEditorDescription', icon: MapIcon },
  { id: 'wave-editor', href: '/tools/wave-editor', titleKey: 'tools.waveEditor', descriptionKey: 'tools.waveEditorDescription', icon: Waves },
  { id: 'blueprint-analysis', href: '/tools/blueprint-analysis', titleKey: 'tools.blueprintAnalysis', descriptionKey: 'tools.blueprintAnalysisDescription', icon: ScanSearch },
  { id: 'cloud-saves', href: '/tools/cloud-saves', titleKey: 'tools.cloudSaves', descriptionKey: 'tools.cloudSavesDescription', icon: Cloud },
] as const;

type RecentTool = { id: string; usedAt: number };
const STORAGE_KEY = 'mindfourm:recent-tools:v1';

function readRecentTools(): RecentTool[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is RecentTool => !!item && typeof item.id === 'string' && typeof item.usedAt === 'number') : [];
  } catch { return []; }
}

export default function ToolCenter() {
  const { t } = useI18n();
  const [recentTools, setRecentTools] = useState<RecentTool[]>([]);
  useEffect(() => { setRecentTools(readRecentTools()); }, []);
  const recordUse = (id: string) => {
    const next = [{ id, usedAt: Date.now() }, ...readRecentTools().filter((item) => item.id !== id)].slice(0, 4);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Browsing still works when storage is unavailable. */ }
  };
  return <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
    <header className="border-b border-[var(--border)] pb-5"><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--primary-text)]">{t('navigation.tools')}</p><h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">{t('tools.title')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t('tools.description')}</p></header>

    <section className="mt-7" aria-labelledby="tool-list-title"><h2 id="tool-list-title" className="mb-3 text-lg font-semibold text-[var(--text)]">{t('tools.available')}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map((tool) => { const Icon = tool.icon; return <Link key={tool.id} href={tool.href} onClick={() => recordUse(tool.id)} className="flex min-h-36 items-start gap-4 border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--primary-soft)] text-[var(--primary-text)]"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0"><span className="block font-semibold text-[var(--text)]">{t(tool.titleKey)}</span><span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{t(tool.descriptionKey)}</span></span></Link>; })}
    </div></section>

    <section className="mt-8 border-t border-[var(--border)] pt-5" aria-labelledby="recent-tools-title"><h2 id="recent-tools-title" className="text-lg font-semibold text-[var(--text)]">{t('tools.recent')}</h2>{recentTools.length ? <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">{recentTools.map((item) => { const tool = TOOLS.find((entry) => entry.id === item.id); if (!tool) return null; return <li key={item.id}><Link href={tool.href} onClick={() => recordUse(tool.id)} className="flex min-h-12 items-center justify-between gap-3 px-3 text-sm hover:bg-[var(--bg-hover)]"><span className="text-[var(--text)]">{t(tool.titleKey)}</span><span className="text-xs text-[var(--text-muted)]">{t('tools.open')}</span></Link></li>; })}</ul> : <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{t('tools.recentEmpty')}</p>}</section>
  </main>;
}
