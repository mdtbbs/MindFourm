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
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Categories Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-title">分类</h3>
        <nav className="sidebar-nav">
          <Link
            href="/"
            className={`sidebar-link ${!selectedCategory ? 'active' : ''}`}
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
                className={`sidebar-link ${selectedCategory === category.id ? 'active' : ''}`}
                title={category.name}
              >
                {category.name}
              </Link>
            ))}
        </nav>
      </div>

      {/* Tags Section */}
      {tags.length > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">热门标签</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {tags.slice(0, 20).map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="sidebar-tag"
                title={tag.name}
              >
                <span>{tag.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Resource Center */}
      <div className="sidebar-section">
        <Link href="/resources" className="sidebar-quick-link">
          <FolderOpen style={{ width: 16, height: 16 }} />
          资源中心
        </Link>
      </div>

      {/* Game Servers */}
      <div className="sidebar-section">
        <Link href="/servers" className="sidebar-quick-link">
          <Server style={{ width: 16, height: 16 }} />
          游戏服务器
        </Link>
      </div>
    </aside>
  );
}