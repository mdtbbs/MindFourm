'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResourceCategory } from '@/types';
import { Search } from 'lucide-react';

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

  return (
    <div className="mb-6 space-y-3">
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
      <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-[var(--text-secondary)]">更多筛选</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={localTag} onChange={(e) => setLocalTag(e.target.value)} onBlur={() => commitMetadataFilter('tag', localTag, tag)} onKeyDown={(e) => e.key === 'Enter' && commitMetadataFilter('tag', localTag, tag)} placeholder="标签（完全匹配）" className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]" />
          <input value={localSupportedVersion} onChange={(e) => setLocalSupportedVersion(e.target.value)} onBlur={() => commitMetadataFilter('supported_version', localSupportedVersion, supportedVersion)} onKeyDown={(e) => e.key === 'Enter' && commitMetadataFilter('supported_version', localSupportedVersion, supportedVersion)} placeholder="支持版本，如 v8" className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]" />
          <input value={localCompatibility} onChange={(e) => setLocalCompatibility(e.target.value)} onBlur={() => commitMetadataFilter('compatibility', localCompatibility, compatibility)} onKeyDown={(e) => e.key === 'Enter' && commitMetadataFilter('compatibility', localCompatibility, compatibility)} placeholder="兼容性" className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]" />
          <select value={resourceKind} onChange={(e) => updateFilters({ resource_kind: e.target.value || null })} className="min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)]">
            <option value="">全部资源类型</option>
            <option value="mod">模组</option>
            <option value="map">地图</option>
            <option value="schematic">蓝图</option>
            <option value="save">存档</option>
            <option value="server_plugin">服务器插件</option>
            <option value="development_tool">开发工具</option>
            <option value="texture_ui">材质与界面</option>
            <option value="other">其他</option>
          </select>
        </div>
      </details>
    </div>
  );
}
