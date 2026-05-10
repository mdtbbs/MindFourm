const ROLES = {
  guest: 0,
  user: 1,
  moderator: 2,
  admin: 3
};

const ROLE_NAMES = ['guest', 'user', 'moderator', 'admin'];

const POST_STATUS = {
  draft: 'draft',
  published: 'published',
  deleted: 'deleted'
};

const REPLY_STATUS = {
  active: 'active',
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
  CATEGORY_DELETE: 'category_delete'
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