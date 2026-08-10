import type { ReactNode } from 'react';

interface ForumContentLayoutProps {
  children: ReactNode;
}

/**
 * Forum content layout — simple wrapper for forum pages.
 * Categories and tags are now managed in the main site sidebar.
 */
export default function ForumContentLayout({ children }: ForumContentLayoutProps) {
  return <>{children}</>;
}
