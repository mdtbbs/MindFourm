import PageLoader from '@/components/ui/page-loader';

/**
 * Search route loading state
 */
export default function Loading() {
  return <PageLoader variant="blocks" size="lg" text="正在加载搜索" />;
}
