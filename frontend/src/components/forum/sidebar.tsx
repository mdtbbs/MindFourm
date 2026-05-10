'use client';

import Link from 'next/link';
import { Category, Tag } from '@/types';

interface SidebarProps {
  categories: Category[];
  tags: Tag[];
  selectedCategory?: number;
}

export default function Sidebar({ categories, tags, selectedCategory }: SidebarProps) {
  return (
    <aside className="space-y-6">
      <div className="bg-white rounded-lg border border-surface-200 p-4">
        <h3 className="font-semibold text-surface-900 mb-3">分类</h3>
        <nav className="space-y-1">
          <Link
            href="/"
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              !selectedCategory
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            全部帖子
          </Link>
          {categories
            .filter((c) => c.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.id}`}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-surface-600 hover:bg-surface-100'
                }`}
              >
                {category.name}
              </Link>
            ))}
        </nav>
      </div>

      {tags.length > 0 && (
        <div className="bg-white rounded-lg border border-surface-200 p-4">
          <h3 className="font-semibold text-surface-900 mb-3">热门标签</h3>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="px-3 py-1 bg-surface-100 text-surface-600 text-sm rounded-full hover:bg-primary-100 hover:text-primary-700 transition-colors"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
