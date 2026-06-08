'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { api } from '@/lib/api/client';
import { UserPlus, UserCheck } from 'lucide-react';

export default function FollowButton({ targetUserId }: { targetUserId: number }) {
  const { user, isAuthenticated } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated || user?.id === targetUserId) return null;

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isFollowing) {
        await api.delete(`/follows/${targetUserId}?followerId=${user!.id}`);
        setIsFollowing(false);
      } else {
        await api.post(`/follows/${targetUserId}`, { followerId: user!.id });
        setIsFollowing(true);
      }
    } catch (err) {
      console.error('Follow toggle failed:', err);
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
