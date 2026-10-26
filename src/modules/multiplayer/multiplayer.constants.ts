/** Peer states that still reserve a Session slot, including the reconnect grace. */
export const MULTIPLAYER_CAPACITY_PEER_STATUSES = ['joining', 'active', 'disconnected'] as const;
export const MAX_ACTIVE_SESSIONS_PER_USER = 1;
export const MAX_PENDING_INVITES_PER_SENDER = 50;
export const MAX_PENDING_INVITES_PER_SESSION_TARGET = 1;
export const MAX_REALTIME_SESSION_SUBSCRIPTIONS = 32;
