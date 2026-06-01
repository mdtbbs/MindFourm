'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { authApi } from '@/lib/api/client';
import LoadingSpinner from '@/components/ui/loading-spinner';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logout: () => {},
  refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const response = await authApi.check();
      if (response.authenticated) {
        setUser(response.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for MindAuth session token first
    const mindauthToken = localStorage.getItem('mindauth_session_token');
    if (mindauthToken) {
      // Try to verify session
      authApi.verifySession(mindauthToken)
        .then(() => refreshAuth())
        .catch(() => {
          localStorage.removeItem('mindauth_session_token');
          refreshAuth();
        });
    } else {
      refreshAuth();
    }
  }, [refreshAuth]);

  // 登出：先清除论坛 session，然后跳转到 MindAuth 登出页面
  const logout = useCallback(() => {
    // 先调用论坛登出 API（清除论坛 session + 撤销 OAuth tokens）
    authApi.logout().catch(() => {
      // 忽略错误，继续登出流程
    });

    // 清除本地状态
    setUser(null);
    localStorage.removeItem('mindauth_session_token');

    // 跳转到 MindAuth 登出页面，登出后返回当前页面
    const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
    const currentUrl = window.location.href;
    const redirectUri = encodeURIComponent(currentUrl);
    window.location.href = `${mindauthUrl}/#/logout?redirect_uri=${redirectUri}`;
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
        <LoadingSpinner variant="orbital" size="lg" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
