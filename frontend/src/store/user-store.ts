/**
 * User Store - Zustand state management for user authentication
 *
 * Replaces the React Context implementation from lib/auth/context.tsx
 * Provides persistent user state across page refreshes
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '@/types';
import { authApi, resetApiCache } from '@/lib/api/client';
import { clearUserScopedState } from './reset-registry';

/** Upper bound on how long logout waits for the server before navigating away. */
const LOGOUT_TIMEOUT_MS = 5000;

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) => {
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        });
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });

        // Drop every other user's cached/persisted state too. Resetting only this
        // store left the previous account's unread count, settings and like states
        // in place — and the response cache serving their data for up to 30s.
        resetApiCache();
        clearUserScopedState();

        if (typeof window !== 'undefined') {
          const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
          const redirectUri = encodeURIComponent(window.location.href);
          const logoutUrl = `${mindauthUrl}/logout?redirect_uri=${redirectUri}`;

          // Wait for the forum session to actually be destroyed before leaving. The
          // previous version raced a 1.5s timer against the request, so a slow
          // response meant navigating away with the session still alive. The cap is
          // now generous enough to normally complete, but still bounded so a hung
          // request cannot trap the user on the page.
          const logoutRequest = authApi.logout().catch(() => undefined);
          const timeout = new Promise<void>((resolve) =>
            window.setTimeout(resolve, LOGOUT_TIMEOUT_MS),
          );

          Promise.race([logoutRequest, timeout]).finally(() => {
            window.location.href = logoutUrl;
          });
        }
      },

      refreshAuth: async () => {
        try {
          set({ isLoading: true });

          // The session lives in the HttpOnly `forum_session` cookie, so there is
          // nothing to verify client-side. (A previous branch here read a
          // `mindauth_session_token` from localStorage that nothing ever wrote, and
          // POSTed it to a route that was never registered.)
          const response = await authApi.check();
          if (response.authenticated) {
            set({
              user: response.user || null,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist user and isAuthenticated, not isLoading
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Export hooks for backward compatibility with existing components
// This allows gradual migration without breaking existing code
export function useAuth() {
  // Field-level selectors rather than a bare `useUserStore()`, which subscribed
  // every consumer to the entire store.
  const user = useUserStore((state) => state.user);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const isLoading = useUserStore((state) => state.isLoading);
  const logout = useUserStore((state) => state.logout);
  const refreshAuth = useUserStore((state) => state.refreshAuth);

  return useMemo(
    () => ({ user, isAuthenticated, isLoading, logout, refreshAuth }),
    [user, isAuthenticated, isLoading, logout, refreshAuth],
  );
}
