# 通用 Blob 存储 V1

`/api/v1/blobs` 提供与具体业务无关的二进制存储。它解决的是「要存一份文件」这件事本身：调用方自己决定 namespace、key、元数据和业务引用，存储层只负责内容去重、引用计数、所有者绑定和延迟回收。

它与资源文件（ResourceStorage）是两套独立的存储，用途不同：

| | `/api/v1/blobs` | 资源文件 |
|---|---|---|
| 业务语义 | 无。key、元数据、引用由调用方定义 | 绑定资源版本、审核与下载授权 |
| 版本与审核 | 不做 | 有 |
| 面向对象 | 论坛自身功能与其他需要存字节的模块 | 资源中心 |
| 类型校验 | 仅约束声明值，不做内容识别 | 按资源类型解析与校验 |

需要审核、版本管理和下载计量的文件仍然走资源上传。不要把资源二进制改走 `/v1/blobs`。

## 数据模型

- **object（对象）**：按内容寻址的实际字节。唯一键是 `(namespace, owner_type, owner_id, sha256, size_bytes)`，也就是说相同内容在**同一 namespace 内的同一所有者**下只存一份。
- **blob（绑定）**：面向业务的命名引用。同一对象可以被多个绑定指向，`ref_count` 因此有意义；只有最后一个绑定消失并且宽限期结束后，字节才会被回收。
- **upload session（上传会话）**：一次暂存上传。会话本身就是鉴权上下文，别人的 `upload_id` 解析不到任何东西。

去重**不跨所有者**。全局共享内容寻址会让「删除我自己的文件」变得无法回答——同一个对象可能同时被另一个账号引用着。把唯一键收窄到所有者范围内，去重只发生在这个所有者本来就有权读取的数据之间。

`visibility` 有两种取值：

- `private`（默认）：只有所有者能读到。其他账号得到与「不存在」完全相同的 404，因此无法通过状态码探测他人是否存有某个 blob。
- `public`：任何人（包括未登录）都能读取，只要拿到 blob ID。是否公开由上传方自己决定。

## 访问权限与所有权

- 所有写操作归属于当前已认证用户；请求不能指定其他 `owner_id`。
- OAuth 权限范围：`blob.read`、`blob.write`、`blob.delete`。
- 读取 `public` blob 无需登录；读取 `private` blob 需要所有者身份。
- 除 `GET /blobs/{blobId}/content` 返回二进制外，其余接口返回 `{ data, meta }` 信封。

## 上传流程

三步，且每一步都可以安全重试：

1. `POST /blobs` 登记目标 key 与内容指纹，拿到 `upload_id`。
2. `PUT /blobs/uploads/{uploadId}/content` 上传原始字节。
3. `POST /blobs/uploads/{uploadId}/commit` 提交，服务端复核后创建可读写 blob。

如果服务端发现该所有者已有相同内容，第 1 步会返回 `deduplicated: true` 且**不带** `upload.url`——此时不需要第 2 步。但第 3 步仍然要调用：客户端只需要实现一条流程，而不是两条。

`PUT` 请求体必须是 `application/octet-stream`。用 JSON 或表单编码会先被请求体解析器处理，导致服务端计算摘要的字节被改动，因此这类请求直接返回 415。

服务端**从不信任**客户端声明的大小与 SHA-256：字节落盘后会重新读取校验，一致才写入可读行。任何不一致都会拒绝并且不留下半份文件。

`POST /blobs` 与 `POST /blobs/uploads/{uploadId}/commit` 接受 `Idempotency-Key`（按所有者区分，保留 24 小时）。同一个 key 重复提交相同请求会返回第一次的结果；用于不同请求则返回 `IDEMPOTENCY_KEY_REUSED`。

## API 路径

路径均相对于 `/api/v1`。

| 方法 | 路径 | 权限 | 用途 |
|---|---|---|---|
| GET | `/blobs/quota` | `blob.read` | 已用字节、配额、单对象上限与有效 blob 数量 |
| GET | `/blobs?namespace=&ref_type=&ref_id=&limit=30&cursor=` | `blob.read` | 列出当前所有者的 blob；`limit` 默认 30，范围 1–100 |
| POST | `/blobs` | `blob.write` | 创建上传会话 |
| PUT | `/blobs/uploads/{uploadId}/content` | `blob.write` | 上传原始字节，必须 `application/octet-stream` |
| POST | `/blobs/uploads/{uploadId}/commit` | `blob.write` | 提交，创建可读写 blob |
| DELETE | `/blobs/uploads/{uploadId}` | `blob.write` | 放弃上传会话 |
| GET | `/blobs/{blobId}` | 读取 | 查看元数据；`public` 无需登录 |
| GET | `/blobs/{blobId}/content` | 读取 | 下载原始字节；`public` 无需登录 |
| PATCH | `/blobs/{blobId}` | `blob.write` | 更新 key、文件名、可见性、元数据、标签与业务引用 |
| DELETE | `/blobs/{blobId}` | `blob.delete` | 删除绑定 |

## 字段说明

创建时：

| 字段 | 说明 |
|---|---|
| `namespace` | 可选，默认 `default`。同一所有者下隔离 key 命名空间。`system`、`admin`、`internal`、`platform` 为保留名 |
| `key` | 逻辑名，同一所有者在一个 namespace 内唯一。写入已占用的 key 会**替换**该 blob |
| `file_name` | 下载时回显的文件名 |
| `size_bytes` | 声明的字节数，必须与实际上传一致 |
| `sha256` | 声明的内容摘要，64 位十六进制，必须与实际上传一致 |
| `mime_type` | 声明的类型。只影响下载响应头，不作为内容判定依据 |
| `visibility` | `private`（默认）或 `public` |
| `metadata` | 任意 JSON 对象，最大 16 KiB |
| `tags` | 字符串数组，最多 32 个 |
| `ref_type` / `ref_id` | 可选业务引用，仅用于列表过滤 |
| `expires_in_seconds` | 可选临时 blob 生存期（60 秒–30 天）。到期后由维护任务回收 |

`key` 是**槽位**：向同一 key 写入新内容会替换旧 blob，旧绑定被软删除并释放引用。需要保留历史版本时，请为每个版本使用不同的 key。

## 响应头与缓存

`GET /blobs/{blobId}/content` 返回：

- `ETag: "sha256-<摘要>"`：内容是内容寻址的，摘要天然适合做校验标记，客户端可用它跳过重复下载。
- `Content-Disposition`：白名单内的媒体类型用 `inline`，其余一律 `attachment`。
- `X-Content-Type-Options: nosniff`
- `Cache-Control: private, max-age=0, must-revalidate`

存储的 `mime_type` 来源于上传者，无法通过内容嗅探证实。因此只有下列类型会内联渲染：`image/png`、`image/jpeg`、`image/gif`、`image/webp`、`image/avif`、`audio/mpeg`、`audio/ogg`、`audio/wav`、`video/mp4`、`video/webm`、`application/pdf`、`text/plain`。其余类型（包括 `text/html` 与 `image/svg+xml`）一律以 `application/octet-stream` + `attachment` 返回，这样上传者无法把声明类型变成可执行内容。

## 回收与删除

删除是两段式的，客户端不需要理解中间状态：

1. `DELETE /blobs/{blobId}` 软删除绑定，`ref_count` 减一。
2. 引用数归零后对象进入宽限期（默认 24 小时），到期由维护任务删除字节。

宽限期的意义是：正在并发进行中的上传或重试仍可以复用同一份内容，而不必重新上传。因此**删除后立即用相同内容重新上传是允许的**，不会产生第二份副本。

维护任务每小时运行一次，处理：过期上传会话、带 `expires_in_seconds` 的过期 blob、引用数为零且超过宽限期的对象、过期的幂等记录。

## 配额

`GET /blobs/quota` 返回 `used_bytes`、`limit_bytes`、`max_object_bytes` 与 `blob_count`。`used_bytes` 包含已提交的对象与进行中上传的预占额度，避免并行上传叠加超出配额。

空间不足时返回 `BLOB_QUOTA_EXCEEDED`（409）。单对象超限返回 `BLOB_FILE_TOO_LARGE`（413）。

## 错误处理

| 错误码 | HTTP | 可重试 | 说明 |
|---|---|---|---|
| `BLOBS_DISABLED` | 403 | 否 | 站点未启用该功能 |
| `BLOB_NOT_FOUND` | 404 | 否 | 不存在、已删除、已过期，或不可见 |
| `BLOB_KEY_INVALID` | 400 | 否 | namespace 或 key 不合法 |
| `BLOB_KEY_CONFLICT` | 409 | 否 | 目标 key 已被其他 live blob 占用 |
| `BLOB_METADATA_INVALID` | 400 | 否 | 文件名、MIME、元数据、标签、引用或过期时间不合法 |
| `BLOB_INVALID_HASH` | 400 | 否 | `sha256` 不是 64 位十六进制 |
| `BLOB_FILE_TOO_LARGE` | 413 | 否 | 超过单对象上限 |
| `BLOB_QUOTA_EXCEEDED` | 409 | 否 | 超出所有者配额 |
| `BLOB_UPLOAD_NOT_FOUND` | 404 | 否 | 上传会话不存在或不属于当前所有者 |
| `BLOB_UPLOAD_EXPIRED` | 410 | 否 | 会话已过期或已取消 |
| `BLOB_UPLOAD_ALREADY_COMMITTED` | 409 | 否 | 会话已提交 |
| `BLOB_UPLOAD_OBJECT_MISSING` | 409 | 否 | 尚未收到字节 |
| `BLOB_UPLOAD_SIZE_MISMATCH` | 409 | 否 | 实际大小与声明不符 |
| `BLOB_UPLOAD_CHECKSUM_MISMATCH` | 409 | 否 | 实际摘要与声明不符 |
| `BLOB_UPLOAD_LIMIT_REACHED` | 429 | 是 | 未完成会话过多（上限 20），先提交或取消 |
| `BLOB_STORAGE_UNAVAILABLE` | 503 | 是 | 存储后端不可用或未配置 |

`BLOB_*` 系列的 `409` 表示**本次请求不会被自动修复**：大小或摘要不一致意味着字节在传输中被改动，原样重试只会再次失败。

## 能力发现

`GET /api/v1/capabilities` 的 `blobs_v1` 表示功能已开启且存储目录可用。为 `false` 时任何操作都会返回 `BLOBS_DISABLED` 或 `BLOB_STORAGE_UNAVAILABLE`，客户端应隐藏入口。

## 运维配置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `blobs_enabled` | `false` | 功能总开关 |
| `blobs_storage_path` | `<cwd>/storage/blobs` | 持久化目录，必须是绝对路径且非根目录；有对象时不能直接更改 |
| `blobs_owner_quota_bytes` | 536870912（512 MiB） | 每所有者配额 |
| `blobs_max_object_bytes` | 67108864（64 MiB） | 单对象上限，不能超过配额 |

当前唯一的存储后端是本地磁盘（`storage_provider=local`）。对象行记录了 provider，后续增加其他后端不需要改写已有数据。

对象 key 由服务端生成，形如 `blobs/<namespace>/<所有者摘要>/<uuid>`，其中所有者部分是摘要而非原始 ID，因此存储目录不会变成用户清单。读取路径前会重新校验该格式，被篡改的数据库行无法读到存储目录之外。

账号删除会一并清理该账号的 blob 绑定与上传会话，与云存档走同一条隐私删除流程。
