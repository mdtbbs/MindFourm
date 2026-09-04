'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { api } from '@/lib/api/client';
import { useToastStore } from '@/store/toast-store';
import { UserPlus, UserCheck } from 'lucide-react';

export default function FollowButton({ targetUserId }: { targetUserId: number }) {
  const { user, isAuthenticated } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user || user.id === targetUserId) {
      setChecking(false);
      return;
    }
    api.get<{ isFollowing: boolean }>(`/api/follows/check/${targetUserId}`)
      .then((res) => setIsFollowing(res.isFollowing || false))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [isAuthenticated, user, targetUserId]);

  if (!isAuthenticated || user?.id === targetUserId) return null;
  if (checking) return <div className="w-20 h-8 bg-surface-100 rounded animate-pulse" />;

  const handleToggle = async () => {
    setLoading(true);
    // Optimistic: revert below if the request fails.
    const previous = isFollowing;
    setIsFollowing(!previous);
    try {
      if (previous) {
        await api.delete(`/api/follows/${targetUserId}`);
      } else {
        await api.post(`/api/follows/${targetUserId}`);
      }
    } catch (err) {
      setIsFollowing(previous);
      useToastStore
        .getState()
        .showError(err instanceof Error ? err.message : (previous ? '取消关注失败' : '关注失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium transition-colors ${
        isFollowing
          ? 'bg-surface-100 text-surface-600 hover:bg-surface-200'
          : 'bg-primary text-white hover:bg-primary-dark'
      }`}
    >
      {isFollowing ? (
        <>
          <UserCheck className="w-4 h-4" />
          已关注
        </>
      ) : (
        <>
          <UserPlus className="w-4 h-4" />
          关注
        </>
      )}
    </button>
  );
}
