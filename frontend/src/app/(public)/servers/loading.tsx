import LoadingSpinner from '@/components/ui/loading-spinner';

/**
 * Servers page loading state
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <LoadingSpinner variant="blocks" size="lg" />
    </div>
  );
}