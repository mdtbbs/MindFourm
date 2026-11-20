---
name: MindFourm-API
description: 调用 MindFourm 公开 V1 API（论坛讨论、资源中心、云存档、联机会话等）的完整技能包。需要设置 $FORUM_BASE_URL 与 $ACCESS_TOKEN 环境变量。
requires:
  bins: [curl]
  env: [FORUM_BASE_URL]
---

# MindFourm API 技能文档

本技能包由 `openapi-public-v1.json` 生成，覆盖公开 V1 契约中的全部接口。
每个接口一个文档，包含认证要求、权限范围、参数、响应结构与可直接运行的 curl 示例。

## 基础配置

- `$FORUM_BASE_URL`：站点地址，例如 `https://mdtbbs.cn`。
- `$ACCESS_TOKEN`：MindAuth access token；公开接口无需携带。
- 请求头：认证用 `Authorization: Bearer <token>`；JSON 请求体用 `Content-Type: application/json`。

## 约定

- JSON 接口返回 `{ data, meta }` 信封；错误返回 `{ error, meta }`，详见 [errors-v1.md](../errors-v1.md)。
- 控制流应依据 HTTP 状态码与稳定的 `error.code`，不要匹配 `message` 文案。
- 限流、权限范围按接口分别声明，见各接口文档的「认证与权限」。
- 文件、图片与重定向接口返回原始内容，不走 JSON 信封。

## 接口索引

### v1Blobs

| 接口 | 说明 |
| --- | --- |
| [BlobsController_quota](./v1blobs/blobscontroller_quota.md) | 查看 blob 空间用量 |
| [BlobsController_list](./v1blobs/blobscontroller_list.md) | 列出我的 blob |
| [BlobsController_create](./v1blobs/blobscontroller_create.md) | 创建 blob 上传 |
| [BlobsController_upload](./v1blobs/blobscontroller_upload.md) | 上传 blob 内容 |
| [BlobsController_commit](./v1blobs/blobscontroller_commit.md) | 提交 blob |
| [BlobsController_cancel](./v1blobs/blobscontroller_cancel.md) | 取消上传 |
| [BlobsController_get](./v1blobs/blobscontroller_get.md) | 查看 blob 详情 |
| [BlobsController_remove](./v1blobs/blobscontroller_remove.md) | 删除 blob |
| [BlobsController_update](./v1blobs/blobscontroller_update.md) | 更新 blob 元数据 |
| [BlobsController_content](./v1blobs/blobscontroller_content.md) | 下载 blob 内容 |

### v1Bookmarks

| 接口 | 说明 |
| --- | --- |
| [BookmarksV1Controller_list](./v1bookmarks/bookmarksv1controller_list.md) | GET /v1/me/bookmarks |

### v1Capabilities

| 接口 | 说明 |
| --- | --- |
| [CapabilitiesController_getCapabilities](./v1capabilities/capabilitiescontroller_getcapabilities.md) | GET /v1/capabilities |

### v1Client

| 接口 | 说明 |
| --- | --- |
| [ClientConfigV1Controller_config](./v1client/clientconfigv1controller_config.md) | GET /v1/client/config |

### v1Discover

| 接口 | 说明 |
| --- | --- |
| [DiscoverV1Controller_getSummary](./v1discover/discoverv1controller_getsummary.md) | GET /v1/discover |

### v1EditorTools

| 接口 | 说明 |
| --- | --- |
| [getEditorToolStatus](./v1editortools/geteditortoolstatus.md) | 读取在线地图与蓝图编辑器的实际可用状态 |
| [getMindustryEditorContentCatalog](./v1editortools/getmindustryeditorcontentcatalog.md) | 读取固定 Mindustry 运行时生成的可编辑内容目录 |
| [createStandaloneMindustryEditorFile](./v1editortools/createstandalonemindustryeditorfile.md) | 通过官方 Mindustry 写入器创建空白蓝图或地图 |
| [analyzeEditorSourceFile](./v1editortools/analyzeeditorsourcefile.md) | 安全分析普通在线编辑器上传的本地地图或蓝图文件 |
| [exportStandaloneSchematicEdit](./v1editortools/exportstandaloneschematicedit.md) | 通过官方 Schematics 读写导出本地蓝图编辑结果 |
| [exportStandaloneMapEdit](./v1editortools/exportstandalonemapedit.md) | 通过官方 MapIO 读写导出本地地图编辑结果 |

### v1Feedback

| 接口 | 说明 |
| --- | --- |
| [FeedbackV1Controller_submit](./v1feedback/feedbackv1controller_submit.md) | POST /v1/feedback |

### v1Friends

| 接口 | 说明 |
| --- | --- |
| [FriendsV1Controller_list](./v1friends/friendsv1controller_list.md) | GET /v1/friends |
| [FriendsV1Controller_requests](./v1friends/friendsv1controller_requests.md) | GET /v1/friends/requests |
| [FriendsV1Controller_create](./v1friends/friendsv1controller_create.md) | POST /v1/friends/requests |
| [FriendsV1Controller_accept](./v1friends/friendsv1controller_accept.md) | POST /v1/friends/requests/{id}/accept |
| [FriendsV1Controller_reject](./v1friends/friendsv1controller_reject.md) | POST /v1/friends/requests/{id}/reject |
| [FriendsV1Controller_remove](./v1friends/friendsv1controller_remove.md) | DELETE /v1/friends/{userId} |
| [UserBlocksV1Controller_block](./v1friends/userblocksv1controller_block.md) | POST /v1/users/{id}/block |
| [UserBlocksV1Controller_unblock](./v1friends/userblocksv1controller_unblock.md) | DELETE /v1/users/{id}/block |
| [BlocksV1Controller_list](./v1friends/blocksv1controller_list.md) | GET /v1/blocks |
| [SocialFriendsPresenceV1Controller_list](./v1friends/socialfriendspresencev1controller_list.md) | GET /v1/social/friends/presence |

### v1GameContent

| 接口 | 说明 |
| --- | --- |
| [GameContentController_meta](./v1gamecontent/gamecontentcontroller_meta.md) | GET /v1/game-content/meta |
| [GameContentController_listBlueprints](./v1gamecontent/gamecontentcontroller_listblueprints.md) | GET /v1/game-content/blueprints |
| [GameContentController_createBlueprint](./v1gamecontent/gamecontentcontroller_createblueprint.md) | Submit a blueprint through the existing resource moderation flow |
| [GameContentController_listMaps](./v1gamecontent/gamecontentcontroller_listmaps.md) | GET /v1/game-content/maps |
| [GameContentController_blueprintDetail](./v1gamecontent/gamecontentcontroller_blueprintdetail.md) | GET /v1/game-content/blueprints/{id} |
| [GameContentController_mapDetail](./v1gamecontent/gamecontentcontroller_mapdetail.md) | GET /v1/game-content/maps/{id} |
| [GameContentController_blueprintCode](./v1gamecontent/gamecontentcontroller_blueprintcode.md) | GET /v1/game-content/blueprints/{id}/code |
| [GameContentController_mapDownload](./v1gamecontent/gamecontentcontroller_mapdownload.md) | GET /v1/game-content/maps/{id}/download |
| [GameContentController_mapDownloadFile](./v1gamecontent/gamecontentcontroller_mapdownloadfile.md) | GET /v1/game-content/maps/{id}/download/file |
| [GameContentController_blueprintPreview](./v1gamecontent/gamecontentcontroller_blueprintpreview.md) | GET /v1/game-content/blueprints/{id}/preview |
| [GameContentController_mapPreview](./v1gamecontent/gamecontentcontroller_mappreview.md) | GET /v1/game-content/maps/{id}/preview |
| [GameContentController_feed](./v1gamecontent/gamecontentcontroller_feed.md) | GET /v1/game-content/feed |
| [GameContentController_search](./v1gamecontent/gamecontentcontroller_search.md) | GET /v1/game-content/search |
| [GameContentController_tags](./v1gamecontent/gamecontentcontroller_tags.md) | GET /v1/game-content/tags |
| [GameContentController_beginMapUpload](./v1gamecontent/gamecontentcontroller_beginmapupload.md) | POST /v1/game-content/maps/uploads |
| [GameContentController_completeMapUpload](./v1gamecontent/gamecontentcontroller_completemapupload.md) | POST /v1/game-content/maps/uploads/{uploadId}/complete |
| [GameContentController_uploadSession](./v1gamecontent/gamecontentcontroller_uploadsession.md) | GET /v1/game-content/maps/uploads/{uploadId} |
| [GameContentController_uploadSessionPreview](./v1gamecontent/gamecontentcontroller_uploadsessionpreview.md) | GET /v1/game-content/maps/uploads/{uploadId}/preview |
| [GameContentController_likeBlueprint](./v1gamecontent/gamecontentcontroller_likeblueprint.md) | POST /v1/game-content/blueprints/{id}/like |
| [GameContentController_unlikeBlueprint](./v1gamecontent/gamecontentcontroller_unlikeblueprint.md) | DELETE /v1/game-content/blueprints/{id}/like |
| [GameContentController_likeMap](./v1gamecontent/gamecontentcontroller_likemap.md) | POST /v1/game-content/maps/{id}/like |
| [GameContentController_unlikeMap](./v1gamecontent/gamecontentcontroller_unlikemap.md) | DELETE /v1/game-content/maps/{id}/like |
| [GameContentController_favorite](./v1gamecontent/gamecontentcontroller_favorite.md) | POST /v1/game-content/{type}/{id}/favorite |
| [GameContentController_unfavorite](./v1gamecontent/gamecontentcontroller_unfavorite.md) | DELETE /v1/game-content/{type}/{id}/favorite |
| [GameContentController_me](./v1gamecontent/gamecontentcontroller_me.md) | GET /v1/game-content/me |
| [GameContentController_myFavorites](./v1gamecontent/gamecontentcontroller_myfavorites.md) | GET /v1/game-content/me/favorites |
| [GameContentController_myResources](./v1gamecontent/gamecontentcontroller_myresources.md) | GET /v1/game-content/me/resources |

### v1GameContentV2

| 接口 | 说明 |
| --- | --- |
| [searchGameContentIndexV2](./v1gamecontentv2/searchgamecontentindexv2.md) | 搜索已发布 Mod Content 索引并返回所属 Resource |
| [findGameContentByNameV2](./v1gamecontentv2/findgamecontentbynamev2.md) | 按 Content type 与当前或历史 internal_name 查询公开索引 |
| [getGameContentItemV2](./v1gamecontentv2/getgamecontentitemv2.md) | 按 Content public UUID 读取单条 Content 索引 |

### v1GameSaves

| 接口 | 说明 |
| --- | --- |
| [GameSavesController_quota](./v1gamesaves/gamesavescontroller_quota.md) | 查看云存档空间 |
| [GameSavesController_list](./v1gamesaves/gamesavescontroller_list.md) | 列出我的云存档 |
| [GameSavesController_create](./v1gamesaves/gamesavescontroller_create.md) | 创建云存档 Slot |
| [GameSavesController_get](./v1gamesaves/gamesavescontroller_get.md) | 查看云存档详情 |
| [GameSavesController_delete](./v1gamesaves/gamesavescontroller_delete.md) | 删除云存档 |
| [GameSavesController_rename](./v1gamesaves/gamesavescontroller_rename.md) | 重命名云存档 |
| [GameSavesController_snapshots](./v1gamesaves/gamesavescontroller_snapshots.md) | 查看快照历史 |
| [GameSavesController_createManifestSnapshot](./v1gamesaves/gamesavescontroller_createmanifestsnapshot.md) | 用文件清单创建快照 |
| [GameSavesController_download](./v1gamesaves/gamesavescontroller_download.md) | 获取快照下载地址 |
| [GameSavesController_downloadFile](./v1gamesaves/gamesavescontroller_downloadfile.md) | 下载快照文件 |
| [GameSavesController_restore](./v1gamesaves/gamesavescontroller_restore.md) | 恢复历史快照 |
| [GameSavesController_deleteSnapshot](./v1gamesaves/gamesavescontroller_deletesnapshot.md) | 删除历史快照 |
| [GameSavesController_pin](./v1gamesaves/gamesavescontroller_pin.md) | 固定或取消固定快照 |
| [GameSavesController_checkBlobs](./v1gamesaves/gamesavescontroller_checkblobs.md) | 查询差量文件是否已存在 |
| [GameSavesController_createBlobUpload](./v1gamesaves/gamesavescontroller_createblobupload.md) | 创建差量文件上传会话 |
| [GameSavesController_uploadBlobFile](./v1gamesaves/gamesavescontroller_uploadblobfile.md) | 上传差量文件内容 |
| [GameSavesController_manifest](./v1gamesaves/gamesavescontroller_manifest.md) | 读取快照文件清单 |
| [GameSavesController_blobDownloads](./v1gamesaves/gamesavescontroller_blobdownloads.md) | 获取差量文件下载地址 |
| [GameSavesController_blobFile](./v1gamesaves/gamesavescontroller_blobfile.md) | 下载单个存档文件 |
| [GameSavesController_createUpload](./v1gamesaves/gamesavescontroller_createupload.md) | 创建上传会话 |
| [GameSavesController_uploadFile](./v1gamesaves/gamesavescontroller_uploadfile.md) | 上传存档文件 |
| [GameSavesController_commit](./v1gamesaves/gamesavescontroller_commit.md) | 校验并提交上传 |
| [GameSavesController_cancelUpload](./v1gamesaves/gamesavescontroller_cancelupload.md) | 取消未提交上传 |

### v1Home

| 接口 | 说明 |
| --- | --- |
| [HomeV1Controller_getHomeData](./v1home/homev1controller_gethomedata.md) | GET /v1/home |

### v1Messages

| 接口 | 说明 |
| --- | --- |
| [MessagesV1Controller_conversations](./v1messages/messagesv1controller_conversations.md) | 列出私信会话 |
| [MessagesV1Controller_send](./v1messages/messagesv1controller_send.md) | 发送私信 |
| [MessagesV1Controller_unreadCount](./v1messages/messagesv1controller_unreadcount.md) | 读取未读私信数 |
| [MessagesV1Controller_conversation](./v1messages/messagesv1controller_conversation.md) | 读取私信会话 |

### v1Misc

| 接口 | 说明 |
| --- | --- |
| [ResourceDiscoveryController_home](./v1misc/resourcediscoverycontroller_home.md) | 读取资源发现榜单 |
| [ResourceDiscoveryController_hot](./v1misc/resourcediscoverycontroller_hot.md) | 读取下载量最高的公开资源 |
| [ResourceDiscoveryController_forYou](./v1misc/resourcediscoverycontroller_foryou.md) | 读取猜你喜欢资源 |
| [ResourceDiscoveryController_related](./v1misc/resourcediscoverycontroller_related.md) | 读取相关推荐资源 |

### v1Multiplayer

| 接口 | 说明 |
| --- | --- |
| [MultiplayerV1Controller_capabilities](./v1multiplayer/multiplayerv1controller_capabilities.md) | GET /v1/multiplayer/capabilities |
| [MultiplayerV1Controller_preferences](./v1multiplayer/multiplayerv1controller_preferences.md) | GET /v1/multiplayer/preferences |
| [MultiplayerV1Controller_setPreferences](./v1multiplayer/multiplayerv1controller_setpreferences.md) | PATCH /v1/multiplayer/preferences |
| [MultiplayerV1Controller_listSessions](./v1multiplayer/multiplayerv1controller_listsessions.md) | GET /v1/multiplayer/sessions |
| [MultiplayerV1Controller_createSession](./v1multiplayer/multiplayerv1controller_createsession.md) | POST /v1/multiplayer/sessions |
| [MultiplayerV1Controller_resolveCode](./v1multiplayer/multiplayerv1controller_resolvecode.md) | POST /v1/multiplayer/sessions/resolve-code |
| [MultiplayerV1Controller_getSession](./v1multiplayer/multiplayerv1controller_getsession.md) | GET /v1/multiplayer/sessions/{id} |
| [createMultiplayerSessionModSyncPlan](./v1multiplayer/createmultiplayersessionmodsyncplan.md) | 计算加入模组房所需的同步计划并批量签发下载授权 |
| [MultiplayerV1Controller_join](./v1multiplayer/multiplayerv1controller_join.md) | POST /v1/multiplayer/sessions/{id}/join |
| [MultiplayerV1Controller_leave](./v1multiplayer/multiplayerv1controller_leave.md) | POST /v1/multiplayer/sessions/{id}/leave |
| [MultiplayerV1Controller_peers](./v1multiplayer/multiplayerv1controller_peers.md) | GET /v1/multiplayer/sessions/{id}/peers |
| [MultiplayerV1Controller_heartbeat](./v1multiplayer/multiplayerv1controller_heartbeat.md) | POST /v1/multiplayer/sessions/{id}/peers/{peerId}/heartbeat |
| [MultiplayerV1Controller_addCandidate](./v1multiplayer/multiplayerv1controller_addcandidate.md) | POST /v1/multiplayer/sessions/{id}/candidates |
| [MultiplayerV1Controller_candidates](./v1multiplayer/multiplayerv1controller_candidates.md) | GET /v1/multiplayer/sessions/{id}/peers/{peerId}/candidates |
| [MultiplayerV1Controller_removeCandidate](./v1multiplayer/multiplayerv1controller_removecandidate.md) | DELETE /v1/multiplayer/sessions/{id}/candidates/{candidateId} |
| [MultiplayerV1Controller_invites](./v1multiplayer/multiplayerv1controller_invites.md) | GET /v1/multiplayer/invites |
| [MultiplayerV1Controller_createInvite](./v1multiplayer/multiplayerv1controller_createinvite.md) | POST /v1/multiplayer/invites |
| [MultiplayerV1Controller_acceptInvite](./v1multiplayer/multiplayerv1controller_acceptinvite.md) | POST /v1/multiplayer/invites/{id}/accept |
| [MultiplayerV1Controller_declineInvite](./v1multiplayer/multiplayerv1controller_declineinvite.md) | POST /v1/multiplayer/invites/{id}/decline |
| [MultiplayerV1Controller_revokeInvite](./v1multiplayer/multiplayerv1controller_revokeinvite.md) | POST /v1/multiplayer/invites/{id}/revoke |
| [MultiplayerV1Controller_listSessionJoinRequests](./v1multiplayer/multiplayerv1controller_listsessionjoinrequests.md) | GET /v1/multiplayer/sessions/{id}/join-requests |
| [MultiplayerV1Controller_requestJoin](./v1multiplayer/multiplayerv1controller_requestjoin.md) | POST /v1/multiplayer/sessions/{id}/join-requests |
| [MultiplayerV1Controller_approveJoin](./v1multiplayer/multiplayerv1controller_approvejoin.md) | POST /v1/multiplayer/join-requests/{id}/approve |
| [MultiplayerV1Controller_rejectJoin](./v1multiplayer/multiplayerv1controller_rejectjoin.md) | POST /v1/multiplayer/join-requests/{id}/reject |
| [MultiplayerV1Controller_createJoinIntent](./v1multiplayer/multiplayerv1controller_createjoinintent.md) | POST /v1/multiplayer/sessions/{id}/join-intents |
| [MultiplayerV1Controller_consumeJoinIntent](./v1multiplayer/multiplayerv1controller_consumejoinintent.md) | POST /v1/multiplayer/join-intents/{id}/consume |
| [MultiplayerV1Controller_allocateRelay](./v1multiplayer/multiplayerv1controller_allocaterelay.md) | POST /v1/multiplayer/sessions/{id}/relay |

### v1Notices

| 接口 | 说明 |
| --- | --- |
| [NoticesController_list](./v1notices/noticescontroller_list.md) | GET /v1/notices |
| [NoticesController_detail](./v1notices/noticescontroller_detail.md) | GET /v1/notices/{id} |

### v1Notifications

| 接口 | 说明 |
| --- | --- |
| [NotificationsV1Controller_list](./v1notifications/notificationsv1controller_list.md) | GET /v1/notifications |
| [NotificationsV1Controller_unreadCount](./v1notifications/notificationsv1controller_unreadcount.md) | GET /v1/notifications/unread-count |
| [NotificationsV1Controller_markRead](./v1notifications/notificationsv1controller_markread.md) | PUT /v1/notifications/{id}/read |
| [NotificationsV1Controller_markAllRead](./v1notifications/notificationsv1controller_markallread.md) | PUT /v1/notifications/read-all |

### v1Packs

| 接口 | 说明 |
| --- | --- |
| [getPackVersionManifest](./v1packs/getpackversionmanifest.md) | Get a deterministic manifest for one published Pack version |
| [createPackVersionDownloadGrants](./v1packs/createpackversiondownloadgrants.md) | Issue a batch of download grants for the Pack pinned files |

### v1Portal

| 接口 | 说明 |
| --- | --- |
| [PortalV1Controller_getPortalData](./v1portal/portalv1controller_getportaldata.md) | GET /v1/portal |

### v1Presence

| 接口 | 说明 |
| --- | --- |
| [PresenceV1Controller_create](./v1presence/presencev1controller_create.md) | POST /v1/presence/connections |
| [PresenceV1Controller_remove](./v1presence/presencev1controller_remove.md) | DELETE /v1/presence/connections/{id} |
| [PresenceV1Controller_patch](./v1presence/presencev1controller_patch.md) | PATCH /v1/presence/connections/{id} |
| [PresenceV1Controller_heartbeat](./v1presence/presencev1controller_heartbeat.md) | POST /v1/presence/connections/{id}/heartbeat |
| [PresenceV1Controller_activity](./v1presence/presencev1controller_activity.md) | PUT /v1/presence/connections/{id}/activity |
| [PresenceV1Controller_removeActivity](./v1presence/presencev1controller_removeactivity.md) | DELETE /v1/presence/connections/{id}/activity |

### v1RealtimeEvents

| 接口 | 说明 |
| --- | --- |
| [RealtimeV1Controller_createTicket](./v1realtimeevents/realtimev1controller_createticket.md) | POST /v1/realtime/tickets |

### v1Reports

| 接口 | 说明 |
| --- | --- |
| [ReportsV1Controller_create](./v1reports/reportsv1controller_create.md) | POST /v1/reports |
| [ReportsV1Controller_mine](./v1reports/reportsv1controller_mine.md) | GET /v1/reports/mine |

### v1ResourcePackItems

| 接口 | 说明 |
| --- | --- |
| [listPackVersionItems](./v1resourcepackitems/listpackversionitems.md) | List a Pack version’s fixed resource-version membership |
| [replacePackVersionItems](./v1resourcepackitems/replacepackversionitems.md) | Replace a Pack version’s fixed resource-version membership |

### v1ResourceUploads

| 接口 | 说明 |
| --- | --- |
| [ResourcesV1WriteController_create](./v1resourceuploads/resourcesv1writecontroller_create.md) | POST /v1/resources |
| [ResourcesV1WriteController_initDirectUpload](./v1resourceuploads/resourcesv1writecontroller_initdirectupload.md) | POST /v1/resources/uploads/init |
| [ResourcesV1WriteController_completeDirectUpload](./v1resourceuploads/resourcesv1writecontroller_completedirectupload.md) | POST /v1/resources/uploads/complete |
| [ResourcesV1WriteController_directUploadStatus](./v1resourceuploads/resourcesv1writecontroller_directuploadstatus.md) | GET /v1/resources/uploads/{sessionId}/status |
| [ResourcesV1WriteController_previewDraft](./v1resourceuploads/resourcesv1writecontroller_previewdraft.md) | POST /v1/resources/drafts/preview |
| [ResourcesV1WriteController_createUploadDraft](./v1resourceuploads/resourcesv1writecontroller_createuploaddraft.md) | POST /v1/resources/drafts |
| [ResourcesV1WriteController_getUploadDraft](./v1resourceuploads/resourcesv1writecontroller_getuploaddraft.md) | GET /v1/resources/drafts/{draftId} |
| [ResourcesV1WriteController_deleteUploadDraft](./v1resourceuploads/resourcesv1writecontroller_deleteuploaddraft.md) | DELETE /v1/resources/drafts/{draftId} |
| [ResourcesV1WriteController_updateUploadDraft](./v1resourceuploads/resourcesv1writecontroller_updateuploaddraft.md) | PATCH /v1/resources/drafts/{draftId} |
| [ResourcesV1WriteController_submitUploadDraft](./v1resourceuploads/resourcesv1writecontroller_submituploaddraft.md) | POST /v1/resources/drafts/{draftId}/submit |
| [ResourcesV1WriteController_draftPreview](./v1resourceuploads/resourcesv1writecontroller_draftpreview.md) | GET /v1/resources/drafts/{draftId}/preview |

### v1Resources

| 接口 | 说明 |
| --- | --- |
| [ResourcesV1Controller_listResources](./v1resources/resourcesv1controller_listresources.md) | GET /v1/resources |
| [ResourcesV1Controller_listKinds](./v1resources/resourcesv1controller_listkinds.md) | GET /v1/resources/kinds |
| [ResourcesV1Controller_listTopics](./v1resources/resourcesv1controller_listtopics.md) | GET /v1/resources/topics |
| [ResourcesV1Controller_getManifest](./v1resources/resourcesv1controller_getmanifest.md) | GET /v1/resources/{id}/manifest |
| [ResourcesV1Controller_getPreview](./v1resources/resourcesv1controller_getpreview.md) | GET /v1/resources/{id}/preview |
| [ResourcesV1Controller_downloadFile](./v1resources/resourcesv1controller_downloadfile.md) | GET /v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download |
| [ResourcesV1Controller_getResource](./v1resources/resourcesv1controller_getresource.md) | GET /v1/resources/{id} |

### v1ResourcesReportAttachments

| 接口 | 说明 |
| --- | --- |
| [listModIssueReportAttachmentsV2](./v1resourcesreportattachments/listmodissuereportattachmentsv2.md) | 读取有权限访问的问题报告附件清单 |
| [uploadModIssueReportAttachmentV2](./v1resourcesreportattachments/uploadmodissuereportattachmentv2.md) | 为本人 Mod 问题报告上传私有日志或图片证据 |
| [getModIssueReportAttachmentV2](./v1resourcesreportattachments/getmodissuereportattachmentv2.md) | 下载有权限访问的问题报告附件 |
| [deleteModIssueReportAttachmentV2](./v1resourcesreportattachments/deletemodissuereportattachmentv2.md) | 删除本人问题报告的附件 |
| [listModCompatibilityReportAttachmentsV2](./v1resourcesreportattachments/listmodcompatibilityreportattachmentsv2.md) | 读取有权限访问的兼容报告附件清单 |
| [uploadModCompatibilityReportAttachmentV2](./v1resourcesreportattachments/uploadmodcompatibilityreportattachmentv2.md) | 为本人 Mod 兼容报告上传私有日志或图片证据 |
| [getModCompatibilityReportAttachmentV2](./v1resourcesreportattachments/getmodcompatibilityreportattachmentv2.md) | 下载有权限访问的兼容报告附件 |
| [deleteModCompatibilityReportAttachmentV2](./v1resourcesreportattachments/deletemodcompatibilityreportattachmentv2.md) | 删除本人兼容报告的附件 |

### v1ResourcesSourceSync

| 接口 | 说明 |
| --- | --- |
| [upsertResourceGithubSourceSyncV2](./v1resourcessourcesync/upsertresourcegithubsourcesyncv2.md) | 配置 Mod 的 GitHub Release 来源 |
| [listResourceGithubReleasesV2](./v1resourcessourcesync/listresourcegithubreleasesv2.md) | 手动读取 GitHub Release、README 與 License 预览 |
| [importResourceGithubReleaseV2](./v1resourcessourcesync/importresourcegithubreleasev2.md) | 显式导入一个 GitHub Release 资产 |

### v1ResourcesV2

| 接口 | 说明 |
| --- | --- |
| [listResourceEmbedCardsV2](./v1resourcesv2/listresourceembedcardsv2.md) | 批量读取富文本资源卡片 |
| [listResourceVersionsV2](./v1resourcesv2/listresourceversionsv2.md) | 列出 Resource 的已发布 V2 版本 |
| [listResourceRelationsV2](./v1resourcesv2/listresourcerelationsv2.md) | 列出 Resource 的公开关联资源 |
| [getResourceStatsV2](./v1resourcesv2/getresourcestatsv2.md) | 读取 Resource 聚合统计 |
| [getResourceVersionPreviewV2](./v1resourcesv2/getresourceversionpreviewv2.md) | 读取指定版本预览 PNG |
| [getResourceWorkbenchV2](./v1resourcesv2/getresourceworkbenchv2.md) | 读取公开或有权限访问的 Resource V2 工作台 |
| [getModResourceV2](./v1resourcesv2/getmodresourcev2.md) | 读取 Mod Resource 详情 |
| [listModResourceVersionsV2](./v1resourcesv2/listmodresourceversionsv2.md) | 列出 Mod Resource 的已发布版本 |
| [getModResourceManifestV2](./v1resourcesv2/getmodresourcemanifestv2.md) | 读取聚合 Mod manifest |
| [resolveModIdV2](./v1resourcesv2/resolvemodidv2.md) | 将 Mod ID 或历史 alias 解析到公开 Resource |
| [listModContentsV2](./v1resourcesv2/listmodcontentsv2.md) | 读取指定 Mod 版本的 Content 索引 |
| [listModLocalizationsV2](./v1resourcesv2/listmodlocalizationsv2.md) | 读取指定 Mod 版本的本地化覆盖率 |
| [listModDependenciesV2](./v1resourcesv2/listmoddependenciesv2.md) | 读取指定 Mod 版本的直接依赖 |
| [resolveModDependencyTreeV2](./v1resourcesv2/resolvemoddependencytreev2.md) | 解析 Mod 版本的直接与传递依赖；包含未收录项、循环与截断状态 |
| [getModCompatibilityV2](./v1resourcesv2/getmodcompatibilityv2.md) | 读取 Mod 版本兼容性与公开社区报告 |
| [listModConflictsV2](./v1resourcesv2/listmodconflictsv2.md) | 读取公开涉及该 Mod 的冲突报告 |
| [listModIssueReportsV2](./v1resourcesv2/listmodissuereportsv2.md) | 分页读取 Mod 已发布版本的问题报告与作者回复 |
| [listModRelationsV2](./v1resourcesv2/listmodrelationsv2.md) | 列出 Mod Resource 的公开关联资源 |
| [getModAnalysisV2](./v1resourcesv2/getmodanalysisv2.md) | 读取 Mod 静态分析结果与作者忽略记录 |
| [getModVersionDiffV2](./v1resourcesv2/getmodversiondiffv2.md) | 读取 Mod 版本差异；缺少结构化 diff 时返回 null |
| [searchSchematicLogicV2](./v1resourcesv2/searchschematiclogicv2.md) | 检索公开已发布蓝图的 mlog 逻辑片段（纯静态，不执行脚本） |
| [getSchematicResourceV2](./v1resourcesv2/getschematicresourcev2.md) | 读取蓝图 Resource 与选定版本元数据 |
| [listSchematicVersionsV2](./v1resourcesv2/listschematicversionsv2.md) | 列出蓝图 Resource 的已发布版本 |
| [getSchematicManifestV2](./v1resourcesv2/getschematicmanifestv2.md) | 读取聚合蓝图 manifest |
| [getSchematicAnalysisV2](./v1resourcesv2/getschematicanalysisv2.md) | 读取蓝图分析结果与估算标记 |
| [listSchematicBlocksV2](./v1resourcesv2/listschematicblocksv2.md) | 读取蓝图方块统计与可用坐标 |
| [listSchematicMaterialsV2](./v1resourcesv2/listschematicmaterialsv2.md) | 读取蓝图建造材料清单 |
| [getSchematicProductionV2](./v1resourcesv2/getschematicproductionv2.md) | 读取理论产能估算与可用性 |
| [listSchematicLogicV2](./v1resourcesv2/listschematiclogicv2.md) | 读取蓝图 Logic Processor 的静态链接与变量元数据 |
| [listSchematicDependenciesV2](./v1resourcesv2/listschematicdependenciesv2.md) | 读取蓝图版本依赖 |
| [listSchematicRelationsV2](./v1resourcesv2/listschematicrelationsv2.md) | 列出蓝图 Resource 的公开关联资源 |
| [getSchematicVersionDiffV2](./v1resourcesv2/getschematicversiondiffv2.md) | 读取蓝图版本可视化差异；计算中返回 202 |
| [getMapResourceV2](./v1resourcesv2/getmapresourcev2.md) | 读取地图 Resource 与选定版本元数据 |
| [listMapVersionsV2](./v1resourcesv2/listmapversionsv2.md) | 列出地图 Resource 的已发布版本 |
| [getMapManifestV2](./v1resourcesv2/getmapmanifestv2.md) | 读取聚合地图 manifest |
| [getMapAnalysisV2](./v1resourcesv2/getmapanalysisv2.md) | 读取地图分析与 estimated 难度标记 |
| [getMapRulesV2](./v1resourcesv2/getmaprulesv2.md) | 读取地图世界规则 |
| [listMapResourcesV2](./v1resourcesv2/listmapresourcesv2.md) | 读取地图资源分布摘要 |
| [listMapWavesV2](./v1resourcesv2/listmapwavesv2.md) | 读取地图波次摘要与尖峰标记 |
| [listMapSpawnsV2](./v1resourcesv2/listmapspawnsv2.md) | 读取地图出生点坐标 |
| [listMapDependenciesV2](./v1resourcesv2/listmapdependenciesv2.md) | 读取地图版本依赖 |
| [listMapRelationsV2](./v1resourcesv2/listmaprelationsv2.md) | 列出地图 Resource 的公开关联资源 |
| [getMapVersionDiffV2](./v1resourcesv2/getmapversiondiffv2.md) | 读取地图版本可视化差异；计算中返回 202 |
| [getMapDiffChunkV2](./v1resourcesv2/getmapdiffchunkv2.md) | 读取地图版本差异的 128×128 分区 RLE 明细；计算中返回 202 |
| [getMapDiffOverlayV2](./v1resourcesv2/getmapdiffoverlayv2.md) | 读取地图版本差异的透明叠加层 PNG |

### v1ResourcesV2Community

| 接口 | 说明 |
| --- | --- |
| [getMapFeedbackAggregateV2](./v1resourcesv2community/getmapfeedbackaggregatev2.md) | 读取地图版本的结构化社区反馈聚合 |
| [upsertMapFeedbackV2](./v1resourcesv2community/upsertmapfeedbackv2.md) | 提交或更新地图版本反馈 |
| [submitModCompatibilityReportV2](./v1resourcesv2community/submitmodcompatibilityreportv2.md) | 提交或更新当前账号对 Mod Release 的兼容性报告 |
| [updateModCompatibilityReportV2](./v1resourcesv2community/updatemodcompatibilityreportv2.md) | 更新本人提交的 Mod 兼容性报告 |
| [submitModIssueReportV2](./v1resourcesv2community/submitmodissuereportv2.md) | 提交 Mod 版本问题报告 |
| [updateModIssueReportV2](./v1resourcesv2community/updatemodissuereportv2.md) | 更新本人提交的 Mod 问题报告 |
| [respondToModCompatibilityReportV2](./v1resourcesv2community/respondtomodcompatibilityreportv2.md) | 由 Mod Owner 或 Maintainer 回复兼容性报告 |
| [respondToModIssueReportV2](./v1resourcesv2community/respondtomodissuereportv2.md) | 由 Mod Owner 或 Maintainer 回复问题报告 |
| [submitModConflictReportV2](./v1resourcesv2community/submitmodconflictreportv2.md) | 提交包含多个已发布 Mod 版本的冲突报告 |
| [respondToModConflictReportV2](./v1resourcesv2community/respondtomodconflictreportv2.md) | 由冲突涉及的 Mod Owner 或 Maintainer 回复冲突报告 |

### v1ResourcesV2Management

| 接口 | 说明 |
| --- | --- |
| [updateResourceV2Profile](./v1resourcesv2management/updateresourcev2profile.md) | 更新 Resource 基本资料 |
| [createResourceV2Version](./v1resourcesv2management/createresourcev2version.md) | 发布新的 Resource 版本或创建不可覆盖的 revision |
| [createResourceV2Relation](./v1resourcesv2management/createresourcev2relation.md) | 创建双向可查询的 Resource 关系 |
| [analyzeResourceV2Version](./v1resourcesv2management/analyzeresourcev2version.md) | 安全解析待发布的 Resource 版本文件 |
| [exportResourceSchematicEdit](./v1resourcesv2management/exportresourceschematicedit.md) | 安全导出编辑后的蓝图副本 |
| [readResourceEditorData](./v1resourcesv2management/readresourceeditordata.md) | 读取已发布版本的官方编辑数据 |
| [readResourceMapEditRegion](./v1resourcesv2management/readresourcemapeditregion.md) | 读取已发布地图的有界编辑分区 |
| [inviteResourceV2Member](./v1resourcesv2management/inviteresourcev2member.md) | 按用户名邀请 Resource 协作者 |
| [respondToResourceV2Invitation](./v1resourcesv2management/respondtoresourcev2invitation.md) | 接受或拒绝协作者邀请；所有权转让必须接受后完成 |
| [beginResourceV2OwnershipTransfer](./v1resourcesv2management/beginresourcev2ownershiptransfer.md) | 由 Owner/Admin 发起所有权转让；接收方必须确认 |

### v1ResourcesV2Review

| 接口 | 说明 |
| --- | --- |
| [listResourceReviewEventsV2](./v1resourcesv2review/listresourcerevieweventsv2.md) | 读取有权限访问的 Resource 审核时间线 |
| [reviewResourceVersionV2](./v1resourcesv2review/reviewresourceversionv2.md) | 审核一个 ResourceVersion |
| [ignoreResourceAnalysisFindingV2](./v1resourcesv2review/ignoreresourceanalysisfindingv2.md) | 忽略已发布版本的一条分析结果 |
| [clearResourceAnalysisFindingV2](./v1resourcesv2review/clearresourceanalysisfindingv2.md) | 清除已发布版本的一条分析忽略记录 |
| [createResourceReviewAnnotationV2](./v1resourcesv2review/createresourcereviewannotationv2.md) | 由管理员或版主添加 Resource 字段批注 |

### v1Search

| 接口 | 说明 |
| --- | --- |
| [SearchV1Controller_unified](./v1search/searchv1controller_unified.md) | GET /v1/search |
| [SearchV1Controller_posts](./v1search/searchv1controller_posts.md) | GET /v1/search/posts |

### v1SocialPrivacy

| 接口 | 说明 |
| --- | --- |
| [SocialPrivacyV1Controller_get](./v1socialprivacy/socialprivacyv1controller_get.md) | GET /v1/social/privacy |
| [SocialPrivacyV1Controller_patch](./v1socialprivacy/socialprivacyv1controller_patch.md) | PATCH /v1/social/privacy |

### v1SquadSaves

| 接口 | 说明 |
| --- | --- |
| [SquadsController_list](./v1squadsaves/squadscontroller_list.md) | 列出我的小队 |
| [SquadsController_create](./v1squadsaves/squadscontroller_create.md) | 创建小队 |
| [SquadsController_invitations](./v1squadsaves/squadscontroller_invitations.md) | 列出收到的小队邀请 |
| [SquadsController_get](./v1squadsaves/squadscontroller_get.md) | 查看小队详情 |
| [SquadsController_remove](./v1squadsaves/squadscontroller_remove.md) | 删除小队 |
| [SquadsController_rename](./v1squadsaves/squadscontroller_rename.md) | 重命名小队 |
| [SquadsController_members](./v1squadsaves/squadscontroller_members.md) | 列出小队成员 |
| [SquadsController_invite](./v1squadsaves/squadscontroller_invite.md) | 邀请好友加入小队 |
| [SquadsController_acceptInvite](./v1squadsaves/squadscontroller_acceptinvite.md) | 接受小队邀请 |
| [SquadsController_declineInvite](./v1squadsaves/squadscontroller_declineinvite.md) | 拒绝小队邀请 |
| [SquadsController_removeMember](./v1squadsaves/squadscontroller_removemember.md) | 退出或移除小队成员 |
| [SquadsController_setRole](./v1squadsaves/squadscontroller_setrole.md) | 设置成员角色 |
| [SquadsController_createTransfer](./v1squadsaves/squadscontroller_createtransfer.md) | 发起队长转让 |
| [SquadsController_acceptTransfer](./v1squadsaves/squadscontroller_accepttransfer.md) | 接受队长转让 |
| [SquadsController_declineTransfer](./v1squadsaves/squadscontroller_declinetransfer.md) | 拒绝队长转让 |
| [SquadsController_cancelTransfer](./v1squadsaves/squadscontroller_canceltransfer.md) | 取消队长转让 |
| [SquadsController_slots](./v1squadsaves/squadscontroller_slots.md) | 列出共享存档槽 |
| [SquadsController_createSlot](./v1squadsaves/squadscontroller_createslot.md) | 创建共享存档槽 |
| [SquadsController_getSlot](./v1squadsaves/squadscontroller_getslot.md) | 查看共享存档槽 |
| [SquadsController_deleteSlot](./v1squadsaves/squadscontroller_deleteslot.md) | 删除共享存档槽 |
| [SquadsController_renameSlot](./v1squadsaves/squadscontroller_renameslot.md) | 重命名共享存档槽 |
| [SquadsController_leaseStatus](./v1squadsaves/squadscontroller_leasestatus.md) | 查看写租约状态 |
| [SquadsController_releaseLease](./v1squadsaves/squadscontroller_releaselease.md) | 释放写租约 |
| [SquadsController_acquireLease](./v1squadsaves/squadscontroller_acquirelease.md) | 获取写租约 |
| [SquadsController_renewLease](./v1squadsaves/squadscontroller_renewlease.md) | 续期写租约 |
| [SquadsController_snapshots](./v1squadsaves/squadscontroller_snapshots.md) | 查看快照链 |
| [SquadsController_commitSnapshot](./v1squadsaves/squadscontroller_commitsnapshot.md) | 提交共享存档快照 |
| [SquadsController_manifest](./v1squadsaves/squadscontroller_manifest.md) | 读取快照文件清单 |
| [SquadsController_restore](./v1squadsaves/squadscontroller_restore.md) | 恢复历史或冲突分支 |
| [SquadsController_deleteSnapshot](./v1squadsaves/squadscontroller_deletesnapshot.md) | 删除历史或冲突快照 |
| [SquadsController_pin](./v1squadsaves/squadscontroller_pin.md) | 置顶或取消置顶快照 |
| [SquadsController_checkBlobs](./v1squadsaves/squadscontroller_checkblobs.md) | 查询小队已持有的文件 |
| [SquadsController_createBlobUpload](./v1squadsaves/squadscontroller_createblobupload.md) | 创建小队文件上传会话 |
| [SquadsController_uploadBlobFile](./v1squadsaves/squadscontroller_uploadblobfile.md) | 上传小队文件字节 |
| [SquadsController_blobDownloads](./v1squadsaves/squadscontroller_blobdownloads.md) | 获取快照文件下载地址 |
| [SquadsController_blobFile](./v1squadsaves/squadscontroller_blobfile.md) | 下载单个小队存档文件 |

### v1ThreadInteractions

| 接口 | 说明 |
| --- | --- |
| [ThreadInteractionsV1Controller_like](./v1threadinteractions/threadinteractionsv1controller_like.md) | PUT /v1/threads/{id}/like |
| [ThreadInteractionsV1Controller_unlike](./v1threadinteractions/threadinteractionsv1controller_unlike.md) | DELETE /v1/threads/{id}/like |
| [ThreadInteractionsV1Controller_bookmark](./v1threadinteractions/threadinteractionsv1controller_bookmark.md) | PUT /v1/threads/{id}/bookmark |
| [ThreadInteractionsV1Controller_removeBookmark](./v1threadinteractions/threadinteractionsv1controller_removebookmark.md) | DELETE /v1/threads/{id}/bookmark |

### v1ThreadWrites

| 接口 | 说明 |
| --- | --- |
| [ThreadWriteV1Controller_createThread](./v1threadwrites/threadwritev1controller_createthread.md) | POST /v1/threads |
| [ThreadWriteV1Controller_updateThread](./v1threadwrites/threadwritev1controller_updatethread.md) | PUT /v1/threads/{id} |
| [ThreadWriteV1Controller_deleteThread](./v1threadwrites/threadwritev1controller_deletethread.md) | DELETE /v1/threads/{id} |
| [ThreadWriteV1Controller_createReply](./v1threadwrites/threadwritev1controller_createreply.md) | POST /v1/threads/{id}/replies |
| [ThreadWriteV1Controller_updateReply](./v1threadwrites/threadwritev1controller_updatereply.md) | PUT /v1/threads/{threadId}/replies/{replyId} |
| [ThreadWriteV1Controller_deleteReply](./v1threadwrites/threadwritev1controller_deletereply.md) | DELETE /v1/threads/{threadId}/replies/{replyId} |

### v1Threads

| 接口 | 说明 |
| --- | --- |
| [ThreadsV1Controller_listThreads](./v1threads/threadsv1controller_listthreads.md) | GET /v1/threads |
| [ThreadsV1Controller_getThread](./v1threads/threadsv1controller_getthread.md) | GET /v1/threads/{id} |
| [ThreadsV1Controller_getReplies](./v1threads/threadsv1controller_getreplies.md) | GET /v1/threads/{id}/replies |
| [ThreadsV1Controller_getReplyChildren](./v1threads/threadsv1controller_getreplychildren.md) | GET /v1/threads/{id}/replies/{replyId}/children |

### v1Timelapses

| 接口 | 说明 |
| --- | --- |
| [TimelapsesController_createUpload](./v1timelapses/timelapsescontroller_createupload.md) | 创建延时战报上传会话 |
| [TimelapsesController_uploadFile](./v1timelapses/timelapsescontroller_uploadfile.md) | 上传 .mreplay.zip 原始帧包 |
| [TimelapsesController_commit](./v1timelapses/timelapsescontroller_commit.md) | 提交渲染 |
| [TimelapsesController_get](./v1timelapses/timelapsescontroller_get.md) | 查询延时战报 |
| [TimelapsesController_video](./v1timelapses/timelapsescontroller_video.md) | 播放战报视频 |
| [TimelapsesController_poster](./v1timelapses/timelapsescontroller_poster.md) | 读取战报封面 |
| [TimelapsesController_draftPost](./v1timelapses/timelapsescontroller_draftpost.md) | 生成战报草稿帖 |

### v1Uploads

| 接口 | 说明 |
| --- | --- |
| [UploadsV1Controller_image](./v1uploads/uploadsv1controller_image.md) | POST /v1/uploads/images |

### v1Users

| 接口 | 说明 |
| --- | --- |
| [UsersV1Controller_getMe](./v1users/usersv1controller_getme.md) | GET /v1/me |
| [UsersV1Controller_searchPublicUsers](./v1users/usersv1controller_searchpublicusers.md) | GET /v1/users/search |
| [UsersV1Controller_getPublic](./v1users/usersv1controller_getpublic.md) | GET /v1/users/{id} |
| [UsersV1Controller_updateMe](./v1users/usersv1controller_updateme.md) | PUT /v1/me/profile |
| [UsersV1Controller_uploadAvatar](./v1users/usersv1controller_uploadavatar.md) | POST /v1/me/avatar |
