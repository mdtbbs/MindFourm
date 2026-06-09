/**
 * Like Store - Zustand state management for post/reply likes
 *
 * Manages like states with optimistic updates
 * Supports both post likes and reply likes
 */

import { create } from 'zustand';
import { likeApi } from '@/lib/api/client';
import { useUserStore } from './user-store';

interface LikeInfo {
  liked: boolean;
  count: number;
}

interface LikeState {
  // Post likes: postId -> LikeInfo
  postLikes: Map<number, LikeInfo>;
  // Reply likes: replyId -> LikeInfo
  replyLikes: Map<number, LikeInfo>;
  // User's total like count
  userLikeCount: number;

  // Post actions
  togglePostLike: (postId: number) => Promise<void>;
  getPostLikeState: (postId: number) => LikeInfo;
  fetchPostLikeState: (postId: number) => Promise<void>;
  fetchPostLikeStates: (postIds: number[]) => Promise<void>;
  setPostLikeState: (postId: number, info: LikeInfo) => void;

  // Reply actions
  toggleReplyLike: (replyId: number) => Promise<void>;
  getReplyLikeState: (replyId: number) => LikeInfo;
  fetchReplyLikeState: (replyId: number) => Promise<void>;
  setReplyLikeState: (replyId: number, info: LikeInfo) => void;

  // User stats
  fetchUserLikeCount: (userId: number) => Promise<void>;
}

const DEFAULT_LIKE_INFO: LikeInfo = { liked: false, count: 0 };

export const useLikeStore = create<LikeState>((set, get) => ({
  postLikes: new Map(),
  replyLikes: new Map(),
  userLikeCount: 0,

  // Post like actions
  togglePostLike: async (postId: number) => {
    const userStore = useUserStore.getState();
    if (!userStore.isAuthenticated) {
      // Show login prompt (handled by UI component)
      return;
    }

    const currentState = get().postLikes.get(postId) || DEFAULT_LIKE_INFO;

    // Optimistic update
    const newState: LikeInfo = {
      liked: !currentState.liked,
      count: currentState.liked ? currentState.count - 1 : currentState.count + 1,
    };

    set((state) => ({
      postLikes: new Map(state.postLikes).set(postId, newState),
    }));

    try {
      if (newState.liked) {
        await likeApi.likePost(postId);
      } else {
        await likeApi.unlikePost(postId);
      }
    } catch (error) {
      // Revert on error
      set((state) => ({
        postLikes: new Map(state.postLikes).set(postId, currentState),
      }));
      console.error('Post like action failed:', error);
    }
  },

  getPostLikeState: (postId: number) => {
    return get().postLikes.get(postId) || DEFAULT_LIKE_INFO;
  },

  fetchPostLikeState: async (postId: number) => {
    try {
      const state = await likeApi.checkPostLike(postId);
      set((storeState) => ({
        postLikes: new Map(storeState.postLikes).set(postId, state),
      }));
    } catch (error) {
      console.error('Failed to fetch post like state:', error);
    }
  },

  fetchPostLikeStates: async (postIds: number[]) => {
    const userStore = useUserStore.getState();
    if (!userStore.isAuthenticated || postIds.length === 0) return;

    for (const postId of postIds) {
      try {
        const state = await likeApi.checkPostLike(postId);
        set((storeState) => ({
          postLikes: new Map(storeState.postLikes).set(postId, state),
        }));
      } catch (error) {
        // Skip on error, keep default state
      }
    }
  },

  setPostLikeState: (postId: number, info: LikeInfo) => {
    set((state) => ({
      postLikes: new Map(state.postLikes).set(postId, info),
    }));
  },

  // Reply like actions
  toggleReplyLike: async (replyId: number) => {
    const userStore = useUserStore.getState();
    if (!userStore.isAuthenticated) {
      return;
    }

    const currentState = get().replyLikes.get(replyId) || DEFAULT_LIKE_INFO;

    // Optimistic update
    const newState: LikeInfo = {
      liked: !currentState.liked,
      count: currentState.liked ? currentState.count - 1 : currentState.count + 1,
    };

    set((state) => ({
      replyLikes: new Map(state.replyLikes).set(replyId, newState),
    }));

    try {
      if (newState.liked) {
        await likeApi.likeReply(replyId);
      } else {
        await likeApi.unlikeReply(replyId);
      }
    } catch (error) {
      // Revert on error
      set((state) => ({
        replyLikes: new Map(state.replyLikes).set(replyId, currentState),
      }));
      console.error('Reply like action failed:', error);
    }
  },

  getReplyLikeState: (replyId: number) => {
    return get().replyLikes.get(replyId) || DEFAULT_LIKE_INFO;
  },

  fetchReplyLikeState: async (replyId: number) => {
    try {
      const state = await likeApi.checkReplyLike(replyId);
      set((storeState) => ({
        replyLikes: new Map(storeState.replyLikes).set(replyId, state),
      }));
    } catch (error) {
      console.error('Failed to fetch reply like state:', error);
    }
  },

  setReplyLikeState: (replyId: number, info: LikeInfo) => {
    set((state) => ({
      replyLikes: new Map(state.replyLikes).set(replyId, info),
    }));
  },

  // User stats
  fetchUserLikeCount: async (userId: number) => {
    try {
      const result = await likeApi.getUserLikeCount(userId);
      set({ userLikeCount: result.count });
    } catch (error) {
      console.error('Failed to fetch user like count:', error);
    }
  },
}));

// Backward compatibility hook that matches existing useLikes signature
export function useLikes() {
  const store = useLikeStore();
  const { isAuthenticated } = useUserStore();

  return {
    postLikes: store.postLikes,
    replyLikes: store.replyLikes,
    togglePostLike: store.togglePostLike,
    getPostLikeState: store.getPostLikeState,
    fetchPostLikeStates: store.fetchPostLikeStates,
    toggleReplyLike: store.toggleReplyLike,
    getReplyLikeState: store.getReplyLikeState,
    userLikeCount: store.userLikeCount,
    fetchUserLikeCount: store.fetchUserLikeCount,
  };
}