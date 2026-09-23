'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ResourceCategory } from '@/types';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { RESOURCE_KINDS } from '@/lib/display-labels';
import { mergeResourceQuery } from '@/lib/resources/query';

interface ResourceFiltersProps {
  categories: ResourceCategory[]; initialCategory?: string; initialSearch?: string; initialSort?: string;
  initialTag?: string; initialSupportedVersion?: string; initialCompatibility?: string; initialResourceKind?: string;
  supportedVersions: string[]; compatibilityOptions: string[]; planets: string[];
}

export default function ResourceFilters({
  categories, initialCategory, initialSearch, initialSort, initialTag, initialSupportedVersion,
  initialCompatibility, initialResourceKind, supportedVersions, compatibilityOptions, planets,
}: ResourceFiltersProps) {
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

  return <section aria-label="资源筛选" className="mb-5 space-y-3">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
      <label className="relative min-w-0 flex-1"><span className="sr-only">搜索资源</span><Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input type="search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && localSearch !== urlSearch) updateFilters({ search: localSearch || null }); }} placeholder="搜索资源…" className={`${inputClass} w-full pl-10`} /></label>
      <div className="flex shrink-0 gap-2">
        <label className="sr-only" htmlFor="resource-sort">排序</label><select id="resource-sort" value={sort} onChange={(event) => updateFilters({ sort: event.target.value || null })} className={inputClass}>
          <option value="created_at">最新发布</option><option value="updated_at">最近更新</option><option value="download_count">最多下载</option><option value="rating_average">评分最高</option><option value="rating_count">评分最多</option>
        </select>
        <button type="button" className={`${inputClass} inline-flex items-center gap-2 sm:hidden`} onClick={() => setMobileFiltersOpen(true)} aria-haspopup="dialog"><SlidersHorizontal className="h-4 w-4" />筛选{activeFilters > 0 && <span className="rounded-full bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary)]">{activeFilters}</span>}</button>
        <details className="relative hidden sm:block">
          <summary className="flex h-full cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><SlidersHorizontal className="h-4 w-4" />筛选{activeFilters > 0 && <span className="rounded-full bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary)]">{activeFilters}</span>}</summary>
          <div className="absolute right-0 z-20 mt-2 grid w-[min(90vw,34rem)] gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">分类<select value={selectedCategory} onChange={(event) => updateFilters({ category_id: event.target.value || null })} className={inputClass}><option value="">全部分类</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">游戏版本<select value={supportedVersion} onChange={(event) => updateFilters({ supported_version: event.target.value || null })} className={inputClass}><option value="">全部版本</option>{supportedVersions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">平台<select value={compatibility} onChange={(event) => updateFilters({ compatibility: event.target.value || null })} className={inputClass}><option value="">全部平台</option>{compatibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">星球<select value={planet} onChange={(event) => updateFilters({ planet: event.target.value || null })} className={inputClass}><option value="">全部星球</option>{planets.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)] sm:col-span-2">标签<input value={localTag} onChange={(event) => setLocalTag(event.target.value)} onBlur={() => { if (localTag !== tag) updateFilters({ tag: localTag || null }); }} onKeyDown={(event) => { if (event.key === 'Enter' && localTag !== tag) updateFilters({ tag: localTag || null }); }} placeholder="输入标签" className={inputClass} /></label>
          </div>
        </details>
      </div>
    </div>
    {mobileFiltersOpen && <div className="fixed inset-0 z-[70] flex items-end sm:hidden" role="dialog" aria-modal="true" aria-label="资源筛选">
      <button type="button" aria-label="关闭筛选" className="absolute inset-0 bg-black/45" onClick={() => setMobileFiltersOpen(false)} />
      <section className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[var(--radius-card)] border-t border-[var(--border)] bg-[var(--bg-card)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-[var(--text)]">筛选资源</h2><button type="button" aria-label="关闭" onClick={() => setMobileFiltersOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">资源类型<select value={resourceKind} onChange={(event) => updateFilters({ resource_kind: event.target.value || null })} className={inputClass}><option value="">全部类型</option>{RESOURCE_KINDS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">分类<select value={selectedCategory} onChange={(event) => updateFilters({ category_id: event.target.value || null })} className={inputClass}><option value="">全部分类</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">Mindustry 版本<select value={supportedVersion} onChange={(event) => updateFilters({ supported_version: event.target.value || null })} className={inputClass}><option value="">全部版本</option>{supportedVersions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">平台<select value={compatibility} onChange={(event) => updateFilters({ compatibility: event.target.value || null })} className={inputClass}><option value="">全部平台</option>{compatibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">星球<select value={planet} onChange={(event) => updateFilters({ planet: event.target.value || null })} className={inputClass}><option value="">全部星球</option>{planets.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">标签<input value={localTag} onChange={(event) => setLocalTag(event.target.value)} onBlur={() => { if (localTag !== tag) updateFilters({ tag: localTag || null }); }} onKeyDown={(event) => { if (event.key === 'Enter' && localTag !== tag) updateFilters({ tag: localTag || null }); }} placeholder="输入标签" className={inputClass} /></label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">排序<select value={sort} onChange={(event) => updateFilters({ sort: event.target.value || null })} className={inputClass}><option value="created_at">最新发布</option><option value="updated_at">最近更新</option><option value="download_count">最多下载</option><option value="rating_average">评分最高</option><option value="rating_count">评分最多</option></select></label>
        </div>
        <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-[var(--border)] bg-[var(--bg-card)] py-3"><button type="button" onClick={() => { setLocalSearch(''); setLocalTag(''); router.push('/resources'); }} className="min-h-11 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-4 text-sm text-[var(--text-secondary)]">清除</button><button type="button" onClick={() => setMobileFiltersOpen(false)} className="min-h-11 flex-1 rounded-[var(--radius)] bg-[var(--primary)] px-4 text-sm font-semibold text-white">应用筛选</button></div>
      </section>
    </div>}
    <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1" aria-label="资源类型">
      <button type="button" aria-pressed={!resourceKind} onClick={() => updateFilters({ resource_kind: null })} className={chipClass(!resourceKind)}>全部</button>
      {RESOURCE_KINDS.map(({ value, label }) => <button key={value} type="button" aria-pressed={resourceKind === value} onClick={() => updateFilters({ resource_kind: value })} className={chipClass(resourceKind === value)}>{label}</button>)}
    </div>
    {hasFilters && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>已启用 {activeFilters + Number(sort !== 'created_at')} 项筛选</span>
      {selectedCategory && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{categories.find((category) => String(category.id) === selectedCategory)?.name || '分类'}</span>}
      {resourceKind && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">{RESOURCE_KINDS.find((kind) => kind.value === resourceKind)?.label || resourceKind}</span>}
      {urlSearch && <span className="max-w-48 truncate rounded-full bg-[var(--bg-elevated)] px-2 py-1">搜索：{urlSearch}</span>}
      {tag && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">标签：{tag}</span>}
      {supportedVersion && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">游戏版本：{supportedVersion}</span>}
      {compatibility && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">平台：{compatibility}</span>}
      {planet && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">星球：{planet}</span>}
      {sort !== 'created_at' && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-1">排序：{sort === 'updated_at' ? '最近更新' : sort === 'download_count' ? '最多下载' : sort === 'rating_average' ? '评分最高' : '评分最多'}</span>}
      <button type="button" onClick={() => { setLocalSearch(''); setLocalTag(''); router.push('/resources'); }} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 hover:text-[var(--primary)]"><X className="h-3.5 w-3.5" />清除</button>
    </div>}
  </section>;
}
