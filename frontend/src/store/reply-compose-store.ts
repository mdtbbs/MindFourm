/**
 * Reply Compose Store — the reply the composer is currently quoting or replying to.
 *
 * The quote and reply-to-reply buttons on each reply were permanently disabled:
 * `ReplyItem` derives them from `onQuote`/`onReply` props that the (server-rendered)
 * post detail page never passed, and `ReplyForm`'s `quoteReply`/`replyToReply` state
 * had no setter reachable from outside. So the feature was dead end to end.
 *
 * A store rather than prop drilling: the reply list is server-rendered for
 * performance, so there is no shared client parent to hold the state.
 */

import { create } from 'zustand';
import type { Reply } from '@/types';

export type ComposeMode = 'quote' | 'reply';

interface ReplyComposeState {
  /** The post whose composer the target belongs to, so stale targets are ignored. */
  postId: number | null;
  mode: ComposeMode | null;
  target: Reply | null;

  quote: (postId: number, reply: Reply) => void;
  replyTo: (postId: number, reply: Reply) => void;
  clear: () => void;
}

export const useReplyComposeStore = create<ReplyComposeState>((set) => ({
  postId: null,
  mode: null,
  target: null,

  quote: (postId, reply) => set({ postId, mode: 'quote', target: reply }),
  replyTo: (postId, reply) => set({ postId, mode: 'reply', target: reply }),
  clear: () => set({ postId: null, mode: null, target: null }),
}));

/**
 * The compose target for one post, or nulls when nothing is selected.
 */
export function useReplyComposeTarget(postId: number): {
  quoteReply: Reply | null;
  replyToReply: Reply | null;
} {
  const mode = useReplyComposeStore((state) => (state.postId === postId ? state.mode : null));
  const target = useReplyComposeStore((state) => (state.postId === postId ? state.target : null));

  return {
    quoteReply: mode === 'quote' ? target : null,
    replyToReply: mode === 'reply' ? target : null,
  };
}
