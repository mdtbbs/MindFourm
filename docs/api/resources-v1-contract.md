# 资源中心 API V1 契约

本契约定义 Web 资源中心、启动器和游戏内客户端共用的资源读取格式。客户端迁移到 `/api/v1` 期间，当前 Web 应用仍可继续使用旧版 `/api/resources` 接口。

## 资源标识与兼容规则

- `public_id` 是资源、版本或文件对外使用的稳定标识。
- 数据库数字 ID 属于服务端实现细节，客户端不要保存或依赖它。
- 客户端应忽略响应中不认识的字段，也不要假设一种资源类型只对应一个文件。
- `resource_kind` 表示内容类别，例如 `map`、`schematic`、`mod`；`resource_type` 是旧版交付方式，不是资源身份的一部分。
- 公开 V1 读取接口只返回已审核的公开资源和已发布版本。

## 接口列表

```text
GET /api/v1/resources
GET /api/v1/resources/{resource_public_id}
GET /api/v1/resources/{resource_public_id}/preview
GET /api/v1/resources/{resource_public_id}/manifest
GET /api/v1/resources/{resource_public_id}/versions
GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/preview
GET /api/v1/resources/discovery/home
GET /api/v1/resources/discovery/hot
GET /api/v1/resources/discovery/for-you
GET /api/v1/resources/discovery/related/{id}
GET /api/v1/resources/{resource_public_id}/relations
GET /api/v1/resources/{resource_public_id}/stats
GET /api/v1/resources/{resource_public_id}/workbench
GET /api/v1/resources/mods/{resource_public_id}/dependency-resolution
GET /api/v1/resources/mods/{resource_public_id}/issue-reports
POST /api/v1/resources/mods/issue-reports/{report_public_id}/attachments
GET /api/v1/resources/mods/issue-reports/{report_public_id}/attachments
GET /api/v1/resources/mods/issue-reports/{report_public_id}/attachments/{attachment_public_id}
DELETE /api/v1/resources/mods/issue-reports/{report_public_id}/attachments/{attachment_public_id}
POST /api/v1/resources/mods/compatibility-reports/{report_public_id}/attachments
GET /api/v1/resources/mods/compatibility-reports/{report_public_id}/attachments
GET /api/v1/resources/mods/compatibility-reports/{report_public_id}/attachments/{attachment_public_id}
DELETE /api/v1/resources/mods/compatibility-reports/{report_public_id}/attachments/{attachment_public_id}
PUT /api/v1/resources/{resource_public_id}/source-sync/github
GET /api/v1/resources/{resource_public_id}/source-sync/github/releases
POST /api/v1/resources/{resource_public_id}/source-sync/github/import
GET /api/v1/resources/{resource_public_id}/review-events
POST /api/v1/resources/{resource_public_id}/versions/{version_public_id}/analysis/overrides
DELETE /api/v1/resources/{resource_public_id}/versions/{version_public_id}/analysis/overrides
POST /api/v1/resources/{resource_public_id}/review-annotations
POST /api/v1/resources/{resource_public_id}/versions/analyze
POST /api/v1/resources/{resource_public_id}/versions
PATCH /api/v1/resources/{resource_public_id}
POST /api/v1/resources/{resource_public_id}/relations
POST /api/v1/resources/{resource_public_id}/members
POST /api/v1/resources/{resource_public_id}/members/respond
POST /api/v1/resources/{resource_public_id}/owner-transfer
GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download
GET /api/v1/packs/{pack_public_id}/versions/{version_public_id}/manifest
POST /api/v1/packs/{pack_public_id}/versions/{version_public_id}/download-grants
GET /api/v1/resources/{pack_public_id}/versions/{version_public_id}/pack-items
PUT /api/v1/resources/{pack_public_id}/versions/{version_public_id}/pack-items
```

迁移兼容期间，列表接口支持 `limit`、`offset` 和 `q` 参数。清单是启动器和游戏内客户端同步资源的依据，只包含公开 UUID、已发布版本、兼容信息、依赖、文件摘要，以及服务端计算的 `downloadable` / `installable` 状态。客户端可以定期读取它，不必保存数据库数字 ID。

资源包是资源版本化安装单元。每个已发布资源包版本固定引用最多 100 个已发布资源版本；成员清单发布后不可更改。清单使用公开 ID 并返回固定版本、文件名、字节数、SHA-256、依赖与稳定下载地址，客户端可据此重复安装相同内容。

读取资源包清单使用 `resource.read`，生成批量下载授权使用 `resource.download`；两项操作可匿名访问，但请求携带 MindAuth Bearer 令牌时仍会校验相应权限范围。资源包所有者查询和替换成员项使用 `resource.upload`，替换只能在资源包版本发布前进行。限流和完整数据结构以公开 OpenAPI 中的 `getPackVersionManifest`、`createPackVersionDownloadGrants`、`listPackVersionItems` 与 `replacePackVersionItems` 为准。

### 资源包清单

```http
GET /api/v1/packs/{packId}/versions/{versionId}/manifest
```

业务数据示例：

```json
{
  "schema_version": 1,
  "pack": {
    "public_id": "pack-public-id",
    "version_public_id": "pack-version-public-id",
    "version": "1.2.0",
    "game_version": "v157"
  },
  "members": [{
    "resource_kind": "mod",
    "resource_public_id": "resource-public-id",
    "name": "Example Mod",
    "version_public_id": "resource-version-public-id",
    "version": "2.4.1",
    "file_name": "example.jar",
    "size_bytes": 1827364,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "dependencies": [],
    "download_url": "/api/v1/resources/resource-public-id/versions/resource-version-public-id/files/file-public-id/download"
  }]
}
```

客户端应按资源包版本和每个成员固定的版本 ID 复现安装；下载后校验 `size_bytes` 与 SHA-256。不要把 `game_version: null` 当成兼容任意游戏版本。

### 批量下载授权

```http
POST /api/v1/packs/{packId}/versions/{versionId}/download-grants
Authorization: Bearer <ACCESS_TOKEN>
```

请求体为空。业务响应包含 `pack_public_id`、`pack_version_public_id` 和 `grants[]`；每项标识成员资源、固定版本、文件、下载地址，以及 `granted` 是否记录了新的下载授权。`granted: false` 表示该文件和当前调用者在短去重窗口内已有授权，不会重复增加计数。该操作限流为 10 次/60 秒。

### 资源包成员编辑

资源包所有者使用 `GET /api/v1/resources/{packId}/versions/{versionId}/pack-items` 查看成员清单；用 `PUT` 整体替换：

```json
{
  "items": [
    { "resource_version_public_id": "published-resource-version-public-id" }
  ]
}
```

每项必须引用已发布资源版本的公开 ID，最多 100 项，不能重复。`GET` 限流为 30 次/60 秒，`PUT` 限流为 10 次/60 秒。已发布资源包版本不可再编辑。

## 资源详情结构

```json
{
  "public_id": "resource-uuid",
  "title": "Example",
  "summary": "Short description",
  "resource_kind": "map",
  "visibility": "public",
  "metadata": {
    "schema_version": 1,
    "tags": ["survival"],
    "supported_versions": ["v7"],
    "compatibility": ["desktop"],
    "preview": { "url": "/api/v1/resources/resource-uuid/preview", "status": "ready" },
    "map": {
      "width": 256,
      "height": 256,
      "planets": ["serpulo"],
      "game_modes": ["survival"]
    }
  },
  "latest_version": {
    "public_id": "version-uuid",
    "version": "1.0.0",
    "status": "published",
    "files": []
  }
}
```

`metadata` 对象带有自己的版本号。系统解析生成的字段与发布者填写的字段分开保存；API 只返回通过校验的内容。地图、蓝图和模组可以分别扩展详情字段，不需要改变资源响应的外层结构。

## 清单结构

清单与面向用户展示的详情响应分开：

```json
{
  "resource_public_id": "resource-uuid",
  "resource_kind": "mod",
  "versions": [{
    "public_id": "version-uuid",
    "version": "1.2.0",
    "release_channel": "stable",
    "compatibility": [{ "runtime": "mindustry", "game_series": "v7" }],
    "dependencies": [],
    "files": [{
      "public_id": "file-uuid",
      "platform": "android",
      "package_type": "jar",
      "hash_algorithm": "sha256",
      "content_hash": "...",
      "downloadable": true,
      "installable": true,
      "download_url": "/api/v1/resources/resource-uuid/versions/version-uuid/files/file-uuid/download"
    }]
  }]
}
```

只有文件可用且服务端已校验 SHA-256 时，`installable` 才为 `true`。服务端不会执行模组，也不会将发布者提供的元数据视为可信结论。

## 客户端安全处理

- 安装文件前检查可用状态，并校验文件摘要。
- 缺失的元数据表示“未知”，不能据此认定资源兼容。
- API 服务端不会执行模组代码。模组上传会按大小限制解析为归档文件，清单也按不可信输入处理。
- 预览失败不应导致已审核的原始文件被标记为不可用。

## 资源类别、主题与兼容信息来源

`resource_kind` 是内容类别的权威值，由共享注册表维护。客户端应读取当前注册表，不要自行维护副本：

```text
GET /api/v1/resources/kinds
GET /api/v1/resources/topics
```

资源类别用于主导航和投稿类型；主题是可选的用途或分类筛选条件。迁移期间，旧版 `category_id` 参数仍可作为主题筛选使用，但不会改变资源类别。旧字段 `resource_type` 仍描述文件交付方式（`upload` 或 `external`），不能代替 `resource_kind`。

## 资源发现与推荐

以下 GET 接口允许匿名访问。携带 MindAuth Bearer token 时需要 `resource.read`；无效凭证返回 401，缺少 scope 返回 403。登录会话可读取公开结果。四条接口只返回未删除、`is_public = true`、状态为 `approved` 或 `published`、公开 visibility 且有 `public_id` 的资源，并排除已停用主题下的资源；相关推荐的源资源也必须符合相同条件，否则统一返回 404。

```text
GET /api/v1/resources/discovery/home?kind=schematic&limit=8&page=1
GET /api/v1/resources/discovery/hot?limit=10&page=1
GET /api/v1/resources/discovery/for-you?kind=map&limit=12&page=1
GET /api/v1/resources/discovery/related/{id}?limit=8&page=1
```

`home` 的 `kind` 可选值为 `mod`、`schematic`、`map`、`other`；`limit` 为 1–20，`page` 为 1–400。响应 `data.sections` 固定包含 `featured`、`trending`、`rising`、`top_rated`、`newest`。`for-you` 支持相同 `kind`，`limit` 为 1–30；登录用户仅在存在当前仍公开可见的站内点赞/收藏种子时获得个性化结果，否则返回趋势兜底。`related` 的 `{id}` 是源资源公开 UUID，`limit` 为 1–24。两个推荐接口的 `page` 均为 1–400。

`hot` 按公开资源累计下载量排序，`limit` 为 1–30（默认 10），`page` 为 1–400；它在最多 300 个候选组成的窗口内分页，原因码为 `top_downloaded`。

每个结果条目包含公开资源卡片、排序用 `score` 和稳定 `reasons`。原因值可能是 `editor_pick`、`trending`、`recent_views`、`recent_downloads`、`quality_signals`、`top_rated`、`newest`、`top_downloaded`、`same_kind`、`same_category`、`shared_tags:<tags>`、`kind:<kind>`、`category`、`tags:<tags>`、`featured` 或 `popular_now`。客户端应把原因作为可解释提示，不应把分数当作质量保证。

分页信息位于对应 `data` 中，包含 `page`、`limit`、`items_in_window`、`more_in_window`、`candidate_window_size` 和 `candidate_window_truncated`。榜单通过有上限的候选窗口计算；`candidate_window_truncated: true` 表示可能还有未扫描结果。V1 外层响应仍包含 `meta.request_id`。匿名 for-you 不使用外部浏览历史；个性化只读取用户在 MDTBBS 对当前公开资源的点赞/收藏，以及这些公开资源的公开元数据。

限流：`home` 60 次/分钟，`for-you` 45 次/分钟，`related` 60 次/分钟。参数边界、资源卡片 schema、Reasons 与安全响应以[公开 OpenAPI](/api/openapi/v1.json)为准。

系统解析结果与发布者声明保持区分。兼容记录在可用时会包含来源和可信度，例如 `file_metadata`、`inferred`、`user_declared`、`verified` 或 `admin_verified`。解析器运行版本不等于地图存档中的游戏版本，不能混为一谈。只有存档本身包含游戏版本时，地图元数据才会报告该版本；存档格式版本单独提供。蓝图兼容性是根据已知内容和格式推断的结果，不保证蓝图可在每个游戏版本中加载。

## 重复检测与安全重试

V1 上传客户端可从草稿预览和草稿创建接口获取重复检测结果：

```text
POST /api/v1/resources/drafts/preview
POST /api/v1/resources/drafts
```

结果会区分文件 SHA-256 完全相同、蓝图结构完全相同，以及旋转或镜像归一化后可能相同的蓝图。文件摘要完全相同属于重复提交，最终提交时返回 HTTP 409 和 `RESOURCE_DUPLICATE`。蓝图结构完全相同时，必须填写非空 `duplicate_note`；该说明会随新资源保存，供审核人员检查。归一化匹配只作提示，不会阻止提交。标题或来源 URL 相似也只作为建议。

重复检测只会披露当前用户有权查看的信息。若匹配项为私有或待审核资源，响应只表示“存在匹配”，不返回标题、公开 ID 或数据库 ID。客户端不能利用重复检测判断资源的权限或可见性。

最终创建资源或提交草稿时，客户端可以发送 `Idempotency-Key` 请求头。键按已认证账号隔离，并保留 24 小时。请求超时后，使用相同的键和完全相同的请求重试，即可重放首次结果。相同键搭配不同请求体会返回 HTTP 409 `IDEMPOTENCY_KEY_REUSED`；并发中的同键请求可能返回 `IDEMPOTENCY_IN_PROGRESS`。修改请求内容时必须生成新键。

若公开资源已合并，客户端应遵循 V1 响应中的规范资源重定向信息；资源合并审核属于后台流程，不属于公开客户端操作。

## Resource Center V2 API

V2 在相同的 `resources` 聚合上增加 Mod、蓝图、地图结构化读取视图、owner/collaborator 管理操作、审核时间线/批注和社区工作流。已有 `GET /api/v1/resources/{id}`、`GET /api/v1/resources/{id}/manifest` 和 `/api/v1/game-content/*` 保持原响应语义。V2 类型专属字段、分页、OAuth scope、错误响应、角色、社区反馈/报告和 capabilities 见[Resource Center V2 契约](../resource-center-v2.md)。

V2 路径中的 `{id}` 是 Resource public UUID；版本、文件、Content、报告对象也通过 UUID 暴露。响应仍使用 `{ data, meta }` 外层封装。列表在 `data` 中带 `{ items, pagination: { next_cursor, has_more } }`，cursor 为不透明值；默认 `limit=20`，最大 100。匿名读取可用；携带 MindAuth Bearer 时需要 `resource.read` scope。

Content 索引复用兼容的 Game Content 前缀：`GET /api/v1/game-content/content/search`、`GET /api/v1/game-content/content/{id}` 和 `GET /api/v1/game-content/content/by-name/{type}/{internalName}`。它只搜索已发布 Mod Content，并返回所属 Resource public UUID。旧版 Game Content 蓝图、地图、上传和下载路径均未改动。

Mod 依赖解析 `GET /api/v1/resources/mods/{id}/dependency-resolution` 可选 `version_public_id`（已发布版本 UUID）、`max_depth`（1–12，默认 12）和 `max_nodes`（1–200，默认 200）。响应包括 `unresolved` 未收录依赖、`cycles` 循环路径和 `truncated` 遍历是否受限制；`warnings` 说明限制或其他解析问题。该只读端点匿名可用，携带 Bearer 时需 `resource.read`，限流为 `30 / 60s`。

公开 Mod 问题报告列表 `GET /api/v1/resources/mods/{id}/issue-reports` 支持可选 `version_public_id`、不透明 `cursor` 和 `limit`（默认 20、最大 100）；响应包含报告与作者回复的公开字段，不包含附件元数据或数据库数字 ID。该端点匿名可用，携带 Bearer 时需 `resource.read`，限流为 `60 / 60s`。

提交 Mod 问题报告 `POST /api/v1/resources/mods/{id}/versions/{versionId}/issue-reports` 对同一账号和同一 Release 使用唯一键做幂等 upsert：重复提交更新现有报告内容，不重复创建记录，并保留原 public UUID 与状态。首次提交创建 `open` 报告。

审核 API 包括 `GET /api/v1/resources/{id}/review-events`、分析覆盖忽略的 POST/DELETE `/api/v1/resources/{id}/versions/{versionId}/analysis/overrides`，以及 `POST /api/v1/resources/{id}/review-annotations`。时间线需要 `resource.read`，只对 Resource Owner、active Maintainer/Publisher、管理员或版主开放；支持 UUID `version_public_id` 过滤、`limit=1..100`（默认 50）和 `offset=0..100000`（默认 0），限流 `60 / 60s`。忽略/清除接口需要 `resource.upload`，Owner/Maintainer 可操作且仅能处理现有 ERROR/WARNING finding，限流 `20 / 60s`。字段批注需要 `resource.upload`，仅管理员/版主可写，可带可选版本 UUID，限流 `30 / 60s`。时间线和写响应只返回公开 UUID，不包含内部数值 ID；字段和 DTO 示例见[Resource Center V2 契约](../resource-center-v2.md)。

GitHub Release 来源 API 使用 Resource public UUID。`PUT /api/v1/resources/{id}/source-sync/github` 由 Owner/Maintainer 配置 HTTPS GitHub 仓库 URL、稳定/预发行选择和资产名 include/exclude 过滤（`resource.upload`，10/60s）；`enabled=true` 同时选择加入每 15 分钟一次的有界后台轮询和自动导入，`false` 保留手动读取/导入但关闭调度。`GET /api/v1/resources/{id}/source-sync/github/releases` 供作者手动读取公开 Mod 的 Release 列表及 README/License 预览，可选 `limit=1..30`（默认 20），匿名可读、Bearer 可选 `resource.read`，限流 12/60s；`POST /api/v1/resources/{id}/source-sync/github/import` 由 Owner/Maintainer 显式选取 tag 与资产名，经过隔离区和既有版本分析流程导入（`resource.upload`，5/60s）。自动导入不覆盖既有版本；上游 tag/资产变化、资产匹配歧义或无法验证时会暂停并通知 Owner，等待人工确认。请求验证错误为 400，未登录/无权限为 401/403，资源/来源/资产不可用为 404，GitHub 或下载失败为 502。字段和过滤边界见[Resource Center V2 契约](../resource-center-v2.md)。

版本预览 `GET /api/v1/resources/{id}/versions/{versionId}/preview` 对新 RES 预览返回 302，对历史预览返回原始 PNG 字节，不使用 JSON 响应封装。它优先使用该已发布版本对应的安全预览，并在版本级预览缺失时尝试资源级预览；版本 DTO 只公开预览 URL，不公开存储键。

关系列表包含 `relation_type`、`relation_direction`、非空 `relation_context`，以及目标资源已发布版本的 `version_public_id` 和 `version` 显示值（如有）。`recommended_for` 使用 `opening`、`production`、`defense`、`logistics` 和 `general` 表示推荐用途。创建支持 `recommended_for`、`fork_of`、`successor_of`、`related`、`requires` 和 `compatible_with`；Fork/继任必须关联相同资源类型的目标资源和一个已发布目标版本。工作台会显示关联方向、上游资源及其版本。

管理操作使用 `resource.upload` scope，并按角色控制：Owner/Maintainer 可编辑资料和关系，Owner/Maintainer/Publisher 可分析或发布版本，协作者邀请由 Owner/Maintainer 发起，Owner/Admin 可发起所有权转让，接收方需接受。分析与发布的 multipart 上传限流为 `5 / 60s`。来源 URL 或许可证声明变更会将已审核资源重新置为待审核。

社区写操作也使用 `resource.upload` scope：地图版本反馈、Mod 兼容性/问题报告和冲突报告需要登录及手机号验证；每个地图版本每个账号只保留一份反馈，公开 GET 只返回计数与评分平均值。报告作者可以更新自己的报告，Owner/Maintainer 可回复涉及的 Mod 报告。报告 JSON 的兼容 `attachments` 字段仍只接受元数据；问题报告二进制证据通过 `POST /api/v1/resources/mods/issue-reports/{reportId}/attachments` 上传，兼容性报告使用 `POST /api/v1/resources/mods/compatibility-reports/{reportId}/attachments`。两种路径均支持同路径 GET 清单、追加 `/{attachmentId}` 的 GET 原始字节下载或 DELETE 管理。上传限 PNG/JPEG/GIF/WebP 与 UTF-8 TXT/LOG/JSON/CRASH，单文件最多 5 MiB、每报告最多 10 个文件且总计最多 20 MiB；超单文件限制返回 413，其他格式/单报告限制返回 400。仅报告作者可上传/删除，上传还需手机号验证。私有附件留在隔离目录，`resource.read` 读取仅向报告作者、关联 Resource Owner/active Owner/Maintainer/Publisher、管理员/版主开放；附件清单的 `can_delete` 仅对报告作者为 `true`。公开报告投影不含附件字段。下载使用 `Cache-Control: private, no-store` 与 `nosniff`。上传前请清除 IP、令牌、用户名、本机路径等敏感内容。所有公开资源、版本、报告与附件标识均为 UUID；具体字段、限流和状态枚举见上述 V2 契约。

## ResourceStorage 直传

`POST /api/v1/resources/uploads/init` 接受 `version_public_id`、`filename`、`size_bytes`、`mime_type`、必填 `sha256` 和可选 `role`（primary/supplementary/documentation）。需要 `resource.upload`、登录、站点验证和资源 Owner/active Maintainer/Publisher（Admin 可管理），限流 10/60s。已发布版本不可变。已有主文件不可替换。

客户端使用返回的短期 token 向 RES PUT 原始字节（或接收去重对象），随后 `POST /api/v1/resources/uploads/complete` 携带论坛 `session_id` 和 `object_public_id`。论坛重新验证权限、版本状态和 RES verified 元数据，创建 pending ResourceFile 与私有 binding；重放 complete 返回同一 file_public_id。论坛不会向客户端暴露服务 API key。

资源首次创建可使用 `POST /api/v1/resources/direct-drafts`，只提交元数据并返回 upload_pending 首版本；已有 Resource 可使用 `POST /api/v1/resources/{id}/versions/direct-drafts` 创建新的 upload_pending revision。两个接口都要求 `Idempotency-Key`，文件字节只经过 RES，不经过论坛的 multipart body。直传 complete 仍必须由论坛重新读取对象元数据并进入审核，不能通过客户端自报大小、MIME 或哈希提前发布。

Owner/Maintainer 可以对已发布蓝图调用 `POST /api/v1/resources/{id}/versions/{versionId}/schematic-editor/export`，或对已发布地图调用 `POST /api/v1/resources/{id}/versions/{versionId}/map-editor/export`。两者返回官方 Mindustry 文件，不修改源版本；客户端应把导出文件作为新 direct-upload revision 提交。蓝图编辑支持有限的方块/静态逻辑操作，地图编辑支持完整小型地形网格、类型化规则和波次子集；未知或超界内容会拒绝导出，具体边界见[蓝图安全编辑器](../schematic-editor.md)和[地图安全编辑器](../map-editor.md)。

RES 文件下载与新预览使用 302；客户端应跟随跳转。下载授权和 DownloadGrant 保留在论坛，私有链接短期有效。存储不可用返回 503，不会持久回退本地。历史 managed/MFL/external 保持兼容。上传与手动迁移运维细节见 [ResourceStorage](../resource-storage.md)。
