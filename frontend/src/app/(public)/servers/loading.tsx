import LoadingSpinner from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <LoadingSpinner size="lg" />
    </div>
  );
}
