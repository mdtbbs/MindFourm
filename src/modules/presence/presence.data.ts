export type PresenceStatus = 'online' | 'hosting' | 'playing' | 'offline';

export interface PresenceData {
  status: PresenceStatus;
  room_code?: string;
  room_name?: string;
  node_name?: string;
  updated_at: number;
}

/** Redis key pattern for presence data. TTL is 120s; LanLink renews every 60s. */
export const PRESENCE_KEY_PREFIX = 'presence:';
export const PRESENCE_TTL_SECONDS = 120;

/** Minimum interval between friend_presence SSE pushes for the same user (seconds). */
export const PRESENCE_PUSH_COOLDOWN_SECONDS = 30;

export function presenceKey(userId: number): string {
  return `${PRESENCE_KEY_PREFIX}${userId}`;
}

export function parsePresenceUserId(key: string): number | null {
  if (!key.startsWith(PRESENCE_KEY_PREFIX)) return null;
  const id = parseInt(key.slice(PRESENCE_KEY_PREFIX.length), 10);
  return Number.isFinite(id) ? id : null;
}
