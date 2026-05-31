'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { likeApi } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';

interface LikeState {
  // Post likes: postId -> { liked, count }
  postLikes: Map<number, { liked: boolean; count: number }>;
  // Reply likes: replyId -> { liked, count }
  replyLikes: Map<number, { liked: boolean; count: number }>;
}

interface LikeContextType extends LikeState {
  // Post like actions
  togglePostLike: (postId: number) => Promise<void>;
  getPostLikeState: (postId: number) => { liked: boolean; count: number };
  fetchPostLikeStates: (postIds: number[]) => Promise<void>;

  // Reply like actions
  toggleReplyLike: (replyId: number) => Promise<void>;
  getReplyLikeState: (replyId: number) => { liked: boolean; count: number };

  // User stats
  userLikeCount: number;
  fetchUserLikeCount: (userId: number) => Promise<void>;
}

const LikeContext = createContext<LikeContextType | null>(null);

export function useLikes() {
  const context = useContext(LikeContext);
  if (!context) {
    // Return a default context for use outside provider (e.g., in SSR)
    return {
      postLikes: new Map(),
      replyLikes: new Map(),
      togglePostLike: async () => {},
      getPostLikeState: () => ({ liked: false, count: 0 }),
      fetchPostLikeStates: async () => {},
      toggleReplyLike: async () => {},
      getReplyLikeState: () => ({ liked: false, count: 0 }),
      userLikeCount: 0,
      fetchUserLikeCount: async () => {},
    };
  }
  return context;
}

export function LikeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [postLikes, setPostLikes] = useState<Map<number, { liked: boolean; count: number }>>(new Map());
  const [replyLikes, setReplyLikes] = useState<Map<number, { liked: boolean; count: number }>>(new Map());
  const [userLikeCount, setUserLikeCount] = useState(0);

  // Toggle post like
  const togglePostLike = useCallback(async (postId: number) => {
    if (!user) {
      // Show toast提示登录
      return;
    }

    const currentState = postLikes.get(postId) || { liked: false, count: 0 };

    // Optimistic update
    const newState = {
      liked: !currentState.liked,
      count: currentState.liked ? currentState.count - 1 : currentState.count + 1,
    };
    setPostLikes(prev => new Map(prev).set(postId, newState));

    try {
      if (newState.liked) {
        await likeApi.likePost(postId);
      } else {
        await likeApi.unlikePost(postId);
      }
    } catch (error) {
      // Revert on error
      setPostLikes(prev => new Map(prev).set(postId, currentState));
      console.error('Like action failed:', error);
    }
  }, [user, postLikes]);

  // Get post like state
  const getPostLikeState = useCallback((postId: number) => {
    return postLikes.get(postId) || { liked: false, count: 0 };
  }, [postLikes]);

  // Batch fetch post like states
  const fetchPostLikeStates = useCallback(async (postIds: number[]) => {
    if (!user || postIds.length === 0) return;

    // For now, fetch individually (can optimize with batch API later)
    const results = new Map<number, { liked: boolean; count: number }>();

    for (const postId of postIds) {
      try {
        const state = await likeApi.checkPostLike(postId);
        results.set(postId, state);
      } catch (error) {
        results.set(postId, { liked: false, count: 0 });
      }
    }

    setPostLikes(prev => {
      const merged = new Map(prev);
      for (const [id, state] of results) {
        merged.set(id, state);
      }
      return merged;
    });
  }, [user]);

  // Toggle reply like
  const toggleReplyLike = useCallback(async (replyId: number) => {
    if (!user) {
      return;
    }

    const currentState = replyLikes.get(replyId) || { liked: false, count: 0 };

    // Optimistic update
    const newState = {
      liked: !currentState.liked,
      count: currentState.liked ? currentState.count - 1 : currentState.count + 1,
    };
    setReplyLikes(prev => new Map(prev).set(replyId, newState));

    try {
      if (newState.liked) {
        await likeApi.likeReply(replyId);
      } else {
        await likeApi.unlikeReply(replyId);
      }
    } catch (error) {
      // Revert on error
      setReplyLikes(prev => new Map(prev).set(replyId, currentState));
      console.error('Like action failed:', error);
    }
  }, [user, replyLikes]);

  // Get reply like state
  const getReplyLikeState = useCallback((replyId: number) => {
    return replyLikes.get(replyId) || { liked: false, count: 0 };
  }, [replyLikes]);

  // Fetch user like count
  const fetchUserLikeCount = useCallback(async (userId: number) => {
    try {
      const result = await likeApi.getUserLikeCount(userId);
      setUserLikeCount(result.count);
    } catch (error) {
      console.error('Failed to fetch user like count:', error);
    }
  }, []);

  return (
    <LikeContext.Provider
      value={{
        postLikes,
        replyLikes,
        togglePostLike,
        getPostLikeState,
        fetchPostLikeStates,
        toggleReplyLike,
        getReplyLikeState,
        userLikeCount,
        fetchUserLikeCount,
      }}
    >
      {children}
    </LikeContext.Provider>
  );
}