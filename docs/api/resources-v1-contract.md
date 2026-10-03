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
