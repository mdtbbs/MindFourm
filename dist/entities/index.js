"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopularSearch = exports.SearchHistory = exports.EmailLog = exports.PluginPermission = exports.PluginConfig = exports.PluginHook = exports.Plugin = exports.GroupChatMember = exports.GroupChat = exports.Purchase = exports.ShopItem = exports.GroupMember = exports.Group = exports.Follow = exports.UserBadge = exports.Badge = exports.Level = exports.PointRule = exports.PointLog = exports.SessionAudit = exports.OperationLog = exports.Setting = exports.Ban = exports.ReplyLike = exports.PostLike = exports.ResourceVersion = exports.ResourceCategory = exports.Resource = exports.Attachment = exports.Message = exports.Notification = exports.Bookmark = exports.PostTag = exports.Tag = exports.Category = exports.Reply = exports.Post = exports.User = exports.entities = void 0;
const user_entity_1 = require("./user.entity");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return user_entity_1.User; } });
const post_entity_1 = require("./post.entity");
Object.defineProperty(exports, "Post", { enumerable: true, get: function () { return post_entity_1.Post; } });
const reply_entity_1 = require("./reply.entity");
Object.defineProperty(exports, "Reply", { enumerable: true, get: function () { return reply_entity_1.Reply; } });
const category_entity_1 = require("./category.entity");
Object.defineProperty(exports, "Category", { enumerable: true, get: function () { return category_entity_1.Category; } });
const tag_entity_1 = require("./tag.entity");
Object.defineProperty(exports, "Tag", { enumerable: true, get: function () { return tag_entity_1.Tag; } });
const post_tag_entity_1 = require("./post-tag.entity");
Object.defineProperty(exports, "PostTag", { enumerable: true, get: function () { return post_tag_entity_1.PostTag; } });
const bookmark_entity_1 = require("./bookmark.entity");
Object.defineProperty(exports, "Bookmark", { enumerable: true, get: function () { return bookmark_entity_1.Bookmark; } });
const notification_entity_1 = require("./notification.entity");
Object.defineProperty(exports, "Notification", { enumerable: true, get: function () { return notification_entity_1.Notification; } });
const message_entity_1 = require("./message.entity");
Object.defineProperty(exports, "Message", { enumerable: true, get: function () { return message_entity_1.Message; } });
const attachment_entity_1 = require("./attachment.entity");
Object.defineProperty(exports, "Attachment", { enumerable: true, get: function () { return attachment_entity_1.Attachment; } });
const resource_entity_1 = require("./resource.entity");
Object.defineProperty(exports, "Resource", { enumerable: true, get: function () { return resource_entity_1.Resource; } });
const resource_category_entity_1 = require("./resource-category.entity");
Object.defineProperty(exports, "ResourceCategory", { enumerable: true, get: function () { return resource_category_entity_1.ResourceCategory; } });
const resource_version_entity_1 = require("./resource-version.entity");
Object.defineProperty(exports, "ResourceVersion", { enumerable: true, get: function () { return resource_version_entity_1.ResourceVersion; } });
const post_like_entity_1 = require("./post-like.entity");
Object.defineProperty(exports, "PostLike", { enumerable: true, get: function () { return post_like_entity_1.PostLike; } });
const reply_like_entity_1 = require("./reply-like.entity");
Object.defineProperty(exports, "ReplyLike", { enumerable: true, get: function () { return reply_like_entity_1.ReplyLike; } });
const ban_entity_1 = require("./ban.entity");
Object.defineProperty(exports, "Ban", { enumerable: true, get: function () { return ban_entity_1.Ban; } });
const setting_entity_1 = require("./setting.entity");
Object.defineProperty(exports, "Setting", { enumerable: true, get: function () { return setting_entity_1.Setting; } });
const operation_log_entity_1 = require("./operation-log.entity");
Object.defineProperty(exports, "OperationLog", { enumerable: true, get: function () { return operation_log_entity_1.OperationLog; } });
const session_audit_entity_1 = require("./session-audit.entity");
Object.defineProperty(exports, "SessionAudit", { enumerable: true, get: function () { return session_audit_entity_1.SessionAudit; } });
const point_log_entity_1 = require("./point-log.entity");
Object.defineProperty(exports, "PointLog", { enumerable: true, get: function () { return point_log_entity_1.PointLog; } });
const point_rule_entity_1 = require("./point-rule.entity");
Object.defineProperty(exports, "PointRule", { enumerable: true, get: function () { return point_rule_entity_1.PointRule; } });
const level_entity_1 = require("./level.entity");
Object.defineProperty(exports, "Level", { enumerable: true, get: function () { return level_entity_1.Level; } });
const badge_entity_1 = require("./badge.entity");
Object.defineProperty(exports, "Badge", { enumerable: true, get: function () { return badge_entity_1.Badge; } });
const user_badge_entity_1 = require("./user-badge.entity");
Object.defineProperty(exports, "UserBadge", { enumerable: true, get: function () { return user_badge_entity_1.UserBadge; } });
const follow_entity_1 = require("./follow.entity");
Object.defineProperty(exports, "Follow", { enumerable: true, get: function () { return follow_entity_1.Follow; } });
const group_entity_1 = require("./group.entity");
Object.defineProperty(exports, "Group", { enumerable: true, get: function () { return group_entity_1.Group; } });
const group_member_entity_1 = require("./group-member.entity");
Object.defineProperty(exports, "GroupMember", { enumerable: true, get: function () { return group_member_entity_1.GroupMember; } });
const shop_item_entity_1 = require("./shop-item.entity");
Object.defineProperty(exports, "ShopItem", { enumerable: true, get: function () { return shop_item_entity_1.ShopItem; } });
const purchase_entity_1 = require("./purchase.entity");
Object.defineProperty(exports, "Purchase", { enumerable: true, get: function () { return purchase_entity_1.Purchase; } });
const group_chat_entity_1 = require("./group-chat.entity");
Object.defineProperty(exports, "GroupChat", { enumerable: true, get: function () { return group_chat_entity_1.GroupChat; } });
const group_chat_member_entity_1 = require("./group-chat-member.entity");
Object.defineProperty(exports, "GroupChatMember", { enumerable: true, get: function () { return group_chat_member_entity_1.GroupChatMember; } });
const plugin_entity_1 = require("./plugin.entity");
Object.defineProperty(exports, "Plugin", { enumerable: true, get: function () { return plugin_entity_1.Plugin; } });
const plugin_hook_entity_1 = require("./plugin-hook.entity");
Object.defineProperty(exports, "PluginHook", { enumerable: true, get: function () { return plugin_hook_entity_1.PluginHook; } });
const plugin_config_entity_1 = require("./plugin-config.entity");
Object.defineProperty(exports, "PluginConfig", { enumerable: true, get: function () { return plugin_config_entity_1.PluginConfig; } });
const plugin_permission_entity_1 = require("./plugin-permission.entity");
Object.defineProperty(exports, "PluginPermission", { enumerable: true, get: function () { return plugin_permission_entity_1.PluginPermission; } });
const email_log_entity_1 = require("./email-log.entity");
Object.defineProperty(exports, "EmailLog", { enumerable: true, get: function () { return email_log_entity_1.EmailLog; } });
const search_history_entity_1 = require("./search-history.entity");
Object.defineProperty(exports, "SearchHistory", { enumerable: true, get: function () { return search_history_entity_1.SearchHistory; } });
const popular_search_entity_1 = require("./popular-search.entity");
Object.defineProperty(exports, "PopularSearch", { enumerable: true, get: function () { return popular_search_entity_1.PopularSearch; } });
exports.entities = [
    user_entity_1.User,
    post_entity_1.Post,
    reply_entity_1.Reply,
    category_entity_1.Category,
    tag_entity_1.Tag,
    post_tag_entity_1.PostTag,
    bookmark_entity_1.Bookmark,
    notification_entity_1.Notification,
    message_entity_1.Message,
    attachment_entity_1.Attachment,
    resource_entity_1.Resource,
    resource_category_entity_1.ResourceCategory,
    resource_version_entity_1.ResourceVersion,
    post_like_entity_1.PostLike,
    reply_like_entity_1.ReplyLike,
    ban_entity_1.Ban,
    setting_entity_1.Setting,
    operation_log_entity_1.OperationLog,
    session_audit_entity_1.SessionAudit,
    point_log_entity_1.PointLog,
    point_rule_entity_1.PointRule,
    level_entity_1.Level,
    badge_entity_1.Badge,
    user_badge_entity_1.UserBadge,
    follow_entity_1.Follow,
    group_entity_1.Group,
    group_member_entity_1.GroupMember,
    shop_item_entity_1.ShopItem,
    purchase_entity_1.Purchase,
    group_chat_entity_1.GroupChat,
    group_chat_member_entity_1.GroupChatMember,
    plugin_entity_1.Plugin,
    plugin_hook_entity_1.PluginHook,
    plugin_config_entity_1.PluginConfig,
    plugin_permission_entity_1.PluginPermission,
    email_log_entity_1.EmailLog,
    search_history_entity_1.SearchHistory,
    popular_search_entity_1.PopularSearch,
];
//# sourceMappingURL=index.js.map