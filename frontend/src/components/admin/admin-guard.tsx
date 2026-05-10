'use client';

import { useAuth } from '@/lib/auth/context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated || !user || (user.role !== requiredRole && user.role !== 'admin')) {
    return null;
  }

  return <>{children}</>;
}
