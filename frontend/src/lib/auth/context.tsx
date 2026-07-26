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
import { useUserStore, useAuth } from '@/store/user-store';

// Re-export useAuth for backward compatibility
export { useAuth };

/**
 * AuthProvider - Initializes Zustand user store on mount
 *
 * This Provider triggers the initial auth check when the app loads.
 * Existing components using useAuth() will work without changes.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const refreshAuth = useUserStore((state) => state.refreshAuth);

  // Trigger initial auth check on mount
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // `children` renders unconditionally, and that is the point.
  //
  // This provider used to return a full-screen spinner while `isLoading` was true.
  // `isLoading` starts true and is only cleared by the effect above, which never runs
  // on the server — so every server-rendered page was a spinner and nothing else. No
  // headings, no post bodies, no per-page JSON-LD, and `notFound()` never executed
  // server-side, which is why deleted posts answered 200. The two routes that opted
  // out by pathname, /login and /register, were the only ones that ever server-rendered.
  //
  // Anything that genuinely needs to wait for the session reads `isLoading` from
  // `useAuth()` itself. Access control does not depend on this: `middleware.ts` gates
  // authenticated routes and the API authorises every request independently.
  return <>{children}</>;
}