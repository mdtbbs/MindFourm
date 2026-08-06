import PageLoader from '@/components/ui/page-loader';

/**
 * Resources route loading state
 */
export default function Loading() {
  return <PageLoader variant="blocks" size="lg" text="正在加载资源" />;
}
