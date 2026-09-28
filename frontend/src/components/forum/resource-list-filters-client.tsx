'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionTokens } from '@/lib/motion';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ResourceCategory } from '@/types';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { RESOURCE_KINDS } from '@/lib/display-labels';
import { mergeResourceQuery } from '@/lib/resources/query';
import { useI18n } from '@/i18n/provider';

interface ResourceFiltersProps {
  categories: ResourceCategory[]; initialCategory?: string; initialSearch?: string; initialSort?: string;
  initialTag?: string; initialSupportedVersion?: string; initialCompatibility?: string; initialResourceKind?: string;
  supportedVersions: string[]; compatibilityOptions: string[]; planets: string[];
}

export default function ResourceFilters({
  categories, initialCategory, initialSearch, initialSort, initialTag, initialSupportedVersion,
  initialCompatibility, initialResourceKind, supportedVersions, compatibilityOptions, planets,
}: ResourceFiltersProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get('category_id') || initialCategory || '';
  const urlSearch = searchParams.get('search') || initialSearch || '';
  const sort = searchParams.get('sort') || initialSort || 'created_at';
  const tag = searchParams.get('tag') || initialTag || '';
  const supportedVersion = searchParams.get('supported_version') || initialSupportedVersion || '';
  const compatibility = searchParams.get('compatibility') || initialCompatibility || '';
  const resourceKind = searchParams.get('resource_kind') || initialResourceKind || '';
  const planet = searchParams.get('planet') || '';
  const [localSearch, setLocalSearch] = useState(urlSearch);
  const [localTag, setLocalTag] = useState(tag);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileFiltersOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [mobileFiltersOpen]);

  useEffect(() => setLocalSearch(urlSearch), [urlSearch]);
  useEffect(() => setLocalTag(tag), [tag]);

  const updateFilters = useCallback((updates: Record<string, string | null>) => {
    const query = mergeResourceQuery(searchParams.toString(), updates);
    router.push(query ? `/resources?${query}` : '/resources');
  }, [router, searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => { if (localSearch !== urlSearch) updateFilters({ search: localSearch || null }); }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, urlSearch, updateFilters]);

  const activeFilters = [selectedCategory, urlSearch, tag, supportedVersion, compatibility, resourceKind, planet].filter(Boolean).length;
  const hasFilters = activeFilters > 0 || sort !== 'created_at';
  const chipClass = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)]'}`;
  const inputClass = 'min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]';

  const sortLabels: Record<string, string> = {
    created_at: t('resourceList.latest'),
    updated_at: t('resourceList.recentlyUpdated'),
    download_count: t('resourceList.mostDownloaded'),
    rating_average: t('resourceList.highestRated'),
    rating_count: t('resourceList.mostRated'),
  };
  const sortLabel = sortLabels[sort] || sortLabels.created_at;
  const kindLabel = (value: string, fallback: string) => {
    const translated = t(`resourceList.resourceKind.${value}`);
    return translated === `resourceList.resourceKind.${value}` ? fallback : translated;
  };

  return <section aria-label={t('resourceList.filters')} className="mb-5 space-y-3">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
      <label className="relative min-w-0 flex-1"><span className="sr-only">{t('resourceList.search')}</span><Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input type="search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && localSearch !== urlSearch) updateFilters({ search: localSearch || null }); }} placeholder={t('resourceList.search')} className={`${inputClass} w-full pl-10`} /></label>
      <div className="flex shrink-0 gap-2">
        <label className="sr-only" htmlFor="resource-sort">{t('resourceList.sort')}</label><select id="resource-sort" value={sort} onChange={(event) => updateFilters({ sort: event.target.value || null })} className={inputClass}>
          <option value="created_at">{t('resourceList.latest')}</option><option value="updated_at">{t('resourceList.recentlyUpdated')}</option><option value="download_count">{t('resourceList.mostDownloaded')}</option><option value="rating_average">{t('resourceList.highestRated')}</option><option value="rating_count">{t('resourceList.mostRated')}</option>
        </select>
        <button type="button" className={`${inputClass} inline-flex items-center gap-2 sm:hidden`} onClick={() => setMobileFiltersOpen(true)} aria-haspopup="dialog"><SlidersHorizontal className="h-4 w-4" />{t('resourceList.filter')}{activeFilters > 0 && <span className="rounded-full bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary)]">{activeFilters}</span>}</button>
        <details className="relative hidden sm:block">
          <summary className="flex h-full cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><SlidersHorizontal className="h-4 w-4" />{t('resourceList.filter')}{activeFilters > 0 && <span className="rounded-full bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary)]">{activeFilters}</span>}</summary>
          <div className="absolute right-0 z-20 mt-2 grid w-[min(90vw,34rem)] gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.topic')}<select value={selectedCategory} onChange={(event) => updateFilters({ category_id: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allTopics')}</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.gameVersion')}<select value={supportedVersion} onChange={(event) => updateFilters({ supported_version: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allVersions')}</option>{supportedVersions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.platform')}<select value={compatibility} onChange={(event) => updateFilters({ compatibility: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allPlatforms')}</option>{compatibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.planet')}<select value={planet} onChange={(event) => updateFilters({ planet: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allPlanets')}</option>{planets.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)] sm:col-span-2">{t('resourceList.tag')}<input value={localTag} onChange={(event) => setLocalTag(event.target.value)} onBlur={() => { if (localTag !== tag) updateFilters({ tag: localTag || null }); }} onKeyDown={(event) => { if (event.key === 'Enter' && localTag !== tag) updateFilters({ tag: localTag || null }); }} placeholder={t('resourceList.enterTag')} className={inputClass} /></label>
          </div>
        </details>
      </div>
    </div>
    <AnimatePresence>
    {mobileFiltersOpen && <motion.div className="fixed inset-0 z-[70] flex items-end sm:hidden" role="dialog" aria-modal="true" aria-label={t('resourceList.filters')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : motionTokens.normal, ease: motionTokens.easing }}>
      <button type="button" aria-label={t('resourceList.closeFilters')} className="absolute inset-0 bg-black/45" onClick={() => setMobileFiltersOpen(false)} />
      <motion.section className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[var(--radius-card)] border-t border-[var(--border)] bg-[var(--bg-card)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4" initial={reduceMotion ? false : { opacity: 0.9, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }} transition={{ duration: reduceMotion ? 0 : motionTokens.panel, ease: motionTokens.easing }}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-[var(--text)]">{t('resourceList.filterResources')}</h2><button type="button" aria-label={t('resourceList.closeFilters')} onClick={() => setMobileFiltersOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.topic')}<select value={selectedCategory} onChange={(event) => updateFilters({ category_id: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allTopics')}</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.gameVersion')}<select value={supportedVersion} onChange={(event) => updateFilters({ supported_version: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allVersions')}</option>{supportedVersions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.platform')}<select value={compatibility} onChange={(event) => updateFilters({ compatibility: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allPlatforms')}</option>{compatibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.planet')}<select value={planet} onChange={(event) => updateFilters({ planet: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allPlanets')}</option>{planets.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.tag')}<input value={localTag} onChange={(event) => setLocalTag(event.target.value)} onBlur={() => { if (localTag !== tag) updateFilters({ tag: localTag || null }); }} onKeyDown={(event) => { if (event.key === 'Enter' && localTag !== tag) updateFilters({ tag: localTag || null }); }} placeholder={t('resourceList.enterTag')} className={inputClass} /></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">{t('resourceList.sort')}<select value={sort} onChange={(event) => updateFilters({ sort: event.target.value || null })} className={inputClass}><option value="created_at">{t('resourceList.latest')}</option><option value="updated_at">{t('resourceList.recentlyUpdated')}</option><option value="download_count">{t('resourceList.mostDownloaded')}</option><option value="rating_average">{t('resourceList.highestRated')}</option><option value="rating_count">{t('resourceList.mostRated')}</option></select></label>
        </div>
        <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-[var(--border)] bg-[var(--bg-card)] py-3"><button type="button" onClick={() => { setLocalSearch(''); setLocalTag(''); router.push('/resources'); }} className="min-h-11 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-4 text-sm text-[var(--text-secondary)]">{t('resourceList.clear')}</button><button type="button" onClick={() => setMobileFiltersOpen(false)} className="min-h-11 flex-1 rounded-[var(--radius)] bg-[var(--primary)] px-4 text-sm font-semibold text-white">{t('resourceList.apply')}</button></div>
      </motion.section>
    </motion.div>}
    </AnimatePresence>
    <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1" aria-label={t('resourceList.resourceType')}>
      <button type="button" aria-pressed={!resourceKind} onClick={() => updateFilters({ resource_kind: null })} className={chipClass(!resourceKind)}>{t('resourceList.all')}</button>
      {RESOURCE_KINDS.map(({ value, label }) => <button key={value} type="button" aria-pressed={resourceKind === value} onClick={() => updateFilters({ resource_kind: value })} className={chipClass(resourceKind === value)}>{kindLabel(value, label)}</button>)}
    </div>
    {hasFilters && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>{t('resourceList.activeFilters', { count: activeFilters + Number(sort !== 'created_at') })}</span>
      {selectedCategory && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.topicChip', { value: categories.find((category) => String(category.id) === selectedCategory)?.name || t('resourceList.topic') })}</span>}
      {resourceKind && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{kindLabel(resourceKind, RESOURCE_KINDS.find((kind) => kind.value === resourceKind)?.label || resourceKind)}</span>}
      {urlSearch && <span className="max-w-48 truncate rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.searchChip', { value: urlSearch })}</span>}
      {tag && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.tagChip', { value: tag })}</span>}
      {supportedVersion && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.versionChip', { value: supportedVersion })}</span>}
      {compatibility && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.platformChip', { value: compatibility })}</span>}
      {planet && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.planetChip', { value: planet })}</span>}
      {sort !== 'created_at' && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{t('resourceList.sortChip', { value: sortLabel })}</span>}
      <button type="button" onClick={() => { setLocalSearch(''); setLocalTag(''); router.push('/resources'); }} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 hover:text-[var(--primary)]"><X className="h-3.5 w-3.5" />{t('resourceList.clear')}</button>
    </div>}
  </section>;
}
