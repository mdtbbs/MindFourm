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
import { CustomEmoji } from './custom-emoji.entity';
import { Resource } from './resource.entity';
import { ResourceUploadDraft } from './resource-upload-draft.entity';
import { ResourceCategory } from './resource-category.entity';
import { ResourceVersion } from './resource-version.entity';
import { PostLike } from './post-like.entity';
import { ReplyLike } from './reply-like.entity';
import { Ban } from './ban.entity';
import { Setting } from './setting.entity';
import { OperationLog } from './operation-log.entity';
import { SecurityAccessLog } from './security-access-log.entity';
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
import { SearchAudit } from './search-audit.entity';

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
import { ResourceDirectUploadSession } from './resource-direct-upload-session.entity';
import { ResourceVersionDependency } from './resource-version-dependency.entity';
import { ResourceVersionCompatibility } from './resource-version-compatibility.entity';
import {
  ResourceMember, ResourceRelation, ResourceReviewEvent, ResourceReviewAnnotation,
  ResourceAnalysisRun, ResourceAnalysisOverride, ResourceCompatibility,
  ResourceDependency, ResourceVersionDiff, ResourceSourceSync,
} from './resource-center-v2.entity';
import {
  ModProfile, ModIdAlias, ModVersionMetadata, ModContent, ModContentAlias,
  ModLocalization, ModCompatibilityReport, ModIssueReport, ModConflictReport, ModConflictMember,
} from './mod-resource-v2.entity';
import {
  SchematicVersionMetadata, SchematicBlock, SchematicMaterial,
  SchematicLogicProcessor, SchematicAnalysis,
} from './schematic-resource-v2.entity';
import {
  MapVersionMetadata, MapResourceEntry, MapSpawn, MapCore,
  MapWaveSummary, MapAnalysis, MapFeedback,
} from './map-resource-v2.entity';

// Phase 4 (refactor): Media
import { MediaAsset } from './media-asset.entity';
import { ResourceMediaLink } from './resource-media-link.entity';

// Phase 5 (refactor): Events
import { OutboxEvent } from './outbox-event.entity';

// Phase 7 (refactor): Community — Resource interactions
import { ResourceFavorite } from './resource-favorite.entity';
import { ResourceLike } from './resource-like.entity';
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
import { Notice } from './notice.entity';
import { NoticeRevision } from './notice-revision.entity';
import { MobileSession } from './mobile-session.entity';
import { MobileRefreshToken } from './mobile-refresh-token.entity';
import { DeveloperFeedEntry } from './developer-feed-entry.entity';
import { ServiceAccount } from './service-account.entity';
import { ContentRelation } from './content-relation.entity';
import { DownloadEvent } from './download-event.entity';
import { ResourceViewEvent } from './resource-view-event.entity';
import { ResourcePackItem } from './resource-pack-item.entity';
import { GameContentUploadSession } from './game-content-upload-session.entity';
import { ResourceSubmissionIdempotency } from './resource-submission-idempotency.entity';
import { ModReportAttachment } from './mod-report-attachment.entity';
import { SocialPrivacySetting } from './social-privacy-setting.entity';
import { UserPresencePreference } from './user-presence-preference.entity';
import { MultiplayerSession } from './multiplayer-session.entity';
import { MultiplayerPeer } from './multiplayer-peer.entity';
import { MultiplayerPeerResumeToken } from './multiplayer-peer-resume-token.entity';
import { MultiplayerInvite } from './multiplayer-invite.entity';
import { MultiplayerJoinIntent } from './multiplayer-join-intent.entity';
import { MultiplayerJoinRequest } from './multiplayer-join-request.entity';
import { MultiplayerRelayAllocation } from './multiplayer-relay-allocation.entity';
import { MultiplayerAuditLog } from './multiplayer-audit-log.entity';
import { GameSaveSlot } from './game-save-slot.entity';
import { GameSaveSnapshot } from './game-save-snapshot.entity';
import { GameSaveBlob } from './game-save-blob.entity';
import { GameSaveUploadSession } from './game-save-upload-session.entity';
import { GameSaveIdempotency } from './game-save-idempotency.entity';

/** Base forum, content and shared platform entities. */
export const coreEntities = [
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
  CustomEmoji,
  Resource,
  ResourceUploadDraft,
  ResourceSubmissionIdempotency,
  ModReportAttachment,
  ResourceCategory,
  ResourceVersion,
  PostLike,
  ReplyLike,
  Ban,
  Setting,
  OperationLog,
  SecurityAccessLog,
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
  SearchAudit,
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
  // Friends
  Friendship,
  // Resource Comments
  ResourceComment,
  LegalAcceptance,
  UserDataDeletionRequest,
  // P0-B: Resource aggregate
  ResourceAttribution,
  ResourceFile,
  ResourceDirectUploadSession,
  ResourceVersionDependency,
  ResourceVersionCompatibility,
  // Resource Center V2: these classes must be present in the root DataSource,
  // not only exported for feature-module imports.
  ResourceMember,
  ResourceRelation,
  ResourceReviewEvent,
  ResourceReviewAnnotation,
  ResourceAnalysisRun,
  ResourceAnalysisOverride,
  ResourceCompatibility,
  ResourceDependency,
  ResourceVersionDiff,
  ResourceSourceSync,
  ModProfile,
  ModIdAlias,
  ModVersionMetadata,
  ModContent,
  ModContentAlias,
  ModLocalization,
  ModCompatibilityReport,
  ModIssueReport,
  ModConflictReport,
  ModConflictMember,
  SchematicVersionMetadata,
  SchematicBlock,
  SchematicMaterial,
  SchematicLogicProcessor,
  SchematicAnalysis,
  MapVersionMetadata,
  MapResourceEntry,
  MapSpawn,
  MapCore,
  MapWaveSummary,
  MapAnalysis,
  MapFeedback,
  // Phase 4 (refactor): Media
  MediaAsset,
  ResourceMediaLink,
  // Phase 5 (refactor): Events
  OutboxEvent,
  // Phase 7 (refactor): Community — Resource interactions
  ResourceFavorite,
  ResourceLike,
  ResourceSubscription,
  // Phase 8C (refactor): Knowledge
  KnowledgeArticle,
  KnowledgeRevision,
  // Feedback
  Feedback,
  Notice,
  NoticeRevision,
  MobileSession,
  MobileRefreshToken,
  ServiceAccount,
  ContentRelation,
  DownloadEvent,
  ResourceViewEvent,
  ResourcePackItem,
  GameContentUploadSession,
  SocialPrivacySetting,
  UserPresencePreference,
  MultiplayerSession,
  MultiplayerPeer,
  MultiplayerPeerResumeToken,
  MultiplayerInvite,
  MultiplayerJoinIntent,
  MultiplayerJoinRequest,
  MultiplayerRelayAllocation,
  MultiplayerAuditLog,
];

/** Entities that belong to Mindustry/MDTBBS integrations rather than Community. */
export const mdtbbsEntities = [
  LanLinkQuickCode,
  GameVersion,
  GameVersionBuild,
  GameServer,
  GameServerSnapshot,
  DeveloperFeedEntry,
  GameSaveSlot,
  GameSaveSnapshot,
  GameSaveBlob,
  GameSaveUploadSession,
  GameSaveIdempotency,
] as const;

/** Runtime profile composition. MDTBBS remains the current and only profile. */
export const entities = [...coreEntities, ...mdtbbsEntities];

export {
  GameSaveSlot, GameSaveSnapshot, GameSaveBlob, GameSaveUploadSession, GameSaveIdempotency,
  User, Post, Reply, Category, Tag, PostTag, Bookmark, Notification,
  SocialPrivacySetting, UserPresencePreference, MultiplayerSession, MultiplayerPeer,
  MultiplayerPeerResumeToken, MultiplayerInvite, MultiplayerJoinIntent, MultiplayerJoinRequest,
  MultiplayerRelayAllocation, MultiplayerAuditLog,
  AdminNotification,
  Message, Attachment, CustomEmoji, Resource, ResourceCategory, ResourceVersion,
  PostLike, ReplyLike, Ban, Setting, OperationLog, SecurityAccessLog, SessionAudit,
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
  SearchAudit,
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
  // Friends
  Friendship,
  // Resource Comments
  ResourceComment,
  LegalAcceptance,
  UserDataDeletionRequest,
  // P0-B: Resource aggregate
  ResourceAttribution, ResourceFile, ResourceDirectUploadSession, ResourceVersionDependency, ResourceVersionCompatibility,
  ResourceMember, ResourceRelation, ResourceReviewEvent, ResourceReviewAnnotation,
  ResourceAnalysisRun, ResourceAnalysisOverride, ResourceCompatibility, ResourceDependency,
  ResourceVersionDiff, ResourceSourceSync,
  ModProfile, ModIdAlias, ModVersionMetadata, ModContent, ModContentAlias, ModLocalization,
  ModCompatibilityReport, ModIssueReport, ModConflictReport, ModConflictMember,
  ModReportAttachment,
  SchematicVersionMetadata, SchematicBlock, SchematicMaterial, SchematicLogicProcessor, SchematicAnalysis,
  MapVersionMetadata, MapResourceEntry, MapSpawn, MapCore, MapWaveSummary, MapAnalysis, MapFeedback,
  // Phase 4 (refactor): Media
  MediaAsset, ResourceMediaLink,
  // Phase 5 (refactor): Events
  OutboxEvent,
  // Phase 7 (refactor): Community — Resource interactions
  ResourceFavorite, ResourceLike, ResourceSubscription,
  // Phase 8A (refactor): Game Versions
  GameVersion, GameVersionBuild,
  // Phase 8B (refactor): Servers
  GameServer, GameServerSnapshot,
  // Phase 8C (refactor): Knowledge
  KnowledgeArticle, KnowledgeRevision,
  // Feedback
  Feedback,
  MobileSession, MobileRefreshToken,
  DeveloperFeedEntry,
  ContentRelation,
  DownloadEvent,
  ResourceViewEvent,
  ResourcePackItem,
  GameContentUploadSession,
  ServiceAccount,
};
