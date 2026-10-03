/**
 * Reaction Store - emoji reaction aggregates for posts and replies.
 *
 * Aggregates are held here rather than fetched per component because a post page
 * renders one ReactionBar for the post and one per reply — 50 mounted bars each
 * fetching on their own would be 50 round trips. Mounts within the same tick are
 * collected, deduplicated, and issued together.
 */

import { fetchInBatches } from '@/lib/api/batch';
import { create } from 'zustand';
import {
  REACTION_EMOJIS,
  compareReactionEmojis,
  reactionApi,
  type ReactionSummary,
  type ReactionTargetType,
} from '@/lib/api/reactions';
import { registerUserScopedReset } from './reset-registry';

interface ReactionState {
  postReactions: Map<number, ReactionSummary[]>;
  replyReactions: Map<number, ReactionSummary[]>;
  /** Server whitelist, seeded from the local mirror until `ensureEmojis` resolves. */
  emojis: readonly string[];

  /** Queue a target's aggregate for the next coalesced fetch. */
  ensureReactions: (type: ReactionTargetType, id: number) => void;
  /** Load the whitelist once per session. Safe to call from every bar. */
  ensureEmojis: () => void;
  /** Optimistically toggle, then reconcile with the server aggregate. Rejects on failure. */
  toggleReaction: (type: ReactionTargetType, id: number, emoji: string) => Promise<void>;
}

const EMPTY_REACTIONS: readonly ReactionSummary[] = [];

/**
 * Ids awaiting a fetch, collected within one tick, plus those already in flight so a
 * bar that mounts mid-request does not duplicate it.
 *
 * Module-level rather than store state: this is scheduling bookkeeping, and holding it
 * in the store would re-render every subscriber on each queue mutation.
 *
 * There is deliberately no "already fetched" set. Counts change while a reader is
 * elsewhere on the site, so a fresh mount refetches; the cached aggregate stays on
 * screen meanwhile, so the refetch is invisible unless the number actually moved.
 */
const pending: Record<ReactionTargetType, Set<number>> = { post: new Set(), reply: new Set() };
const inFlight: Record<ReactionTargetType, Set<number>> = { post: new Set(), reply: new Set() };
let flushScheduled = false;
let viewerGeneration = 0;
const mutations = new Map<string, number>();
let emojisRequested = false;

/**
 * Apply a toggle to a local aggregate.
 *
 * Zero-count entries are dropped rather than kept at 0 because the bar only renders
 * non-zero reactions; leaving them in would grow the list with every removal.
 */
function applyToggle(
  current: readonly ReactionSummary[],
  emoji: string,
  order: readonly string[],
): ReactionSummary[] {
  const existing = current.find((item) => item.emoji === emoji);

  if (!existing) {
    return [...current, { emoji, count: 1, reacted: true }].sort((a, b) =>
      compareReactionEmojis(order, a.emoji, b.emoji),
    );
  }

  return current
    .map((item) =>
      item.emoji === emoji
        ? { ...item, reacted: !item.reacted, count: item.reacted ? item.count - 1 : item.count + 1 }
        : item,
    )
    .filter((item) => item.count > 0);
}

function commitReactions(
  type: ReactionTargetType,
  entries: ReadonlyArray<{ id: number; reactions: ReactionSummary[] }>,
): void {
  if (entries.length === 0) return;

  useReactionStore.setState((state) => {
    if (type === 'post') {
      const postReactions = new Map(state.postReactions);
      entries.forEach(({ id, reactions }) => postReactions.set(id, reactions));
      return { postReactions };
    }
    const replyReactions = new Map(state.replyReactions);
    entries.forEach(({ id, reactions }) => replyReactions.set(id, reactions));
    return { replyReactions };
  });
}

/** One HTTP request per 100 targets; old viewers cannot repopulate the cache. */
async function fetchReactionsFor(type: ReactionTargetType, ids: number[]): Promise<void> {
  const generation = viewerGeneration;
  const versions = new Map(ids.map((id) => [id, mutations.get(`${type}:${id}`) ?? 0]));
  const rows = await fetchInBatches(ids, async (chunk) => (await reactionApi.listBatch(type, chunk)).reactions);
  if (generation !== viewerGeneration) return;
  commitReactions(type, ids.filter((id) => versions.get(id) === (mutations.get(`${type}:${id}`) ?? 0)).map((id) => ({ id, reactions: rows[id] ?? [] })));
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;

  queueMicrotask(() => {
    flushScheduled = false;
    const generation = viewerGeneration;
    const batches: Array<{ type: ReactionTargetType; ids: number[] }> = [
      { type: 'post', ids: [...pending.post] },
      { type: 'reply', ids: [...pending.reply] },
    ];
    pending.post.clear();
    pending.reply.clear();

    for (const { type, ids } of batches) {
      ids.forEach((id) => inFlight[type].add(id));
    }

    void Promise.allSettled(
      batches.map(({ type, ids }) => fetchReactionsFor(type, ids)),
    ).finally(() => {
      if (generation !== viewerGeneration) return;
      for (const { type, ids } of batches) {
        ids.forEach((id) => inFlight[type].delete(id));
      }
    });
  });
}

export const useReactionStore = create<ReactionState>((set, get) => ({
  postReactions: new Map(),
  replyReactions: new Map(),
  emojis: REACTION_EMOJIS,

  ensureReactions: (type, id) => {
    // Fetched while signed out too, unlike likes: the counts are public, and gating on
    // the session would leave anonymous readers looking at an empty bar.
    if (inFlight[type].has(id)) return;
    pending[type].add(id);
    scheduleFlush();
  },

  ensureEmojis: () => {
    if (emojisRequested) return;
    emojisRequested = true;

    reactionApi
      .emojis()
      .then(({ emojis }) => {
        if (Array.isArray(emojis) && emojis.length > 0) set({ emojis });
      })
      .catch(() => {
        // The local mirror stays usable; clear the flag so a later mount can retry.
        emojisRequested = false;
      });
  },

  toggleReaction: async (type, id, emoji) => {
    const generation = viewerGeneration;
    const key = `${type}:${id}`;
    const version = (mutations.get(key) ?? 0) + 1;
    mutations.set(key, version);
    const previous = (type === 'post' ? get().postReactions : get().replyReactions).get(id) ?? [];
    commitReactions(type, [{ id, reactions: applyToggle(previous, emoji, get().emojis) }]);

    try {
      const { reactions } = await reactionApi.toggle(type, id, emoji);
      // The server recomputes the aggregate with SQL COUNT, so this also picks up
      // reactions other users made while the request was in flight.
      if (generation === viewerGeneration && mutations.get(key) === version) commitReactions(type, [{ id, reactions }]);
    } catch (error) {
      if (generation === viewerGeneration && mutations.get(key) === version) commitReactions(type, [{ id, reactions: [...previous] }]);
      throw error;
    }
  },
}));

/** Read one target's aggregate without subscribing to unrelated targets' updates. */
export function useReactions(type: ReactionTargetType, id: number): readonly ReactionSummary[] {
  return useReactionStore(
    (state) => (type === 'post' ? state.postReactions : state.replyReactions).get(id) ?? EMPTY_REACTIONS,
  );
}

// The `reacted` flags are per-viewer, so the cached aggregates must not survive a
// logout — the next person signing in on this browser would inherit them.
registerUserScopedReset(() => {
  viewerGeneration += 1;
  mutations.clear();
  pending.post.clear();
  pending.reply.clear();
  inFlight.post.clear();
  inFlight.reply.clear();
  useReactionStore.setState({ postReactions: new Map(), replyReactions: new Map() });
});
