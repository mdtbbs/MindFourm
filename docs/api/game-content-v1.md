# Game Content API V1

Game Content V1 是 Mindustry 蓝图和地图的一等客户端接口。

Base URL:

```text
/api/v1/game-content
```

它和通用 Resource V1 共用底层 Resource domain，但提供更适合游戏内 Mod、桌面客户端和移动端的结构。

## 1. Meta

```http
GET /api/v1/game-content/meta
```

返回：

- API version
- 支持内容类型
- 功能能力
- 默认/最大分页数量
- 蓝图最大 payload
- 地图最大上传尺寸

客户端可以用它补充 `/api/v1/capabilities` 的全局能力发现。

## 2. 浏览蓝图和地图

```http
GET /api/v1/game-content/blueprints
GET /api/v1/game-content/maps
```

Query:

| 参数 | 说明 |
| --- | --- |
| `q` | 搜索词 |
| `sort` | `latest` / `trending` / `featured` / `all` |
| `order` | `ASC` / `DESC` |
| `tags` | 标签过滤 |
| `gameVersion` | 游戏版本 |
| `author` | 作者 |
| `cursor` | 游标 |
| `limit` | 默认 20，最大 50 |

列表 item 包含：

- `id`
- `resourceId`
- `type`
- `title`
- `summary`
- `author`
- `preview.thumbnail`
- `game.version`
- `game.minBuild`
- `tags`
- `stats.downloads`
- `stats.likes`
- `stats.favorites`
- `stats.views`
- `featured`
- `createdAt`
- `updatedAt`

分页结构：

```json
{
  "data": {
    "data": [],
    "pagination": {
      "nextCursor": null,
      "hasMore": false
    }
  },
  "meta": {
    "request_id": "..."
  }
}
```

注意这里业务 payload 自己包含 `data + pagination`，外层仍有 V1 envelope。

## 3. 详情

```http
GET /api/v1/game-content/blueprints/{id}
GET /api/v1/game-content/maps/{id}
```

蓝图额外包含：

- `materials[]`
- `blocks[]`
- `links.code`

`materials` 和 `blocks` 都提供：

- 机器可用的 `id`
- 中文/展示名 `name`
- 数量
- 可用时提供 `icon`

地图额外包含：

- `map.mode`
- `map.players`
- `map.planet`
- `map.resources`
- `map.cores`
- `map.waves`
- `file.size`
- `file.sha256`
- `links.download`

登录用户还可以收到 `viewer`：

```json
{
  "liked": false,
  "favorited": true,
  "canEdit": false
}
```

详情读取会进入真实 view 统计逻辑。匿名访问会使用派生 client key 去重，登录用户按用户身份去重。

## 4. 蓝图代码

```http
GET /api/v1/game-content/blueprints/{id}/code
```

响应业务体：

```json
{
  "id": "bp_...",
  "code": "bXNjaAF4n..."
}
```

该 endpoint 用于游戏内“一键复制/导入”。

限流：`60 / 60s`。

## 5. Preview

```http
GET /api/v1/game-content/blueprints/{id}/preview
GET /api/v1/game-content/maps/{id}/preview
```

这是 raw response，返回图片字节，不使用 JSON envelope。

如果预览尚未生成或不可用，客户端应该保留原资源功能，不要把“预览失败”等同于“资源不可下载”。

## 6. 地图下载

获取下载信息：

```http
GET /api/v1/game-content/maps/{id}/download
```

实际下载：

```http
GET /api/v1/game-content/maps/{id}/download/file
```

`/download/file` 是 raw response，可能：

- 直接 stream 本地/托管文件
- 重定向到安全的外部下载地址

响应可能包含：

```http
Content-Type: application/octet-stream
Content-Disposition: attachment; ...
Content-Length: ...
ETag: "<sha256-or-content-hash>"
Cache-Control: private, no-store
```

实际文件下载限流：`30 / 60s`。

客户端应校验 `ETag` / manifest 中 hash，并保留失败重试策略。

## 7. Feed

```http
GET /api/v1/game-content/feed?type=all&limit=20
```

`type`:

- `featured`
- `latest`
- `trending`
- `all`

`featured` 来自管理员/版主精选状态。
`trending` 使用近期下载、点赞、收藏等持久化事件计算，不应把 lifetime download count 当成唯一热度依据。

## 8. 搜索与标签

```http
GET /api/v1/game-content/search?q=router&type=all
GET /api/v1/game-content/tags
```

搜索必须提供非空 `q`。

`type`:

- `all`
- `blueprint`
- `map`

`all` 模式允许服务端为多个资源类型维护独立 cursor。客户端必须把服务端返回的 cursor 原样传回，不要解析或拼接内部结构。

搜索限流：`60 / 60s`。
tags 限流：`60 / 60s`。

## 9. 蓝图提交

```http
POST /api/v1/game-content/blueprints
Authorization: Bearer <MindAuth access token>
Content-Type: application/json
```

Body:

```json
{
  "title": "示例蓝图",
  "description": "可选说明",
  "code": "bXNjaAF4n...",
  "tags": ["物流", "v8"]
}
```

限制：

- `title`: 最大 255
- `description`: 最大 20,000
- `tags`: 最大 30 个
- `code`: 最大约 28 MiB 字符长度限制
- endpoint 限流：`5 / 3600s`

提交会进入现有 Resource 审核流程，不等于立即公开。

## 10. 地图上传

### 10.1 开始上传

```http
POST /api/v1/game-content/maps/uploads
Authorization: Bearer <MindAuth access token>
Content-Type: multipart/form-data
```

字段：

- `file`: 必须是 `.msav`
- `sha256`: 64 位十六进制 SHA-256

服务器限制：

- 单文件
- 硬上限 20 MiB
- 可以通过 `GAME_CONTENT_MAP_MAX_BYTES` 配置更小值
- 最多 8 个 multipart fields
- 单 field 最大 64 KiB
- endpoint 限流：`3 / 3600s`

服务端会：

1. 把文件放入 quarantine incoming 目录。
2. 校验扩展名和上传安全规则。
3. 计算 SHA-256 并与客户端值比较。
4. 创建可恢复的 upload session。
5. 触发/读取地图解析和 preview 数据。
6. 返回 `uploadId`、过期时间和私有 preview 地址。

### 10.2 查询 session

```http
GET /api/v1/game-content/maps/uploads/{uploadId}
Authorization: Bearer <MindAuth access token>
```

状态可能为：

- `uploaded`
- `processing`
- `completed`
- `failed`
- `expired`

响应还包含：

- `expiresAt`
- 完成后 `resourceId`

### 10.3 私有 preview

```http
GET /api/v1/game-content/maps/uploads/{uploadId}/preview
Authorization: Bearer <MindAuth access token>
```

raw image response。

### 10.4 完成提交

```http
POST /api/v1/game-content/maps/uploads/{uploadId}/complete
Authorization: Bearer <MindAuth access token>
Content-Type: application/json
```

Body:

```json
{
  "title": "地图名称",
  "description": "可选",
  "tags": ["生存"]
}
```

同一 upload session 的完成请求应具备可重试语义，避免因为客户端重试重复创建 Resource。

## 11. 点赞与收藏

```http
POST   /api/v1/game-content/blueprints/{id}/like
DELETE /api/v1/game-content/blueprints/{id}/like

POST   /api/v1/game-content/maps/{id}/like
DELETE /api/v1/game-content/maps/{id}/like

POST   /api/v1/game-content/{type}/{id}/favorite
DELETE /api/v1/game-content/{type}/{id}/favorite
```

需要 MindAuth Bearer，并检查发布权限条件。

`type` 只应使用：

- `blueprint`
- `map`

点赞和收藏接口应当按最终状态设计客户端 UI，不要依赖重复点击次数。

## 12. 当前用户

```http
GET /api/v1/game-content/me
GET /api/v1/game-content/me/favorites?limit=20
GET /api/v1/game-content/me/resources?limit=20
```

需要 MindAuth Bearer。

## 13. 常见错误

| code | 含义 |
| --- | --- |
| `AUTH_REQUIRED` | 需要 MindAuth Bearer |
| `INVALID_TOKEN` | token 无效或过期 |
| `PERMISSION_DENIED` | 账号当前不满足写入条件 |
| `TERMS_ACCEPTANCE_REQUIRED` | 需要先接受社区条款 |
| `USER_BANNED` | 账号被封禁 |
| `SEARCH_QUERY_REQUIRED` | 搜索缺少关键词 |
| `INVALID_CURSOR` | cursor 无效 |
| `INVALID_MAP` | 地图文件格式/上传失败 |
| `HASH_MISMATCH` | SHA-256 缺失或不匹配 |
| `RESOURCE_NOT_AVAILABLE` | 原始文件或 preview 当前不可用 |
| `RATE_LIMITED` | 超过限流 |
| `UPLOAD_TOO_LARGE` | 上传超过限制 |

客户端应该读取 `error.code`，不要解析 `message`。

## 14. 缓存建议

服务端已为公开读接口设置缓存头。客户端可以遵守：

- 列表：短缓存
- 详情：短到中等缓存
- 蓝图 code：长缓存，immutable
- tags：较长缓存
- 下载文件：private / no-store

如果用户已登录且响应包含 viewer 状态，客户端不要把个性化响应错误共享给其他用户。
