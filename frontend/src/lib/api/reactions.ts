import { requestJson } from '@/lib/api/request-json';

export type ReactionTargetType = 'post' | 'reply';

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the signed-in viewer reacted with this emoji; always false when signed out. */
  reacted: boolean;
}

/**
 * Local mirror of the server whitelist, used only as the picker's starting content.
 *
 * The list is fetched from `/api/reactions/emojis` once per session and replaces this
 * one, so the two can diverge without breaking anything — but shipping a copy means
 * the picker is usable on first paint instead of empty until a round trip lands.
 */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

/**
 * Display order, with emojis missing from the current whitelist last.
 *
 * Reactions made before an emoji was retired still come back from the API; they sort
 * to the end rather than disappearing. Mirrors the server's own ordering so an
 * optimistically inserted reaction lands where the server will put it, instead of
 * jumping position when the response arrives.
 */
export function compareReactionEmojis(order: readonly string[], a: string, b: string): number {
  const indexOf = (emoji: string) => {
    const index = order.indexOf(emoji);
    return index === -1 ? order.length : index;
  };
  return indexOf(a) - indexOf(b) || a.localeCompare(b);
}

export const reactionApi = {
  emojis: () => requestJson<{ emojis: string[] }>('/api/reactions/emojis'),

  /** Public: the `reacted` flags come from the session cookie when there is one. */
  listFor: (targetType: ReactionTargetType, targetId: number) =>
    requestJson<{ reactions: ReactionSummary[] }>(`/api/reactions/${targetType}/${targetId}`),

  /** Toggle — reacting again with the same emoji removes it. Returns the fresh aggregate. */
  toggle: (targetType: ReactionTargetType, targetId: number, emoji: string) =>
    requestJson<{ reactions: ReactionSummary[] }>(`/api/reactions/${targetType}/${targetId}`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
};
