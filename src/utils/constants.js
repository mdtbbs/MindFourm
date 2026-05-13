const ROLES = {
  guest: 0,
  user: 1,
  moderator: 2,
  admin: 3
};

const ROLE_NAMES = ['guest', 'user', 'moderator', 'admin'];

const POST_STATUS = {
  draft: 'draft',
  pending: 'pending',
  published: 'published',
  deleted: 'deleted'
};

const REPLY_STATUS = {
  active: 'active',
  pending: 'pending',
  deleted: 'deleted'
};

const LOG_ACTIONS = {
  POST_CREATE: 'post_create',
  POST_EDIT: 'post_edit',
  POST_DELETE: 'post_delete',
  POST_PIN: 'post_pin',
  POST_MOVE: 'post_move',
  REPLY_CREATE: 'reply_create',
  REPLY_EDIT: 'reply_edit',
  REPLY_DELETE: 'reply_delete',
  USER_ROLE_CHANGE: 'user_role_change',
  CATEGORY_CREATE: 'category_create',
  CATEGORY_EDIT: 'category_edit',
  CATEGORY_DELETE: 'category_delete',
  SETTINGS_UPDATE: 'settings_update',
  POST_BULK_DELETE: 'post_bulk_delete',
  POST_BULK_PIN: 'post_bulk_pin',
  POST_BULK_MOVE: 'post_bulk_move',
  TAG_CREATE: 'tag_create',
  TAG_UPDATE: 'tag_update',
  TAG_DELETE: 'tag_delete',
  TAG_MERGE: 'tag_merge',
  MODERATION_APPROVE: 'moderation_approve',
  MODERATION_REJECT: 'moderation_reject',
  BAN_CREATE: 'ban_create',
  BAN_DEACTIVATE: 'ban_deactivate',
  CLEANUP_SESSIONS: 'cleanup_sessions',
  CLEANUP_LOGS: 'cleanup_logs',
  CLEANUP_SOFT_DELETED: 'cleanup_soft_deleted'
};

const PERMISSIONS = {
  POST_CREATE: ['user', 'moderator', 'admin'],
  POST_EDIT_OWN: ['user', 'moderator', 'admin'],
  POST_EDIT_ANY: ['moderator', 'admin'],
  POST_DELETE_OWN: ['user', 'moderator', 'admin'],
  POST_DELETE_ANY: ['moderator', 'admin'],
  POST_PIN: ['moderator', 'admin'],
  POST_MOVE: ['moderator', 'admin'],
  REPLY_CREATE: ['user', 'moderator', 'admin'],
  REPLY_EDIT_OWN: ['user', 'moderator', 'admin'],
  REPLY_EDIT_ANY: ['moderator', 'admin'],
  REPLY_DELETE_OWN: ['user', 'moderator', 'admin'],
  REPLY_DELETE_ANY: ['moderator', 'admin'],
  CATEGORY_MANAGE: ['admin'],
  USER_ROLE_MANAGE: ['admin'],
  LOGS_VIEW: ['admin']
};

module.exports = {
  ROLES,
  ROLE_NAMES,
  POST_STATUS,
  REPLY_STATUS,
  LOG_ACTIONS,
  PERMISSIONS
};