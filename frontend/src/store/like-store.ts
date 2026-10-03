/**
 * Like Store - Zustand state management for post/reply likes
 *
 * Manages like states with optimistic updates
 * Supports both post likes and reply likes
 */

import { fetchInBatches } from '@/lib/api/batch';
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

/** Collect button mounts into one bounded HTTP request per target type. */
const pendingFetches = { post: new Set<number>(), reply: new Set<number>() };
const inFlight = { post: new Set<number>(), reply: new Set<number>() };
let flushScheduled = false;
let viewerGeneration = 0;
const mutations = new Map<string, number>();

async function fetchLikeStates(type: 'post' | 'reply', ids: number[]): Promise<void> {
  const generation = viewerGeneration;
  const versions = new Map(ids.map((id) => [id, mutations.get(`${type}:${id}`) ?? 0]));
  try {
    const rows = await fetchInBatches(ids, (chunk) => likeApi.checkBatch(type, chunk));
    if (generation !== viewerGeneration) return;
    useLikeStore.setState((state) => {
      const next = new Map(type === 'post' ? state.postLikes : state.replyLikes);
      for (const id of ids) {
        if (versions.get(id) === (mutations.get(`${type}:${id}`) ?? 0)) next.set(id, rows[id] ?? { liked: false, count: 0 });
      }
      return type === 'post' ? { postLikes: next } : { replyLikes: next };
    });
  } catch (error) {
    console.error('Failed to fetch like states:', error);
  }
}

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

    const generation = viewerGeneration;
    const key = `post:${postId}`;
    const version = (mutations.get(key) ?? 0) + 1;
    mutations.set(key, version);
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
      // Revert on error only for the viewer who started the action.
      if (generation !== viewerGeneration || mutations.get(key) !== version) return;
      set((state) => ({
        postLikes: new Map(state.postLikes).set(postId, currentState),
      }));
      console.error('Post like action failed:', error);
    }
  },

  getPostLikeState: (postId: number) => {
    return get().postLikes.get(postId) || DEFAULT_LIKE_INFO;
  },

  fetchPostLikeState: (id) => fetchLikeStates('post', [id]),
  fetchPostLikeStates: (ids) => fetchLikeStates('post', ids),

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

    const generation = viewerGeneration;
    const key = `reply:${replyId}`;
    const version = (mutations.get(key) ?? 0) + 1;
    mutations.set(key, version);
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
      // Revert on error only for the viewer who started the action.
      if (generation !== viewerGeneration || mutations.get(key) !== version) return;
      set((state) => ({
        replyLikes: new Map(state.replyLikes).set(replyId, currentState),
      }));
      console.error('Reply like action failed:', error);
    }
  },

  getReplyLikeState: (replyId: number) => {
    return get().replyLikes.get(replyId) || DEFAULT_LIKE_INFO;
  },

  fetchReplyLikeState: (id) => fetchLikeStates('reply', [id]),

  setReplyLikeState: (replyId: number, info: LikeInfo) => {
    set((state) => ({
      replyLikes: new Map(state.replyLikes).set(replyId, info),
    }));
  },

  // User stats
  fetchUserLikeCount: async (userId: number) => {
    const generation = viewerGeneration;
    try {
      const result = await likeApi.getUserLikeCount(userId);
      if (generation === viewerGeneration) set({ userLikeCount: result.count });
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
      const generation = viewerGeneration;
      const postIds = [...pendingFetches.post];
      const replyIds = [...pendingFetches.reply];
      pendingFetches.post.clear();
      pendingFetches.reply.clear();

      postIds.forEach((postId) => inFlight.post.add(postId));
      replyIds.forEach((replyId) => inFlight.reply.add(replyId));

      Promise.allSettled([
        fetchLikeStates('post', postIds),
        fetchLikeStates('reply', replyIds),
      ]).finally(() => {
        if (generation !== viewerGeneration) return;
        postIds.forEach((postId) => inFlight.post.delete(postId));
        replyIds.forEach((replyId) => inFlight.reply.delete(replyId));
      });
    });
  },
}));

// The `liked` flags are per-viewer, so they must not survive a logout.
registerUserScopedReset(() => {
  viewerGeneration += 1;
  mutations.clear();
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