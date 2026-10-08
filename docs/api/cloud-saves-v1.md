# 云存档 V1

云存档用于保存用户私有的 Mindustry 存档快照。服务器会在创建不可变快照前校验文件大小和 SHA-256。客户端不得在不同用户之间共享存档数据或下载地址。

## 访问权限与所有权

- 每个操作都归属于当前已认证的论坛用户；客户端不能指定其他用户 ID。
- 官方及获批客户端使用 MindAuth OAuth 权限范围：`game_content.saves.read`、`game_content.saves.write` 和 `game_content.saves.delete`。
- 第三方客户端只需申请实际操作所需的权限范围，并须通过 MindAuth 应用审核。
- 调用论坛 API 时携带 Bearer 令牌。不要记录令牌或私有存档元数据。
- 响应使用 `Cache-Control: private, no-store`；存档下载返回二进制内容，不会被 CDN 缓存。

## API 路径

下表中的 JSON 接口路径均相对于 `/api/v1`。除二进制请求体或响应外，请发送 `Accept: application/json` 和 `Authorization: Bearer <access-token>`。

| 方法 | 路径 | 权限 | 用途 |
|---|---|---|---|
| GET | `/game-saves?limit=30&cursor=...` | 读取 | 列出当前用户的存档槽；`limit` 默认 30，范围 1–100 |
| GET | `/game-saves/quota` | 读取 | 查看已用空间、配额、单文件上限和存档槽数量 |
| POST | `/game-saves` | 写入 | 创建存档槽 |
| GET | `/game-saves/{slotId}` | 读取 | 查看存档槽元数据和当前快照 |
| PATCH | `/game-saves/{slotId}` | 写入 | 重命名存档槽 |
| DELETE | `/game-saves/{slotId}` | 删除 | 删除存档槽及其快照引用 |
| GET | `/game-saves/{slotId}/snapshots` | 读取 | 列出快照历史 |
| PATCH | `/game-saves/{slotId}/snapshots/{snapshotId}` | 写入 | 固定或取消固定快照 |
| DELETE | `/game-saves/{slotId}/snapshots/{snapshotId}` | 删除 | 删除符合条件的历史快照 |
| POST | `/game-saves/{slotId}/snapshots/{snapshotId}/restore` | 写入 | 将旧快照恢复为新版本 |
| POST | `/game-saves/{slotId}/uploads` | 写入 | 预留配额并创建上传会话 |
| PUT | `/game-saves/uploads/{uploadId}/file` | 写入 | 将存档文件流式上传到论坛服务器 |
| POST | `/game-saves/uploads/{uploadId}/commit` | 写入 | 校验并提交上传的快照 |
| DELETE | `/game-saves/uploads/{uploadId}` | 写入 | 取消未完成的上传 |
| POST | `/game-saves/{slotId}/snapshots/{snapshotId}/download` | 读取 | 获取二进制文件下载路径和元数据 |
| GET | `/game-saves/{slotId}/snapshots/{snapshotId}/file` | 读取 | 下载私有存档文件 |

JSON 响应使用 V1 结构 `{ "data": ..., "meta": { "request_id": ... } }`。二进制下载响应直接包含文件内容。

## 上传流程

先在本地计算存档文件的 SHA-256，再创建上传会话并提交预期文件大小和摘要。响应会返回用于二进制 PUT 请求的论坛 API 路径。创建会话和上传文件时使用同一个 OAuth Bearer 令牌。

```http
POST /api/v1/game-saves/{slotId}/uploads
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "sha256": "<64 个小写十六进制字符>",
  "size": 1048576,
  "reason": "after_exit",
  "base_snapshot_id": "<当前快照 UUID>",
  "game": { "version": "v146", "build": 146 },
  "save": { "map_name": "示例地图", "wave": 42, "playtime_seconds": 3600 },
  "mods": []
}
```

响应有两种形状，客户端要按 `no_upload_required` 分支处理：

**A. 需要上传**（常见情况）——拿到 `upload_id` 后把字节流 PUT 到 `upload.url`：

```json
{
  "data": {
    "upload_id": "<上传 UUID>",
    "upload": {
      "method": "PUT",
      "url": "/api/v1/game-saves/uploads/<上传 UUID>/file",
      "headers": { "Content-Type": "application/octet-stream" },
      "expires_at": "<ISO 8601 时间戳>"
    }
  }
}
```

**B. 无需上传**（`no_upload_required: true`）——服务端已经持有相同的内容摘要，不会再产生需要传输的字节：

```json
{
  "data": {
    "upload_id": "<上传 UUID>",
    "no_upload_required": true,
    "snapshot_id": "<当前快照 UUID>"
  }
}
```

这种响应同样带有 `upload_id`，但它指向的是一个**已提交**的会话：对 `.../file` 的 PUT 会返回 `SAVE_UPLOAD_EXPIRED` (410)，而 `POST .../commit` 会直接回放该快照。也就是说客户端不需要为“无需上传”写特殊分支——照常 PUT + commit 也能得到正确结果，提前判断 `no_upload_required` 只是省掉一次请求。

将原始文件字节流写入响应返回的路径。计算摘要后到上传完成前，不要对文件进行 JSON 编码、压缩或其他修改。

```http
PUT /api/v1/game-saves/uploads/{uploadId}/file
Authorization: Bearer <access-token>
Content-Type: application/octet-stream

<原始存档字节>
```

上传完成后提交会话：

```http
POST /api/v1/game-saves/uploads/{uploadId}/commit
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

服务器会再次读取上传文件，并在创建快照前校验字节数和 SHA-256。如果上传中断，请新建会话，或在会话过期前重试同一上传。对已经提交的同一上传会话重复提交具有幂等性。

上传会话默认 10 分钟（`expires_at`）。PUT 的限流按请求次数计，单次 PUT 无论传输多久都只算一次；请把重试控制在限流窗口内，超限时返回 `RATE_LIMITED` (429)，带 `Retry-After` 和 `retryable: true`，与云存档自身的错误码（`SAVE_*`）区分开。

## 下载流程

先请求已授权的下载路径，再使用同一个 Bearer 令牌 GET 论坛 API 路径。第二个响应为 `application/octet-stream` 附件，并带有安全的 `Content-Disposition` 文件名。

```http
POST /api/v1/game-saves/{slotId}/snapshots/{snapshotId}/download
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

```json
{
  "data": {
    "download": {
      "method": "GET",
      "url": "/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/file",
      "headers": {},
      "size": 1048576,
      "sha256": "<64 个小写十六进制字符>",
      "file_name": "Example.msav",
      "expires_at": null,
      "reusable": true
    }
  }
}
```

`url` **不是签名地址、也不是一次性地址**：它没有时效参数，只要快照仍可访问就一直是同一条路径，可以重复使用和缓存到本地状态里。真正的授权发生在二进制 GET 请求上——服务端每次都会重新校验当前账号对槽位和快照的所有权。所以禁止缓存的是 Bearer 令牌与私有响应内容，而不是这个路径本身。

二进制 GET 响应带有 `ETag: "sha256-<摘要>"` 和 `Last-Modified`，客户端可以据此判断本地副本是否已经是最新内容。

客户端应先将文件流式写入临时文件，校验文件大小和 SHA-256，保留现有本地存档，确认无误后再替换。

## 冲突、去重与保留策略

- 每个存档槽都有不可变且递增的快照历史。恢复旧快照会创建一个新版本。
- `base_snapshot_id` 用于防止客户端覆盖更新的云端快照。冲突响应会返回当前快照 ID。
- 冲突的 `details[0]` 中还有一个 `suggested_resolution` 字段：采用 `normal` 策略且服务端检测到云端有新版本时，它取值为 `create_conflict_copy`。客户端据此提示用户改用该策略重试，不必自己猜测该选什么。
- 支持的冲突策略为 `normal`、`create_conflict_copy` 和 `force_replace_head`。强制替换时必须确认准确的当前快照 ID。
- 创建会话和提交阶段都会重新检查冲突：创建会话时的检查可能通过，但提交时云端已被其他设备更新，此时返回 `SAVE_CONFLICT` (409)，本次上传的字节已经作废，需要按新策略重新发起。
- 同一用户重复上传相同内容摘要时会共用一份本地文件，配额也只计算一次。
- 服务会为待处理上传预留配额，并在提交时使用行锁。若文件超过单文件上限或用户剩余配额，服务会拒绝上传。
- 配额在创建会话和提交时各校验一次。如果管理员在两次校验之间调低了配额，提交会以 `SAVE_QUOTA_EXCEEDED` (409) 失败，该会话会被标记为 `failed`，暂存文件随下一轮维护任务删除——客户端需要新建会话并自行腾出空间。
- 未固定的历史快照受保留数量限制。已固定的快照会保留，直到用户取消固定或删除所属存档槽。
- 已删除或不再被引用的文件，会在维护任务等待宽限期后清理。

## 保留策略的取值范围

`GET /game-saves/quota` 返回的 `limit_bytes`、`max_file_size_bytes` 和管理端可改；`slots.limit`（每用户槽位上限）、`retention.max_unpinned_versions_per_slot` 和 `retention.max_unpinned_age_days` 由部署时的环境变量决定（`CLOUD_SAVES_MAX_SLOTS`、`CLOUD_SAVES_MAX_HISTORY_PER_SLOT`、`CLOUD_SAVES_RETENTION_DAYS`），修改后需重启服务。要拿到当前生效值，读这个接口，不要假设默认值。

## 功能可用性

客户端启用云存档前，应先检查 `GET /api/v1/capabilities`。服务可能被关闭，或调整功能限制；当前配额响应和稳定错误代码才是判断依据。管理端的存储配置不属于公开客户端 API。

## 客户端要求

- 将存档槽、快照和上传 ID 视为不透明值，不解析其内部含义。
- 大文件传输前先查询配额。限制并发传输数量；报告错误时提供请求 ID。
- 不要把用户名、存档名称或客户端提供的路径用作服务器文件路径。
- 在服务器确认快照提交前，保留一份已校验的本地副本。
- 不要在论坛服务器上解析或执行存档、Mod 内容。
- 删除云端存档槽不会删除用户的本地存档文件。
- OAuth 访问权限被撤销后，停止使用对应的访问令牌。

## cURL 示例

```sh
API_BASE=https://forum.example.com
ACCESS_TOKEN=replace-me
SLOT_ID=replace-me
SAVE_FILE=./save.msav
SHA256=$(sha256sum "$SAVE_FILE" | cut -d' ' -f1)
SIZE=$(wc -c < "$SAVE_FILE" | tr -d ' ')

curl --fail-with-body "$API_BASE/api/v1/game-saves/$SLOT_ID/uploads" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data "{\"sha256\":\"$SHA256\",\"size\":$SIZE,\"reason\":\"manual\"}"

# 从 V1 响应读取 upload_id，再将文件流式上传到以下路径：
curl --fail-with-body -X PUT "$API_BASE/api/v1/game-saves/uploads/$UPLOAD_ID/file" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/octet-stream' \
  --data-binary "@$SAVE_FILE"

curl --fail-with-body -X POST "$API_BASE/api/v1/game-saves/uploads/$UPLOAD_ID/commit" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' --data '{}'
```
