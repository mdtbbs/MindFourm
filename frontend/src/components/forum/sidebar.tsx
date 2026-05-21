'use client';

import Link from 'next/link';
import { Category, Tag } from '@/types';
import { FolderOpen, Server } from 'lucide-react';

interface SidebarProps {
  categories: Category[];
  tags: Tag[];
  selectedCategory?: number;
}

export default function Sidebar({ categories, tags, selectedCategory }: SidebarProps) {
  return (
    <aside className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-surface-900 dark:text-gray-100 mb-3">分类</h3>
        <nav className="space-y-1">
          <Link
            href="/"
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              !selectedCategory
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                : 'text-surface-600 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-gray-800'
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
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                    : 'text-surface-600 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-gray-800'
                }`}
              >
                {category.name}
              </Link>
            ))}
        </nav>
      </div>

      {tags.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-surface-900 dark:text-gray-100 mb-3">热门标签</h3>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="px-3 py-1 bg-surface-100 dark:bg-gray-800 text-surface-600 dark:text-gray-300 text-sm rounded-full hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-400 transition-colors"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Resource Center */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4">
        <Link
          href="/resources"
          className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          资源中心
        </Link>
      </div>

      {/* Game Servers */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4">
        <Link
          href="/servers"
          className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <Server className="w-4 h-4" />
          游戏服务器
        </Link>
      </div>
    </aside>
  );
}
