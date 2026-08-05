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
}

export default function ResourceFilters({ categories, initialCategory, initialSearch, initialSort }: ResourceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams?.get('category_id') || initialCategory || '';
  const urlSearch = searchParams?.get('search') || initialSearch || '';
  const sort = searchParams?.get('sort') || initialSort || 'created_at';

  // Local search state: only pushes to URL after 300ms debounce or on Enter/blur.
  const [localSearch, setLocalSearch] = useState(urlSearch);

  useEffect(() => {
    setLocalSearch(urlSearch);
  }, [urlSearch]);

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

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
  );
}
