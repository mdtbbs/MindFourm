'use client';

import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { useLikes } from '@/lib/like/context';
import { useLikeStore } from '@/store/like-store';
import { useAuth } from '@/lib/auth/context';
import { useToast } from '@/lib/toast/context';

/** Kept in step with the button's transition duration. */
const LIKE_ANIMATION_MS = 200;

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

  const seedLikeState = useLikeStore((store) => store.seedLikeState);
  const ensureLikeState = useLikeStore((store) => store.ensureLikeState);

  const [isAnimating, setIsAnimating] = useState(false);

  // Seed from the server-rendered count so optimistic updates start from the real
  // number, then load the viewer's own liked flag (batched across all buttons).
  useEffect(() => {
    seedLikeState(type, id, initialCount);
    ensureLikeState(type, id);
  }, [type, id, initialCount, seedLikeState, ensureLikeState]);

  // Read the map directly so "not loaded yet" is distinguishable from a real zero:
  // falling back to `initialCount` whenever the count is 0 would resurrect a stale
  // number after the last like is removed.
  const stored = useLikeStore((store) =>
    type === 'post' ? store.postLikes.get(id) : store.replyLikes.get(id),
  );
  const liked = stored?.liked ?? false;
  const count = stored?.count ?? initialCount;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      showToast('请登录后点赞', 'info');
      return;
    }

    // Matches the transition duration below; a 300ms timer against a 200ms
    // transition left the button sitting at full scale for 100ms before snapping.
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), LIKE_ANIMATION_MS);

    if (type === 'post') {
      await likes.togglePostLike(id);
    } else {
      await likes.toggleReplyLike(id);
    }
  };

  return (
    <button
      onClick={handleClick}
      // `transition-transform`/`transition-colors` rather than `transition-all`:
      // only transform and opacity can be handled off the main thread.
      className={`inline-flex items-center gap-1.5 transition-[transform,color] duration-200 ${
        liked
          ? 'text-red-500 dark:text-red-400'
          : 'text-[var(--text-secondary)] hover:text-red-500 dark:hover:text-red-400'
      } ${isAnimating ? 'scale-125' : 'scale-100'} ${className}`}
      aria-label={liked ? '取消点赞' : '点赞'}
      aria-pressed={liked}
      title={liked ? '取消点赞' : '点赞'}
    >
      <Heart className={`w-4 h-4 transition-colors duration-200 ${liked ? 'fill-current' : ''}`} />
      {showCount && count > 0 && (
        <span className="text-xs font-medium">{count}</span>
      )}
    </button>
  );
}