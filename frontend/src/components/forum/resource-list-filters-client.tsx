'use client';

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
  const search = searchParams?.get('search') || initialSearch || '';
  const sort = searchParams?.get('sort') || initialSort || 'created';

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.push(`/resources?${params.toString()}`);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => updateFilters({ search: e.target.value || null })}
          onKeyDown={(e) => e.key === 'Enter' && updateFilters({})}
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
        <option value="created">最新发布</option>
        <option value="downloads">最多下载</option>
      </select>
    </div>
  );
}