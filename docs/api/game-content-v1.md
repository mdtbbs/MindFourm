# 游戏内容 API V1

游戏内容 API V1 为 Mindustry 蓝图和地图提供稳定的客户端接口。

基础路径：

```text
/api/v1/game-content
```

它与通用资源 V1 共用底层资源域，但提供了更适合游戏内模组、桌面客户端和移动端的结构。

## 能力与上传限制

```http
GET /api/v1/game-content/meta
```

返回：

- API 版本
- 支持内容类型
- 功能能力
- 默认/最大分页数量
- 蓝图请求数据的最大尺寸
- 地图最大上传尺寸

客户端可以用它补充 `/api/v1/capabilities` 的全局能力发现。

## 浏览蓝图和地图

```http
GET /api/v1/game-content/blueprints
GET /api/v1/game-content/maps
```

查询参数：

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

列表条目包含：

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

注意：这里的业务数据本身包含 `data + pagination`，外层仍有 V1 响应封装。

## 查看详情

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

蓝图详情还提供缓存的 `production` 分析（旧蓝图尚未由新版渲染器重新解析时为 `null`）。其中 `mode` 固定为 `theoretical`，表示假设可分析设施持续满负载运行，不代表地图中的实际产量；所有速率单位均为每秒。

```json
{
  "production": {
    "mode": "theoretical",
    "complete": true,
    "available": true,
    "items": {
      "inputs": [{ "id": "coal", "name": "煤", "icon": null, "rate": 12 }],
      "outputs": [{ "id": "graphite", "name": "石墨", "icon": null, "rate": 6 }],
      "internal": [{ "id": "graphite", "name": "石墨", "icon": null, "produced": 6, "consumed": 4, "net": 2 }]
    },
    "liquids": { "inputs": [], "outputs": [], "internal": [] },
    "power": { "generated": 900, "consumed": 1320, "net": -420 },
    "warnings": []
  }
}
```

- `inputs` / `outputs` 按全蓝图净值抵消后生成；`internal` 保留完整的产量、消耗量和 `net = produced - consumed` 统计。
- 液体的输入、输出与内部统计按 Mindustry 的定义换算为每秒速率；图标和中文名沿用渲染器中的物品、液体和方块元数据。
- `power.generated`、`power.consumed` 和 `power.net` 均为每秒电力，`net = generated - consumed`。
- `complete` 在存在未确定因素或缺失内容时为 `false`；已知部分仍会返回。`available: false` 表示蓝图不含可分析生产设施，例如纯物流蓝图或仅有电池 / 电力节点。
- `warnings` 可包含 `terrain-dependent`（钻头、泵依赖地形）、`environment-dependent`（AttributeCrafter、ThermalGenerator 等依赖环境属性）、`unknown-content`（缺少模组内容定义）、`unknown-rate`、`analysis-truncated` 和 `boost-not-simulated`（未模拟超速效果）等标记。未知模组方块会被官方解析器映射为空气；警告中的 `count` 为 `null` 表示无法安全取得其放置数量。
- 概率产物会在对应输出项上标记 `estimated: true`，其速率是长期数学期望，不保证每个生产周期都得到该产物。
- API 元数据端点 `/meta` 和全局 `/api/v1/capabilities` 提供 `blueprintProductionAnalysis` / `blueprint_production_analysis` 能力标志。

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

成功读取详情会递增真实浏览量。匿名访问使用派生客户端标识去重，登录用户按账号身份去重。

## 蓝图代码

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

该接口用于游戏内“一键复制/导入”。

限流：`60 / 60s`。

## 预览

```http
GET /api/v1/game-content/blueprints/{id}/preview
GET /api/v1/game-content/maps/{id}/preview
```

这是原始响应，直接返回图片字节，不使用 JSON 响应封装。

如果预览尚未生成或不可用，客户端应该保留原资源功能，不要把“预览失败”等同于“资源不可下载”。

## 下载地图

获取下载信息：

```http
GET /api/v1/game-content/maps/{id}/download
```

实际下载：

```http
GET /api/v1/game-content/maps/{id}/download/file
```

`/download/file` 是原始响应，可能：

- 直接传输本地或托管文件
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

客户端应校验 `ETag` 或资源清单中的文件摘要，并保留失败重试策略。

## 内容动态

```http
GET /api/v1/game-content/feed?type=all&limit=20
```

`type`:

- `featured`
- `latest`
- `trending`
- `all`

`featured` 来自管理员/版主精选状态。
`trending` 根据近期下载、点赞、收藏等持久化事件计算，不应只用累计下载量判断热度。

## 搜索与标签

```http
GET /api/v1/game-content/search?q=router&type=all
GET /api/v1/game-content/tags
```

搜索必须提供非空 `q`。

`type`:

- `all`
- `blueprint`
- `map`

`all` 模式允许服务端为多个资源类型分别维护游标。客户端必须原样传回服务端返回的游标，不要解析或拼接其内部结构。

搜索限流：`60 / 60s`。
标签限流：`60 / 60s`。

## 提交蓝图

```http
POST /api/v1/game-content/blueprints
Authorization: Bearer <MindAuth access token>
Content-Type: application/json
```

请求体：

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
- 接口限流：`5 / 3600s`

提交会进入现有资源审核流程，不代表内容会立即公开。

## 上传地图

### 开始上传

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
- 实际限制以 `GET /api/v1/game-content/meta` 返回的当前能力为准
- 最多 8 个 multipart/form-data 字段
- 单个字段最大 64 KiB
- 接口限流：`3 / 3600s`

服务端会：

1. 把文件放入隔离区的待处理目录。
2. 校验扩展名和上传安全规则。
3. 计算 SHA-256 并与客户端值比较。
4. 创建可恢复的上传会话。
5. 触发或读取地图解析和预览数据。
6. 返回 `uploadId`、过期时间和私有预览地址。

### 查询上传会话

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

### 读取私有预览

```http
GET /api/v1/game-content/maps/uploads/{uploadId}/preview
Authorization: Bearer <MindAuth access token>
```

响应直接返回图片二进制内容，不使用 JSON 结构。

### 完成提交

```http
POST /api/v1/game-content/maps/uploads/{uploadId}/complete
Authorization: Bearer <MindAuth access token>
Content-Type: application/json
```

请求体：

```json
{
  "title": "地图名称",
  "description": "可选",
  "tags": ["生存"]
}
```

同一上传会话的完成请求应支持安全重试，避免客户端重试时重复创建资源。

## 点赞与收藏

```http
POST   /api/v1/game-content/blueprints/{id}/like
DELETE /api/v1/game-content/blueprints/{id}/like

POST   /api/v1/game-content/maps/{id}/like
DELETE /api/v1/game-content/maps/{id}/like

POST   /api/v1/game-content/{type}/{id}/favorite
DELETE /api/v1/game-content/{type}/{id}/favorite
```

需要 MindAuth Bearer 令牌，并检查发布权限条件。

`type` 只应使用：

- `blueprint`
- `map`

点赞和收藏接口应当按最终状态设计客户端界面，不要依赖重复点击次数。

## 当前用户

```http
GET /api/v1/game-content/me
GET /api/v1/game-content/me/favorites?limit=20
GET /api/v1/game-content/me/resources?limit=20
```

需要 MindAuth Bearer 令牌。

## 常见错误

| 错误码 | 含义 |
| --- | --- |
| `AUTH_REQUIRED` | 需要 MindAuth Bearer 令牌 |
| `INVALID_TOKEN` | 令牌无效或过期 |
| `PERMISSION_DENIED` | 账号当前不满足写入条件 |
| `TERMS_ACCEPTANCE_REQUIRED` | 需要先接受社区条款 |
| `USER_BANNED` | 账号被封禁 |
| `SEARCH_QUERY_REQUIRED` | 搜索缺少关键词 |
| `INVALID_CURSOR` | 游标无效 |
| `INVALID_MAP` | 地图文件格式/上传失败 |
| `HASH_MISMATCH` | SHA-256 缺失或不匹配 |
| `RESOURCE_NOT_AVAILABLE` | 原始文件或预览当前不可用 |
| `RATE_LIMITED` | 超过限流 |
| `UPLOAD_TOO_LARGE` | 上传超过限制 |

客户端应该读取 `error.code`，不要解析 `message`。

## 缓存建议

服务端已为公开读接口设置缓存头。客户端可以遵守：

- 列表：短缓存
- 详情：短到中等缓存
- 蓝图编码：长期缓存且内容不可变
- 标签：较长缓存
- 下载文件：仅私有缓存 / 禁止缓存

如果用户已登录且响应包含浏览者状态，客户端不要把个性化响应错误共享给其他用户。
