/**
 * Auth Context - Backward compatibility wrapper for Zustand user store
 *
 * This file provides backward compatibility for existing components
 * that use AuthProvider/useAuth pattern, while internally using Zustand.
 *
 * New components should import directly from '@/store/user-store'
 */

'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUserStore, useAuth } from '@/store/user-store';
import LoadingSpinner from '@/components/ui/loading-spinner';

// Re-export useAuth for backward compatibility
export { useAuth };

/**
 * AuthProvider - Initializes Zustand user store on mount
 *
 * This Provider triggers the initial auth check when the app loads.
 * Existing components using useAuth() will work without changes.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, refreshAuth } = useUserStore();
  const pathname = usePathname();
  const shouldBypassLoading = pathname === '/login' || pathname === '/register';

  // Trigger initial auth check on mount
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Show loading spinner while checking auth status
  if (isLoading && !shouldBypassLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
        <LoadingSpinner variant="orbital" size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}