/**
 * The reaction set is fixed server-side.
 *
 * A free-form emoji field is a user-controlled string that gets stored verbatim and
 * rendered on every viewer's page, and it makes the per-target aggregate unbounded —
 * one GROUP BY row per distinct value anyone ever submitted. Validating against this
 * list in the service (not only in the DTO) keeps that true for internal callers too.
 */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isAllowedEmoji(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}

/**
 * Sort position for display, with unknown values last.
 *
 * Rows whose emoji has since been removed from the list still exist in the table;
 * they sort to the end rather than being dropped, so shrinking the list does not
 * silently hide reactions users already made.
 */
export function emojiSortIndex(emoji: string): number {
  const index = (REACTION_EMOJIS as readonly string[]).indexOf(emoji);
  return index === -1 ? REACTION_EMOJIS.length : index;
}
