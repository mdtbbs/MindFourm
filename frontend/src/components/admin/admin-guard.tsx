'use client';

import { useAuth } from '@/lib/auth/context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import LoadingSpinner from '@/components/ui/loading-spinner';

interface AdminGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'moderator';
}

export default function AdminGuard({
  children,
  requiredRole = 'admin',
}: AdminGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user)) {
      router.push('/');
      return;
    }
    if (!isLoading && user && user.role !== requiredRole && user.role !== 'admin') {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, user, router, requiredRole]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="orbital" size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user || (user.role !== requiredRole && user.role !== 'admin')) {
    return null;
  }

  return <>{children}</>;
}
