import type { ReactNode } from 'react';
import Sidebar from '@/components/forum/sidebar';
import type { Category, Tag } from '@/types';

interface ForumContentLayoutProps {
  categories: Category[];
  tags: Tag[];
  selectedCategory?: number;
  activeQuickLinkHref?: string;
  highlightAllPosts?: boolean;
  children: ReactNode;
}

export default function ForumContentLayout({
  categories,
  tags,
  selectedCategory,
  activeQuickLinkHref,
  highlightAllPosts = true,
  children,
}: ForumContentLayoutProps) {
  return (
    <div className="flex gap-8">
      <div className="hidden w-60 shrink-0 lg:block">
        <Sidebar
          categories={categories}
          tags={tags}
          selectedCategory={selectedCategory}
          activeQuickLinkHref={activeQuickLinkHref}
          highlightAllPosts={highlightAllPosts}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
