import { User } from './user.entity';
import { Post } from './post.entity';
import { Reply } from './reply.entity';
import { Category } from './category.entity';
import { Tag } from './tag.entity';
import { PostTag } from './post-tag.entity';
import { Bookmark } from './bookmark.entity';
import { Notification } from './notification.entity';
import { AdminNotification } from './admin-notification.entity';
import { Message } from './message.entity';
import { Attachment } from './attachment.entity';
import { Resource } from './resource.entity';
import { ResourceCategory } from './resource-category.entity';
import { ResourceVersion } from './resource-version.entity';
import { PostLike } from './post-like.entity';
import { ReplyLike } from './reply-like.entity';
import { Ban } from './ban.entity';
import { Setting } from './setting.entity';
import { OperationLog } from './operation-log.entity';
import { SessionAudit } from './session-audit.entity';

// Phase 1: Points
import { PointLog } from './point-log.entity';
import { PointRule } from './point-rule.entity';

// Phase 2: Levels
import { Level } from './level.entity';

// Phase 3: Badges
import { Badge } from './badge.entity';
import { UserBadge } from './user-badge.entity';

// Phase 4: Follows
import { Follow } from './follow.entity';

// Phase 5: Groups
import { Group } from './group.entity';
import { GroupMember } from './group-member.entity';

// Phase 6: Shop
import { ShopItem } from './shop-item.entity';
import { Purchase } from './purchase.entity';

// Phase 7: Group Chat
import { GroupChat } from './group-chat.entity';
import { GroupChatMember } from './group-chat-member.entity';

// Phase 9: Plugins
import { Plugin } from './plugin.entity';
import { PluginHook } from './plugin-hook.entity';
import { PluginConfig } from './plugin-config.entity';
import { PluginPermission } from './plugin-permission.entity';

// Email
import { EmailLog } from './email-log.entity';

// Search
import { SearchHistory } from './search-history.entity';
import { PopularSearch } from './popular-search.entity';

// Resource Ratings
import { ResourceRating } from './resource-rating.entity';
import { Report } from './report.entity';
import { UserBlock } from './user-block.entity';
import { Reaction } from './reaction.entity';
import { PostRevision } from './post-revision.entity';
import { ExternalApiKey } from './external-api-key.entity';
import { ExternalApiAuditLog } from './external-api-audit-log.entity';
import { LanLinkQuickCode } from './lanlink-quick-code.entity';
import { Friendship } from './friendship.entity';
import { ResourceComment } from './resource-comment.entity';
import { LegalAcceptance } from './legal-acceptance.entity';
import { UserDataDeletionRequest } from './user-data-deletion-request.entity';

// P0-B: Resource aggregate
import { ResourceAttribution } from './resource-attribution.entity';
import { ResourceFile } from './resource-file.entity';
import { ResourceVersionDependency } from './resource-version-dependency.entity';
import { ResourceVersionCompatibility } from './resource-version-compatibility.entity';

// Phase 4 (refactor): Media
import { MediaAsset } from './media-asset.entity';
import { ResourceMediaLink } from './resource-media-link.entity';

// Phase 5 (refactor): Events
import { OutboxEvent } from './outbox-event.entity';

// Phase 7 (refactor): Community — Resource interactions
import { ResourceFavorite } from './resource-favorite.entity';
import { ResourceSubscription } from './resource-subscription.entity';

// Phase 8A (refactor): Game Versions
import { GameVersion } from './game-version.entity';
import { GameVersionBuild } from './game-version-build.entity';

// Phase 8B (refactor): Servers
import { GameServer } from './game-server.entity';
import { GameServerSnapshot } from './game-server-snapshot.entity';

// Phase 8C (refactor): Knowledge
import { KnowledgeArticle } from './knowledge-article.entity';
import { KnowledgeRevision } from './knowledge-revision.entity';

// Feedback
import { Feedback } from './feedback.entity';

export const entities = [
  User,
  Post,
  Reply,
  Category,
  Tag,
  PostTag,
  Bookmark,
  Notification,
  AdminNotification,
  Message,
  Attachment,
  Resource,
  ResourceCategory,
  ResourceVersion,
  PostLike,
  ReplyLike,
  Ban,
  Setting,
  OperationLog,
  SessionAudit,
  // Phase 1: Points
  PointLog,
  PointRule,
  // Phase 2: Levels
  Level,
  // Phase 3: Badges
  Badge,
  UserBadge,
  // Phase 4: Follows
  Follow,
  // Phase 5: Groups
  Group,
  GroupMember,
  // Phase 6: Shop
  ShopItem,
  Purchase,
  // Phase 7: Group Chat
  GroupChat,
  GroupChatMember,
  // Phase 9: Plugins
  Plugin,
  PluginHook,
  PluginConfig,
  PluginPermission,
  // Email
  EmailLog,
  // Search
  SearchHistory,
  PopularSearch,
  // Resource Ratings
  ResourceRating,
  // Moderation
  Report,
  // User-to-user controls and reactions
  UserBlock, Reaction,
  // Edit history
  PostRevision,
  // External API
  ExternalApiKey,
  ExternalApiAuditLog,
  // LanLink integration
  LanLinkQuickCode,
  // Friends
  Friendship,
  // Resource Comments
  ResourceComment,
  LegalAcceptance,
  UserDataDeletionRequest,
  // P0-B: Resource aggregate
  ResourceAttribution,
  ResourceFile,
  ResourceVersionDependency,
  ResourceVersionCompatibility,
  // Phase 4 (refactor): Media
  MediaAsset,
  ResourceMediaLink,
  // Phase 5 (refactor): Events
  OutboxEvent,
  // Phase 7 (refactor): Community — Resource interactions
  ResourceFavorite,
  ResourceSubscription,
  // Phase 8A (refactor): Game Versions
  GameVersion,
  GameVersionBuild,
  // Phase 8B (refactor): Servers
  GameServer,
  GameServerSnapshot,
  // Phase 8C (refactor): Knowledge
  KnowledgeArticle,
  KnowledgeRevision,
  // Feedback
  Feedback,
];

export {
  User, Post, Reply, Category, Tag, PostTag, Bookmark, Notification,
  AdminNotification,
  Message, Attachment, Resource, ResourceCategory, ResourceVersion,
  PostLike, ReplyLike, Ban, Setting, OperationLog, SessionAudit,
  // Phase 1: Points
  PointLog, PointRule,
  // Phase 2: Levels
  Level,
  // Phase 3: Badges
  Badge, UserBadge,
  // Phase 4: Follows
  Follow,
  // Phase 5: Groups
  Group, GroupMember,
  // Phase 6: Shop
  ShopItem, Purchase,
  // Phase 7: Group Chat
  GroupChat, GroupChatMember,
  // Phase 9: Plugins
  Plugin, PluginHook, PluginConfig, PluginPermission,
  // Email
  EmailLog,
  // Search
  SearchHistory,
  PopularSearch,
  // Resource Ratings
  ResourceRating,
  // Moderation
  Report,
  // User-to-user controls and reactions
  UserBlock, Reaction,
  // Edit history
  PostRevision,
  // External API
  ExternalApiKey,
  ExternalApiAuditLog,
  // LanLink integration
  LanLinkQuickCode,
  // Friends
  Friendship,
  // Resource Comments
  ResourceComment,
  LegalAcceptance,
  UserDataDeletionRequest,
  // P0-B: Resource aggregate
  ResourceAttribution, ResourceFile, ResourceVersionDependency, ResourceVersionCompatibility,
  // Phase 4 (refactor): Media
  MediaAsset, ResourceMediaLink,
  // Phase 5 (refactor): Events
  OutboxEvent,
  // Phase 7 (refactor): Community — Resource interactions
  ResourceFavorite, ResourceSubscription,
  // Phase 8A (refactor): Game Versions
  GameVersion, GameVersionBuild,
  // Phase 8B (refactor): Servers
  GameServer, GameServerSnapshot,
  // Phase 8C (refactor): Knowledge
  KnowledgeArticle, KnowledgeRevision,
  // Feedback
  Feedback,
};
