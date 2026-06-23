/**
 * User Store - Zustand state management for user authentication
 *
 * Replaces the React Context implementation from lib/auth/context.tsx
 * Provides persistent user state across page refreshes
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '@/types';
import { authApi } from '@/lib/api/client';

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

        // Clear MindAuth session token from localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('mindauth_session_token');

          const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
          const currentUrl = window.location.href;
          const redirectUri = encodeURIComponent(currentUrl);
          let redirected = false;
          const redirectToMindAuthLogout = () => {
            if (redirected) return;
            redirected = true;
            window.location.href = `${mindauthUrl}/#/logout?redirect_uri=${redirectUri}`;
          };

          authApi.logout().finally(redirectToMindAuthLogout);
          window.setTimeout(redirectToMindAuthLogout, 1500);
        }
      },

      refreshAuth: async () => {
        try {
          set({ isLoading: true });

          // Check for MindAuth session token first
          const mindauthToken = typeof window !== 'undefined'
            ? localStorage.getItem('mindauth_session_token')
            : null;

          if (mindauthToken) {
            // Try to verify session
            try {
              await authApi.verifySession(mindauthToken);
            } catch {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('mindauth_session_token');
              }
            }
          }

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
  const store = useUserStore();

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    logout: store.logout,
    refreshAuth: store.refreshAuth,
  };
}
