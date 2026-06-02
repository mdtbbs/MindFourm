import PageLoader from '@/components/ui/page-loader';

/**
 * Root loading page - displayed during initial route transition
 */
export default function Loading() {
  return <PageLoader variant="hexagon" size="xl" />;
}