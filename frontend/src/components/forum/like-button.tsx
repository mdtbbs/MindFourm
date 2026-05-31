'use client';

import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { useLikes } from '@/lib/like/context';
import { useAuth } from '@/lib/auth/context';
import { useToast } from '@/lib/toast/context';

interface LikeButtonProps {
  type: 'post' | 'reply';
  id: number;
  initialCount?: number;
  className?: string;
  showCount?: boolean;
}

export function LikeButton({ type, id, initialCount = 0, className = '', showCount = true }: LikeButtonProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const likes = useLikes();

  const [isAnimating, setIsAnimating] = useState(false);

  const state = type === 'post' ? likes.getPostLikeState(id) : likes.getReplyLikeState(id);
  const liked = state.liked;
  const count = state.count || initialCount;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      showToast('请登录后点赞', 'info');
      return;
    }

    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    if (type === 'post') {
      await likes.togglePostLike(id);
    } else {
      await likes.toggleReplyLike(id);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 transition-all duration-200 ${
        liked
          ? 'text-red-500 dark:text-red-400'
          : 'text-[var(--text-secondary)] hover:text-red-500 dark:hover:text-red-400'
      } ${isAnimating ? 'scale-125' : 'scale-100'} ${className}`}
      aria-label={liked ? '取消点赞' : '点赞'}
      title={liked ? '取消点赞' : '点赞'}
    >
      <Heart
        className={`w-4 h-4 transition-all duration-200 ${liked ? 'fill-current' : ''}`}
      />
      {showCount && count > 0 && (
        <span className="text-xs font-medium">{count}</span>
      )}
    </button>
  );
}