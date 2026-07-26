/** Role levels - numeric comparison for authorization */
export const ROLES = {
  guest: 0,
  user: 1,
  moderator: 2,
  admin: 3,
  super_admin: 4,
} as const;

export type RoleName = keyof typeof ROLES;

export const ROLE_NAMES: RoleName[] = ['guest', 'user', 'moderator', 'admin', 'super_admin'];

export const POST_STATUS = {
  draft: 'draft',
  pending: 'pending',
  published: 'published',
  deleted: 'deleted',
} as const;

export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

/**
 * Reply statuses deliberately mirror POST_STATUS.
 *
 * Replies used to be written as `published` but counted as `active` (the value the
 * entity defaulted to and `getReplyCount` filtered on), so every post reported
 * zero replies. Keeping one vocabulary for both content types is what stops that
 * from happening again; historical `active` rows are normalised by
 * NormalizeReplyStatus.
 */
export const REPLY_STATUS = {
  pending: 'pending',
  published: 'published',
  deleted: 'deleted',
} as const;

export type ReplyStatus = (typeof REPLY_STATUS)[keyof typeof REPLY_STATUS];

/** Reply statuses that are visible to readers and counted in reply totals. */
export const VISIBLE_REPLY_STATUSES: ReplyStatus[] = [REPLY_STATUS.published];

/**
 * How many levels of nested replies are fetched and rendered.
 *
 * Serves two purposes: it keeps indentation readable, and it bounds the level-by-level
 * descendant query so a `parent_reply_id` cycle in bad data cannot loop forever.
 * Replies deeper than this are still stored, and still reachable from their parent's
 * permalink — they are just not expanded inline.
 */
export const MAX_REPLY_DEPTH = 5;

export const RESOURCE_STATUS = {
  pending: 'pending',
  approved: 'approved',
  published: 'published',
  rejected: 'rejected',
} as const;

export type ResourceStatus = (typeof RESOURCE_STATUS)[keyof typeof RESOURCE_STATUS];

export const PUBLIC_RESOURCE_STATUSES: ResourceStatus[] = [
  RESOURCE_STATUS.approved,
  RESOURCE_STATUS.published,
];

export const LOG_ACTIONS = {
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  POST_CREATE: 'post_create',
  POST_UPDATE: 'post_update',
  POST_DELETE: 'post_delete',
  POST_APPROVE: 'post_approve',
  POST_REJECT: 'post_reject',
  POST_PIN: 'post_pin',
  POST_MOVE: 'post_move',
  REPLY_CREATE: 'reply_create',
  REPLY_UPDATE: 'reply_update',
  REPLY_DELETE: 'reply_delete',
  USER_ROLE_CHANGE: 'user_role_change',
  BAN_CREATE: 'ban_create',
  BAN_UPDATE: 'ban_update',
  BAN_DELETE: 'ban_delete',
  SETTING_UPDATE: 'setting_update',
  CATEGORY_CREATE: 'category_create',
  CATEGORY_UPDATE: 'category_update',
  CATEGORY_DELETE: 'category_delete',
  TAG_CREATE: 'tag_create',
  TAG_UPDATE: 'tag_update',
  TAG_DELETE: 'tag_delete',
  TAG_MERGE: 'tag_merge',
  RESOURCE_APPROVE: 'resource_approve',
  RESOURCE_REJECT: 'resource_reject',
  RESOURCE_DELETE: 'resource_delete',
  CLEANUP_LOGS: 'cleanup_logs',
  CLEANUP_SESSIONS: 'cleanup_sessions',
  CLEANUP_SOFT_DELETED: 'cleanup_soft_deleted',
} as const;

export const PERMISSIONS: Record<string, RoleName[]> = {
  POST_EDIT_ANY: ['moderator', 'admin'],
  POST_DELETE_ANY: ['moderator', 'admin'],
  REPLY_EDIT_ANY: ['moderator', 'admin'],
  REPLY_DELETE_ANY: ['moderator', 'admin'],
  POST_APPROVE: ['moderator', 'admin'],
  POST_REJECT: ['moderator', 'admin'],
  BAN_MANAGE: ['admin'],
  SETTINGS_MANAGE: ['admin'],
  USER_MANAGE: ['admin'],
  CATEGORY_MANAGE: ['admin'],
  TAG_MANAGE: ['admin'],
  RESOURCE_MODERATE: ['moderator', 'admin'],
} as const;

export const NOTIFICATION_TYPES = {
  reply: 'reply',
  mention: 'mention',
  message: 'message',
  post_like: 'post_like',
  reply_like: 'reply_like',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
