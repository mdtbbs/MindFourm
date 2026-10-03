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
| GET | `/game-saves?limit=20&cursor=...` | 读取 | 列出当前用户的存档槽 |
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

成功响应示例：

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
      "file_name": "Example.msav"
    }
  }
}
```

客户端应先将文件流式写入临时文件，校验文件大小和 SHA-256，保留现有本地存档，确认无误后再替换。论坛会在二进制 GET 请求时再次校验文件所有权。

## 冲突、去重与保留策略

- 每个存档槽都有不可变且递增的快照历史。恢复旧快照会创建一个新版本。
- `base_snapshot_id` 用于防止客户端覆盖更新的云端快照。冲突响应会返回当前快照 ID。
- 支持的冲突策略为 `normal`、`create_conflict_copy` 和 `force_replace_head`。强制替换时必须确认准确的当前快照 ID。
- 同一用户重复上传相同内容摘要时会共用一份本地文件，配额也只计算一次。
- 服务会为待处理上传预留配额，并在提交时使用行锁。若文件超过单文件上限或用户剩余配额，服务会拒绝上传。
- 未固定的历史快照受保留数量限制。已固定的快照会保留，直到用户取消固定或删除所属存档槽。
- 已删除或不再被引用的文件，会在维护任务等待宽限期后清理。

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
