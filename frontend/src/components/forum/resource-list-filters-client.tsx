'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResourceCategory } from '@/types';
import { Search, SlidersHorizontal, X } from 'lucide-react';

interface ResourceFiltersProps {
  categories: ResourceCategory[];
  initialCategory?: string;
  initialSearch?: string;
  initialSort?: string;
  initialTag?: string;
  initialSupportedVersion?: string;
  initialCompatibility?: string;
  initialResourceKind?: string;
}

export default function ResourceFilters({ categories, initialCategory, initialSearch, initialSort, initialTag, initialSupportedVersion, initialCompatibility, initialResourceKind }: ResourceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams?.get('category_id') || initialCategory || '';
  const urlSearch = searchParams?.get('search') || initialSearch || '';
  const sort = searchParams?.get('sort') || initialSort || 'created_at';
  const tag = searchParams?.get('tag') || initialTag || '';
  const supportedVersion = searchParams?.get('supported_version') || initialSupportedVersion || '';
  const compatibility = searchParams?.get('compatibility') || initialCompatibility || '';
  const resourceKind = searchParams?.get('resource_kind') || initialResourceKind || '';

  // Local search state: only pushes to URL after 300ms debounce or on Enter/blur.
  const [localSearch, setLocalSearch] = useState(urlSearch);
  const [localTag, setLocalTag] = useState(tag);
  const [localSupportedVersion, setLocalSupportedVersion] = useState(supportedVersion);
  const [localCompatibility, setLocalCompatibility] = useState(compatibility);

  useEffect(() => {
    setLocalSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    setLocalTag(tag);
    setLocalSupportedVersion(supportedVersion);
    setLocalCompatibility(compatibility);
  }, [tag, supportedVersion, compatibility]);

  const updateFilters = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.push(`/resources?${params.toString()}`);
  }, [router, searchParams]);

  // Debounce: after 300ms of no typing, push to URL.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== urlSearch) {
        updateFilters({ search: localSearch || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, urlSearch, updateFilters]);

  const commitSearch = () => {
    if (localSearch !== urlSearch) {
      updateFilters({ search: localSearch || null });
    }
  };

  const commitMetadataFilter = (key: 'tag' | 'supported_version' | 'compatibility', value: string, current: string) => {
    if (value !== current) updateFilters({ [key]: value || null });
  };
  const hasFilters = Boolean(selectedCategory || urlSearch || tag || supportedVersion || compatibility || resourceKind || sort !== 'created_at');
  const kinds = [
    ['mod', 'Mod'], ['map', '地图'], ['schematic', '蓝图'], ['development_tool', '工具'], ['other', '其他'],
  ] as const;

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitSearch()}
          onBlur={commitSearch}
          placeholder="搜索资源..."
          className="w-full pl-10 pr-4 py-2 bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] text-sm placeholder:text-[var(--text-muted)]"
        />
      </div>
      <select
        value={selectedCategory}
        onChange={(e) => updateFilters({ category_id: e.target.value || null })}
        className="px-3 py-2 bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] text-sm"
      >
        <option value="">所有类别</option>
        {categories.filter(c => c.is_active).map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => updateFilters({ sort: e.target.value })}
        className="px-3 py-2 bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] text-sm"
      >
        <option value="created_at">最新发布</option>
        <option value="updated_at">最近更新</option>
        <option value="download_count">最多下载</option>
        <option value="rating_average">评分最高</option>
        <option value="rating_count">评分最多</option>
      </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-[var(--text-muted)]">类型</span>
        <button type="button" onClick={() => updateFilters({ resource_kind: null })} className={`rounded-full px-3 py-1 text-xs ${!resourceKind ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>全部</button>
        {kinds.map(([value, label]) => <button key={value} type="button" onClick={() => updateFilters({ resource_kind: value })} className={`rounded-full px-3 py-1 text-xs ${resourceKind === value ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--primary)]'}`}>{label}</button>)}
        {hasFilters && <button type="button" onClick={() => router.push('/resources')} className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"><X className="h-3.5 w-3.5" />清除筛选</button>}
      </div>
      <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 select-none text-[var(--text-secondary)]"><SlidersHorizontal className="h-4 w-4" />高级筛选</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={localTag} onChange={(e) => setLocalTag(e.target.value)} onBlur={() => commitMetadataFilter('tag', localTag, tag)} onKeyDown={(e) => e.key === 'Enter' && commitMetadataFilter('tag', localTag, tag)} placeholder="标签（完全匹配）" className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]" />
          <input value={localSupportedVersion} onChange={(e) => setLocalSupportedVersion(e.target.value)} onBlur={() => commitMetadataFilter('supported_version', localSupportedVersion, supportedVersion)} onKeyDown={(e) => e.key === 'Enter' && commitMetadataFilter('supported_version', localSupportedVersion, supportedVersion)} placeholder="支持版本，如 v8" className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]" />
          <input value={localCompatibility} onChange={(e) => setLocalCompatibility(e.target.value)} onBlur={() => commitMetadataFilter('compatibility', localCompatibility, compatibility)} onKeyDown={(e) => e.key === 'Enter' && commitMetadataFilter('compatibility', localCompatibility, compatibility)} placeholder="兼容性" className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]" />
        </div>
      </details>
    </div>
  );
}
