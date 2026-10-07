'use client';

import Link from 'next/link';
import { ArrowRight, Boxes } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export type ToolGuideId = 'blueprint-editor' | 'map-editor' | 'wave-editor' | 'blueprint-analysis';
const GUIDES: Record<ToolGuideId, { titleKey: string; descriptionKey: string; resourcesHref: string; submitHref: string }> = {
  'blueprint-editor': { titleKey: 'tools.blueprintEditor', descriptionKey: 'tools.blueprintEditorDetails', resourcesHref: '/resources?resource_kind=schematic', submitHref: '/resources/submit/schematic' },
  'map-editor': { titleKey: 'tools.mapEditor', descriptionKey: 'tools.mapEditorDetails', resourcesHref: '/resources?resource_kind=map', submitHref: '/resources/submit/map' },
  'wave-editor': { titleKey: 'tools.waveEditor', descriptionKey: 'tools.waveEditorDetails', resourcesHref: '/resources?resource_kind=map', submitHref: '/resources/submit/map' },
  'blueprint-analysis': { titleKey: 'tools.blueprintAnalysis', descriptionKey: 'tools.blueprintAnalysisDetails', resourcesHref: '/resources?resource_kind=schematic', submitHref: '/resources/submit/schematic' },
};

export default function ToolGuide({ id }: { id: ToolGuideId }) {
  const { t } = useI18n();
  const guide = GUIDES[id];
  return <main className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6 lg:px-8">
    <nav aria-label={t('navigation.breadcrumb')} className="mb-5 text-sm text-[var(--text-muted)]"><Link href="/tools" className="hover:text-[var(--text)]">{t('tools.title')}</Link><span className="mx-2">/</span><span aria-current="page" className="text-[var(--text)]">{t(guide.titleKey)}</span></nav>
    <header className="border-b border-[var(--border)] pb-5"><span className="flex h-11 w-11 items-center justify-center bg-[var(--primary-soft)] text-[var(--primary)]"><Boxes className="h-5 w-5" aria-hidden="true" /></span><h1 className="mt-4 text-2xl font-semibold text-[var(--text)]">{t(guide.titleKey)}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{t(guide.descriptionKey)}</p><p className="mt-4 max-w-2xl border-l-2 border-[var(--primary)] pl-3 text-sm leading-6 text-[var(--text-secondary)]">{t('tools.workbenchNote')}</p></header>
    <div className="mt-5 flex flex-wrap gap-2"><Link href={guide.resourcesHref} className="inline-flex min-h-11 items-center gap-2 bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">{t('tools.chooseResource')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link><Link href={guide.submitHref} className="inline-flex min-h-11 items-center border border-[var(--border)] px-4 text-sm text-[var(--text)] hover:border-[var(--primary)]">{t('tools.submitResource')}</Link></div>
  </main>;
}
