/**
 * Like Store - Zustand state management for post/reply likes
 *
 * Manages like states with optimistic updates
 * Supports both post likes and reply likes
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { likeApi } from '@/lib/api/client';
import { useUserStore } from './user-store';
import { registerUserScopedReset } from './reset-registry';

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

  /**
   * Record the server-rendered count for an item without marking it fetched.
   *
   * Nothing ever loaded like state, so every entry defaulted to `{liked:false,
   * count:0}` and `togglePostLike` computed its optimistic count from 0 — a post
   * with 42 likes showed "1" after a click. Seeding from the count already present
   * in the server-rendered markup fixes that without an extra request.
   */
  seedLikeState: (type: 'post' | 'reply', id: number, count: number) => void;

  /** Queue an item's like state for the next batched fetch. */
  ensureLikeState: (type: 'post' | 'reply', id: number) => void;

  // User stats
  fetchUserLikeCount: (userId: number) => Promise<void>;
}

const DEFAULT_LIKE_INFO: LikeInfo = { liked: false, count: 0 };

/**
 * Ids awaiting a like-state fetch, collected within one tick.
 *
 * Each LikeButton asks for its own state on mount; without coalescing, a 20-post
 * page would fire 20 separate round trips (the previous `fetchPostLikeStates` even
 * awaited them one at a time, serially). Requests still go out per id — the backend
 * has no batch endpoint yet — but they are deduplicated and issued in parallel.
 */
const pendingFetches = { post: new Set<number>(), reply: new Set<number>() };
const inFlight = { post: new Set<number>(), reply: new Set<number>() };
let flushScheduled = false;

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

    // Parallel, not the previous serial await-per-id.
    const results = await Promise.allSettled(
      postIds.map(async (postId) => ({ postId, state: await likeApi.checkPostLike(postId) })),
    );

    set((storeState) => {
      const postLikes = new Map(storeState.postLikes);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          postLikes.set(result.value.postId, result.value.state);
        }
      }
      return { postLikes };
    });
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

  seedLikeState: (type, id, count) => {
    set((state) => {
      const map = type === 'post' ? state.postLikes : state.replyLikes;
      const existing = map.get(id);
      // Never clobber a fetched or optimistically-updated entry.
      if (existing) return {};

      const next = new Map(map).set(id, { liked: false, count });
      return type === 'post' ? { postLikes: next } : { replyLikes: next };
    });
  },

  ensureLikeState: (type, id) => {
    if (!useUserStore.getState().isAuthenticated) return;
    if (inFlight[type].has(id)) return;

    pendingFetches[type].add(id);
    if (flushScheduled) return;

    flushScheduled = true;
    // Coalesce every button that mounted in this tick into one burst.
    queueMicrotask(() => {
      flushScheduled = false;
      const postIds = [...pendingFetches.post];
      const replyIds = [...pendingFetches.reply];
      pendingFetches.post.clear();
      pendingFetches.reply.clear();

      postIds.forEach((postId) => inFlight.post.add(postId));
      replyIds.forEach((replyId) => inFlight.reply.add(replyId));

      const store = useLikeStore.getState();
      Promise.allSettled([
        postIds.length ? store.fetchPostLikeStates(postIds) : Promise.resolve(),
        ...replyIds.map((replyId) => store.fetchReplyLikeState(replyId)),
      ]).finally(() => {
        postIds.forEach((postId) => inFlight.post.delete(postId));
        replyIds.forEach((replyId) => inFlight.reply.delete(replyId));
      });
    });
  },
}));

// The `liked` flags are per-viewer, so they must not survive a logout.
registerUserScopedReset(() => {
  pendingFetches.post.clear();
  pendingFetches.reply.clear();
  inFlight.post.clear();
  inFlight.reply.clear();
  useLikeStore.setState({
    postLikes: new Map(),
    replyLikes: new Map(),
    userLikeCount: 0,
  });
});

// Backward compatibility hook that matches existing useLikes signature
export function useLikes() {
  // Only the actions are selected here. Subscribing to the whole store (and thus to
  // `postLikes`, which is replaced wholesale on every toggle) re-rendered every
  // LikeButton on the page whenever anything anywhere was liked. Components that
  // need a specific item's state read it directly from the map — see LikeButton.
  const togglePostLike = useLikeStore((state) => state.togglePostLike);
  const getPostLikeState = useLikeStore((state) => state.getPostLikeState);
  const fetchPostLikeStates = useLikeStore((state) => state.fetchPostLikeStates);
  const toggleReplyLike = useLikeStore((state) => state.toggleReplyLike);
  const getReplyLikeState = useLikeStore((state) => state.getReplyLikeState);
  const fetchUserLikeCount = useLikeStore((state) => state.fetchUserLikeCount);
  const userLikeCount = useLikeStore((state) => state.userLikeCount);

  return useMemo(
    () => ({
      togglePostLike,
      getPostLikeState,
      fetchPostLikeStates,
      toggleReplyLike,
      getReplyLikeState,
      userLikeCount,
      fetchUserLikeCount,
    }),
    [
      togglePostLike,
      getPostLikeState,
      fetchPostLikeStates,
      toggleReplyLike,
      getReplyLikeState,
      userLikeCount,
      fetchUserLikeCount,
    ],
  );
}