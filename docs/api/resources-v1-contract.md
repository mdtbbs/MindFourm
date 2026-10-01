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
GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download
```

迁移兼容期间，列表接口支持 `limit`、`offset` 和 `q` 参数。Manifest 是启动器和游戏内客户端同步资源的依据，只包含公开 UUID、已发布版本、兼容信息、依赖、文件 Hash，以及服务端计算的 `downloadable` / `installable` 状态。客户端可以定期读取它，不必保存数据库数字 ID。

目前，登录用户的资源互动仍使用旧版接口：

```text
GET    /api/resources/{numeric_id}/like
POST   /api/resources/{numeric_id}/like
DELETE /api/resources/{numeric_id}/like
```

点赞操作是幂等的。评论继续使用现有资源讨论接口。旧版资源读取响应可能增加 `comment_count` 字段，只统计当前可见的公开评论；`rating_count`、`rating_sum` 和 `rating_average` 仍表示评分汇总。V1 响应结构保持不变。

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

## Manifest 结构

Manifest 与面向用户展示的详情响应分开：

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

- 安装文件前检查可用状态，并校验文件 Hash。
- 缺失的元数据表示“未知”，不能据此认定资源兼容。
- API 服务端不会执行模组代码。模组上传会按大小限制解析为归档文件，Manifest 也按不可信输入处理。
- 预览失败不应导致已审核的原始文件被标记为不可用。

## 资源类别、主题与兼容信息来源

`resource_kind` 是内容类别的权威值，由共享注册表维护。客户端应读取当前注册表，不要自行维护副本：

```text
GET /api/v1/resources/kinds
GET /api/v1/resources/topics
```

资源类别用于主导航和投稿类型；主题是可选的用途或分类筛选条件。迁移期间，旧版 `category_id` 参数仍可作为主题筛选使用，但不会改变资源类别。旧字段 `resource_type` 仍描述文件交付方式（`upload` 或 `external`），不能代替 `resource_kind`。

系统解析结果与发布者声明保持区分。兼容记录在可用时会包含来源和可信度，例如 `file_metadata`、`inferred`、`user_declared`、`verified` 或 `admin_verified`。解析器运行版本不等于地图存档中的游戏版本，不能混为一谈。只有存档本身包含游戏版本时，地图元数据才会报告该版本；存档格式版本单独提供。蓝图兼容性是根据已知内容和格式推断的结果，不保证蓝图可在每个游戏版本中加载。

## 重复检测与安全重试

登录后的旧版 Web 客户端可在提交前检查文件或蓝图：

```text
POST /api/resources/duplicates/check
```

V1 上传客户端可从草稿预览和草稿创建接口获取相同的重复检测结果：

```text
POST /api/v1/resources/drafts/preview
POST /api/v1/resources/drafts
```

结果会区分文件 SHA-256 完全相同、蓝图结构完全相同，以及旋转或镜像归一化后可能相同的蓝图。文件 Hash 完全相同属于重复提交，最终提交时返回 HTTP 409 和 `RESOURCE_DUPLICATE`。蓝图结构完全相同时，必须填写非空 `duplicate_note`；该说明会随新资源保存，供审核人员检查。归一化匹配只作提示，不会阻止提交。标题或来源 URL 相似也只作为建议。

重复检测只会披露当前用户有权查看的信息。若匹配项为私有或待审核资源，响应只表示“存在匹配”，不返回标题、公开 ID 或数据库 ID。客户端不能利用重复检测判断资源的权限或可见性。

最终创建资源或提交草稿时，客户端可以发送 `Idempotency-Key` 请求头。键按已认证账号隔离，并保留 24 小时。请求超时后，使用相同的键和完全相同的请求重试，即可重放首次结果。相同键搭配不同请求体会返回 HTTP 409 `IDEMPOTENCY_KEY_REUSED`；并发中的同键请求可能返回 `IDEMPOTENCY_IN_PROGRESS`。修改请求内容时必须生成新键。

## 管理员合并重复资源

Web 管理接口提供预览和显式合并操作：

```text
GET  /api/resources/admin/{sourceId}/merge-preview?target_id={targetId}
POST /api/resources/admin/{sourceId}/merge
```

这些使用数据库数字 ID 的路由仅供管理员使用，不属于公开 V1。预览会列出可迁移的关联数据和版本冲突。合并事务会将符合条件的历史记录与关联迁移到目标资源。无冲突的版本会完整迁移；冲突版本不会覆盖目标版本。只有双方版本都已发布时，才会将可用附件作为补充文件迁移。其他冲突版本保留在源资源中，并将 ID 对应关系写入合并审计。若目标资源缺少根文件或外部链接，旧资源中的值可以补上。合并会记录审计日志，并将源资源保留为合并别名；读取源资源时会解析到规范目标。

系统不会自动合并或删除重复资源，必须由审核人员检查并发起合并。旧版数字 ID 资源路由返回 HTTP 301。V1 查询已合并的 `public_id` 时也返回 HTTP 301、`Location` 响应头，以及包含 `merged`、`canonical_public_id` 和 `redirect_url` 的响应体。

应用完整性迁移后，可运行 `npm run report:resource-duplicates` 查看历史重复分组。该命令只读，会检查根资源和活动版本、文件 Hash，报告蓝图的精确与归一化指纹；不会修改或合并现有记录。
