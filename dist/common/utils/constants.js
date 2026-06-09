"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATION_TYPES = exports.PERMISSIONS = exports.LOG_ACTIONS = exports.REPLY_STATUS = exports.POST_STATUS = exports.ROLE_NAMES = exports.ROLES = void 0;
exports.ROLES = {
    guest: 0,
    user: 1,
    moderator: 2,
    admin: 3,
    super_admin: 4,
};
exports.ROLE_NAMES = ['guest', 'user', 'moderator', 'admin', 'super_admin'];
exports.POST_STATUS = {
    draft: 'draft',
    pending: 'pending',
    published: 'published',
    deleted: 'deleted',
};
exports.REPLY_STATUS = {
    active: 'active',
    pending: 'pending',
    deleted: 'deleted',
};
exports.LOG_ACTIONS = {
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
};
exports.PERMISSIONS = {
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
};
exports.NOTIFICATION_TYPES = {
    reply: 'reply',
    mention: 'mention',
    message: 'message',
    post_like: 'post_like',
    reply_like: 'reply_like',
};
//# sourceMappingURL=constants.js.map