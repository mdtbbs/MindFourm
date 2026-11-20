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
| POST | `/game-saves/blobs/check` | 读取 | 按 SHA-256 查询本账号已持有的文件内容（差量预检） |
| POST | `/game-saves/blobs` | 写入 | 为单个缺失文件创建上传会话；已持有时返回 `no_upload_required` |
| PUT | `/game-saves/blobs/uploads/{uploadId}/file` | 写入 | 上传单个文件字节；校验大小与 SHA-256 |
| POST | `/game-saves/{slotId}/snapshots` | 写入 | 用 `base_snapshot_id` + manifest 创建不可变差量快照 |
| GET | `/game-saves/{slotId}/snapshots/{snapshotId}/manifest` | 读取 | 读取差量快照的文件清单（path / size / sha256） |
| POST | `/game-saves/{slotId}/snapshots/{snapshotId}/blobs/download` | 读取 | 获取清单中缺失文件的下载地址 |
| GET | `/game-saves/{slotId}/snapshots/{snapshotId}/blobs/{sha256}/file` | 读取 | 下载清单中的单个文件 |

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

## 文件级差量上传（manifest + blob）

整包上传快照（`format = "zip"`）保持不变；需要差量时，客户端改为上传「文件清单 + 缺失的文件内容」。服务端按账号内 `sha256 + size` 内容寻址去重，未变化的文件只被新快照引用，不重复传输、不重复占用配额。

### 上传流程

1. 本地扫描数据目录，得到 `path / size / sha256` 清单；
2. `POST /game-saves/blobs/check`，body `{"sha256":["...", "..."]}`，返回 `{"exists":[...],"missing":[...]}`；
3. 对每个 `missing` 项调用 `POST /game-saves/blobs`（body `{"sha256":"...","size":123}`）。账号已持有该内容时直接返回 `{"no_upload_required":true,"sha256":"...","size":123}`，无需重复上传；否则返回 `upload.url`，客户端把原始字节 `PUT` 到该路径；
4. 用 `base_snapshot_id` + 完整清单创建快照：

```http
POST /api/v1/game-saves/{slotId}/snapshots
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "base_snapshot_id": "<当前 head>",
  "manifest": {
    "format": "copper-save-manifest-v1",
    "files": [
      {"path": "saves/0.msav", "size": 4194304, "sha256": "<64 位小写十六进制>"},
      {"path": "settings.bin", "size": 20480, "sha256": "<...>"}
    ]
  },
  "reason": "manual",
  "conflict_resolution": "normal",
  "game": {"version": "v160.7", "build": 8},
  "save": {"map_name": "...", "wave": 42, "playtime_seconds": 7993},
  "mods": [{"id": "...", "version": "..."}],
  "device_id": "..."
}
```

响应为快照摘要，额外包含 `format: "manifest"` 与 `file_count`。清单要求：

- `path` 是数据目录内相对路径；绝对路径、`..`、`.`、空段、反斜杠、冒号、首尾斜杠、重复路径全部拒绝；
- 单文件 ≤ 50 MiB（`max_file_size_bytes`）；清单默认最多 5000 项、序列化 ≤ 1 MiB，分别由 `CLOUD_SAVES_MAX_MANIFEST_FILES`、`CLOUD_SAVES_FILE_MANIFEST_MAX_BYTES` 控制，当前生效值见 `GET /game-saves/quota` 的 `manifest_limits`；
- 清单中每个 `sha256` 必须已由本账号持有（旧快照引用过，或第 3 步已上传），否则返回 `SAVE_BLOB_MISSING` (409) 并在 `details` 中列出缺失项；校验与建快照在同一事务内，任何一项失败整体回滚；
- 与整包上传相同，`base_snapshot_id` 不是当前 head 时返回 `SAVE_CONFLICT` (409)；`create_conflict_copy` / `force_replace_head` 语义不变。

### 下载流程

1. `GET /game-saves/{slotId}/snapshots/{snapshotId}/manifest` 取清单（整包快照调用会返回 `SAVE_SNAPSHOT_FORMAT_MISMATCH` (409)）；
2. 客户端比对本机缓存，得到缺失或摘要不一致的文件；
3. `POST /game-saves/{slotId}/snapshots/{snapshotId}/blobs/download`，body `{"sha256":[...]}`，返回每项的 `path`、`size`、`sha256` 与下载地址；
4. 对每个地址发送带 Bearer 的 `GET`，校验 SHA-256 后写入临时文件再替换。

单文件下载地址与整包下载一样是**同源、非签名、可复用**路径；服务端每次重新校验账号与快照归属，只返回该清单内的文件。整包接口拒绝 manifest 快照，manifest 接口拒绝整包快照——客户端按快照对象的 `format` 字段选择路径。

### 配额与清理

- 配额按**账号内唯一 blob 字节**计费（`used_bytes`），同一内容被多个快照引用只计一次；`used_bytes` 现在等于个人 blob、名下小队 blob 与待提交预留之和，三项明细见 `GET /game-saves/quota` 的 `breakdown`。
- 独立 blob 上传会话在提交前会预留配额，过期未使用的内容与已无快照引用的 blob 均由维护任务按宽限期回收；
- 整包快照（`format = "zip"`）继续按原有方式下载与恢复，行为不变。

### 错误码

| 错误码 | HTTP | 含义 |
|---|---|---|
| `SAVE_MANIFEST_INVALID` | 400 | 清单结构非法、路径不安全、包含重复路径或 `sha256` / `size` 非法。 |
| `SAVE_MANIFEST_LIMIT_EXCEEDED` | 413 | 文件数、单文件大小或清单序列化大小超过上限。 |
| `SAVE_BLOB_MISSING` | 409 | 清单引用了本账号尚未持有的文件内容；`details` 列出缺失项，需先上传。 |
| `SAVE_BLOB_NOT_IN_SNAPSHOT` | 404 | 请求的 `sha256` 不属于该 manifest 快照。 |
| `SAVE_SNAPSHOT_FORMAT_MISMATCH` | 409 | 用整包接口访问 manifest 快照（或反之）；按快照的 `format` 选择接口。 |

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

`GET /game-saves/quota` 的限制字段含义如下：

| 字段 | 含义 |
|---|---|
| `used_bytes` | 统一配额用量：`personal_bytes + owned_squads_bytes + pending_bytes`；同一内容被多个存活快照引用只计一次。 |
| `breakdown` | `{ personal_bytes, owned_squads_bytes, pending_bytes }`：`used_bytes` 的三项组成，分别表示个人云存档、名下小队和仍有效的待提交预留。 |
| `logical_bytes` | 个人云存档所有存活快照清单的逻辑大小之和（不含小队快照）；用于向用户解释「删除快照后 `used_bytes` 缓慢下降」。 |
| `limit_bytes` | 当前账号的总存储字节配额。 |
| `max_file_size_bytes` | 单个上传文件/快照的最大字节数。 |
| `formats` | 当前服务端支持的快照格式：`zip`、`manifest`。 |
| `manifest_limits.max_files` / `max_manifest_bytes` | manifest 快照的文件数上限与清单序列化上限。 |
| `slots.limit` | 当前账号可创建的存档槽数量上限；这是槽位数，不是账号内所有快照的总数上限。 |
| `retention.max_unpinned_versions_per_slot` | 每个槽位最多保留的未固定历史快照数。 |
| `retention.max_unpinned_age_days` | 未固定快照按年龄清理的保留天数。 |

`limit_bytes`、`max_file_size_bytes` 可由管理端调整；`slots.limit`、`retention.max_unpinned_versions_per_slot` 和 `retention.max_unpinned_age_days` 由部署环境变量 `CLOUD_SAVES_MAX_SLOTS`、`CLOUD_SAVES_MAX_HISTORY_PER_SLOT`、`CLOUD_SAVES_RETENTION_DAYS` 控制，修改后需重启服务。要拿到当前生效值，读取此接口，不要假设默认值。云存档目前没有单独的“账号内快照总数上限”字段；总字节配额与每槽未固定历史策略共同约束快照数量。

## 小队共享存档接力（Squad Saves）

小队共享存档让多个论坛账号共用一个存档槽接力开房：持有写租约的成员上传本地存档并提交快照，其他成员下载同一快照、加入同一局游戏；新房主接手后继续推进同一条主链。接口位于 `/api/v1/squads/*`，复用个人云存档的三个 OAuth 范围，但配额归属和文件存储都与个人云存档分开。

启用前检查 `GET /api/v1/capabilities` 的 `squad_saves_v1`；它为 `true` 才表示小队功能和底层个人云存档同时可用。站点关闭小队功能时返回 403 `SQUADS_DISABLED`；只关闭个人云存档时返回 403 `CLOUD_SAVES_DISABLED`。

### 概念、角色与所有权

- 每个小队有唯一队长（`squads.owner_user_id`），成员角色为 `owner`、`admin`、`member`。加入必须由现有队长或管理员邀请，且邀请对象必须是已接受的好友。
- 每账号最多拥有 10 个活跃小队；小队默认最多 8 名活跃成员、5 个共享存档槽，分别由 `squads.max_members` / `max_slots` 控制。
- 每个共享存档槽有独立、单调递增的主链 `revision`。`branch_type = "main"` 是主链；`branch_type = "conflict"` 是旧房主失去租约后用 `mode:"conflict_rescue"` 保存的冲突救援分支，不推进 head。
- 配额统一记在创建者（`squads.owner_user_id`）名下。小队文件存放在 `squad_save_blobs`，与个人 `game_save_blobs` 物理隔离：成员调用 `POST /squads/{squadId}/slots/{slotId}/blobs/check` 只能查询本小队持有的内容，不会命中创建者或其他账号的个人云存档，也不能借内容摘要探测个人文件是否存在。
- 删除小队或槽位会软删快照并释放 blob 引用；引用归零的 blob 进入延迟 GC，创建者的配额立即释放。

| 操作 | owner | admin | member |
|---|---|---|---|
| 查看小队、槽位、快照，下载文件 | 是 | 是 | 是 |
| 创建或重命名共享存档槽 | 是 | 是 | 是 |
| 获取、续期、释放写租约，提交快照，置顶快照 | 是 | 是 | 是 |
| 邀请成员、移除普通成员、重命名小队 | 是 | 是 | 否 |
| 删除共享存档槽、删除非 head 快照 | 是 | 是 | 否 |
| 未过期租约的 `force_takeover` 强制接管 | 是 | 是 | 否 |
| 调整成员角色（`admin` / `member`） | 是 | 否 | 否 |
| 删除小队、发起或取消队长转让 | 是 | 否 | 否 |
| 退出小队 | 需先转让 | 是 | 是 |

### 接口一览

下表路径均相对于 `/api/v1`。权限列复用个人云存档范围：读取 = `game_content.saves.read`，写入 = `game_content.saves.write`，删除 = `game_content.saves.delete`。

| 方法 | 路径 | 权限 | 用途 |
|---|---|---|---|
| GET | `/squads` | 读取 | 列出当前账号以活跃成员身份加入的小队，含 `my_role`、成员数与槽位数 |
| GET | `/squads/invitations` | 读取 | 列出待接受的小队邀请 |
| POST | `/squads` | 写入 | 创建小队；调用者成为队长 |
| GET | `/squads/{squadId}` | 读取 | 小队详情：成员、槽位与租约摘要、待确认的队长转让 |
| PATCH | `/squads/{squadId}` | 写入 | 重命名小队（队长或管理员） |
| DELETE | `/squads/{squadId}` | 删除 | 删除小队及其共享存档（仅队长） |
| GET | `/squads/{squadId}/members` | 读取 | 列出活跃成员与待接受邀请 |
| POST | `/squads/{squadId}/members` | 写入 | 邀请好友加入（body `user_id`） |
| POST | `/squads/{squadId}/members/accept` | 写入 | 接受邀请，成为活跃成员 |
| POST | `/squads/{squadId}/members/decline` | 写入 | 拒绝邀请 |
| PATCH | `/squads/{squadId}/members/{userId}` | 写入 | 设置成员角色为 `admin` 或 `member`（仅队长） |
| DELETE | `/squads/{squadId}/members/{userId}` | 写入 | 自己退出或被队长/管理员移除 |
| POST | `/squads/{squadId}/ownership-transfer` | 写入 | 发起两步队长转让（仅队长） |
| POST | `/squads/{squadId}/ownership-transfer/accept` | 写入 | 被指定的新队长接受转让 |
| POST | `/squads/{squadId}/ownership-transfer/decline` | 写入 | 被指定的新队长拒绝转让 |
| POST | `/squads/{squadId}/ownership-transfer/cancel` | 写入 | 现任队长取消待确认的转让 |
| GET | `/squads/{squadId}/slots` | 读取 | 列出共享存档槽与 head、租约摘要 |
| POST | `/squads/{squadId}/slots` | 写入 | 创建共享存档槽（任意活跃成员） |
| GET | `/squads/{squadId}/slots/{slotId}` | 读取 | 槽位详情：head 快照、当前租约、置顶数量 |
| PATCH | `/squads/{squadId}/slots/{slotId}` | 写入 | 重命名共享存档槽 |
| DELETE | `/squads/{squadId}/slots/{slotId}` | 删除 | 删除槽位及其快照（队长或管理员） |
| GET | `/squads/{squadId}/slots/{slotId}/lease` | 读取 | 读取当前写租约、持有者与到期时间 |
| POST | `/squads/{squadId}/slots/{slotId}/lease/acquire` | 写入 | 获取写租约；可选 `force_takeover` |
| POST | `/squads/{squadId}/slots/{slotId}/lease/renew` | 写入 | 用 `fencing_token` 续期；建议 90 秒一次 |
| DELETE | `/squads/{squadId}/slots/{slotId}/lease` | 写入 | 释放写租约；可选 body `fencing_token` |
| GET | `/squads/{squadId}/slots/{slotId}/snapshots` | 读取 | 按 `revision` 从新到旧列出主链与冲突分支（最多 500 条） |
| POST | `/squads/{squadId}/slots/{slotId}/snapshots` | 写入 | 用 `fencing_token` + `base_snapshot_id` + manifest 提交快照 |
| GET | `/squads/{squadId}/slots/{slotId}/snapshots/{snapshotId}/manifest` | 读取 | 读取快照文件清单与游戏、Mod 元数据 |
| POST | `/squads/{squadId}/slots/{slotId}/snapshots/{snapshotId}/restore` | 写入 | 将历史或冲突分支恢复为新的主链 revision |
| PATCH | `/squads/{squadId}/slots/{slotId}/snapshots/{snapshotId}` | 写入 | 置顶或取消置顶（`pinned`） |
| DELETE | `/squads/{squadId}/slots/{slotId}/snapshots/{snapshotId}` | 删除 | 删除非 head 快照（队长或管理员） |
| POST | `/squads/{squadId}/slots/{slotId}/blobs/check` | 读取 | 按 SHA-256 查询本小队已持有或已暂存的文件 |
| POST | `/squads/{squadId}/slots/{slotId}/blobs` | 写入 | 为本小队创建单个文件上传会话；需要当前写租约 |
| PUT | `/squads/{squadId}/blobs/uploads/{uploadId}/file` | 写入 | 上传单个文件字节；只有创建该会话的成员可写 |
| POST | `/squads/{squadId}/slots/{slotId}/snapshots/{snapshotId}/blobs/download` | 读取 | 获取清单内指定文件的同源 Bearer 下载地址 |
| GET | `/squads/{squadId}/slots/{slotId}/snapshots/{snapshotId}/blobs/{sha256}/file` | 读取 | 下载快照清单内的单个文件 |

JSON 响应使用 V1 结构 `{ "data": ..., "meta": { "request_id": ... } }`，并带 `Cache-Control: private, no-store`。列表接口的 `data` 直接是数组；小队、成员和槽位数量受上述上限约束，当前没有额外分页参数。

### 小队与成员流程

1. `POST /squads`（body `{"name":"周末联机小队"}`）创建小队，调用者成为 `owner`。名称 1–80 字符，首尾与连续空白会被规范化。
2. 队长或管理员调用 `POST /squads/{squadId}/members`（body `{"user_id":123}`）邀请好友。目标账号通过 `GET /squads/invitations` 看到邀请，再调用 `members/accept` 或 `members/decline`。
3. 接受时若活跃成员已达到 `max_members`，返回 409 `SQUAD_MEMBER_LIMIT_EXCEEDED`。对仍处于 `invited` 状态的账号重复邀请会幂等返回 `already_invited: true`；对已经是活跃成员的账号再邀请返回 409 `SQUAD_MEMBER_ALREADY_EXISTS`。
4. 只有队长能通过 `PATCH /squads/{squadId}/members/{userId}` 调整 `admin` / `member`。队长角色不能直接修改，必须走两步转让（`SQUAD_OWNER_ROLE_IMMUTABLE`）。
5. 普通成员可以退出自己；队长或管理员可以移除普通成员，管理员只能移除普通成员。队长必须先转让才能退出（`SQUAD_OWNER_MUST_TRANSFER`）。
6. 任意活跃成员都可以创建和重命名共享存档槽，但删除槽位、删除历史快照需要队长或管理员。删除小队只有队长可以执行。

`GET /squads/{squadId}` 返回成员、槽位和 `ownership_transfer`。每个槽位的 `lease` 摘要包含 `holder_user_id`、`holder_username`、`fencing_token` 和 `expires_at`；`active_session_id` / `lanlink_room_code` 用于让其他成员定位当前房主的联机房间。

### 两步队长转让

1. 现任队长调用 `POST /squads/{squadId}/ownership-transfer`（body `{"target_user_id":123}`）指定一名活跃成员，生成 24 小时内有效的 `pending` 转让。
2. 同一小队至多一条待确认转让；已有未过期记录时返回 409 `SQUAD_TRANSFER_PENDING`。过期记录会被标记为 `expired` 后允许重新发起。
3. 被指定的新队长调用 `.../ownership-transfer/accept` 接受。服务端在同一事务内先按 `ORDER BY id ASC` 锁定新旧队长的 `users` 行（固定加锁顺序，避免互相转让时死锁），再校验小队 owner 未变化、双方仍是活跃成员，并计算该小队当前占用字节（存活 blob + 待提交预留）。
4. 若新队长的统一配额无法承接该小队（`新队长已用 + 小队字节 > limit_bytes`），返回 409 `SQUAD_TRANSFER_QUOTA_EXCEEDED`，**整个事务回滚**：owner、角色、计费归属和转让记录都不变化。
5. 成功后原子切换 `squads.owner_user_id`、小队 blob 与待提交上传的 `billing_user_id`、双方角色和转让状态，并向全体活跃成员发送 `squad_save.ownership_transferred`。
6. 新队长可以拒绝（`decline`），现任队长可以取消（`cancel`）；过期后接受或拒绝返回 410 `SQUAD_TRANSFER_EXPIRED`。

接受成功的 `data` 包含 `transfer_id`、`squad_id`、`owner_user_id`、`from_user_id`、`squad_bytes` 和 `usage_after`（新队长的三项配额分解）。

### 写租约状态机

写租约保证同一时刻只有一个客户端推进主链，并用单调递增的 `fencing_token` 拒绝旧房主的迟到提交。租约有效期 **150 秒 = 90 秒心跳租约 + 60 秒宽限**；客户端应以 90 秒间隔调用 `lease/renew`。

| 当前状态 | 操作 | 结果 |
|---|---|---|
| 无记录、已释放或已自然到期 | 任意活跃成员 `POST .../lease/acquire` | 获得租约，`fencing_token` 在上一值上 +1（首次为 1），有效期 150 秒 |
| 未过期，由其他成员持有 | `POST .../lease/acquire` | 409 `SQUAD_SAVE_LEASE_HELD`，`details[0]` 含当前持有者信息 |
| 未过期，调用者是 owner/admin | `POST .../lease/acquire` with `{"force_takeover":true}` | 立即接管，token +1，记录 `taken_over: true` 并通知原持有者 |
| 未过期，调用者是普通成员 | `force_takeover: true` | 403 `SQUAD_TAKEOVER_FORBIDDEN` |
| 调用者持有有效租约 | `POST .../lease/renew` with `fencing_token` | 延长到当前时间 +150 秒，返回 `heartbeat_interval_seconds: 90` |
| token 过期、已被接管或不属于调用者 | `renew` / `release` / 主链提交 | 409 `SQUAD_SAVE_LEASE_STALE` |
| 调用者持有租约 | `DELETE .../lease` | 标记 `released`，其他成员可立即接力；可选 `fencing_token` 防止误释放 |
| 调用者没有当前租约，或上传会话对应的租约已被接管/过期 | `POST .../slots/{slotId}/blobs` / `PUT /squads/{squadId}/blobs/uploads/{uploadId}/file` | 409 `SQUAD_SAVE_LEASE_REQUIRED`；旧房主不能继续用过期 token 灌入暂存内容 |

`SQUAD_SAVE_LEASE_HELD` 的 `details[0]` 形状：

```json
{
  "holder_user_id": 123,
  "fencing_token": 6,
  "multiplayer_session_id": "ses_AbCdEf0123456789_-wxyz",
  "lanlink_room_code": "A1B2C3D4E5",
  "expires_at": "2026-11-20T12:00:00.000Z"
}
```

`multiplayer_session_id` 和 `lanlink_room_code` 可能为 `null`。`lanlink_room_code` 只在建房时通过联机的 `squad_save_ref` 写入，用于让其他成员“一键加入当前房主房间”，**不参与任何授权判断**。

获取租约的请求/响应：

```http
POST /api/v1/squads/{squadId}/slots/{slotId}/lease/acquire
Authorization: Bearer <access-token>
Content-Type: application/json

{"force_takeover": false}
```

```json
{
  "data": {
    "lease": {
      "slot_id": "<槽位 UUID>",
      "lease_id": "<租约 UUID>",
      "holder_user_id": 123,
      "holder_client_id": "desktop-launcher",
      "multiplayer_session_id": null,
      "fencing_token": 7,
      "status": "active",
      "acquired_at": "2026-11-20T11:55:00.000Z",
      "last_heartbeat_at": "2026-11-20T11:55:00.000Z",
      "expires_at": "2026-11-20T11:57:30.000Z"
    },
    "taken_over": false,
    "previous_holder_user_id": null,
    "previous_lease_id": null
  },
  "meta": { "request_id": "req_..." }
}
```

获取或接管租约时会清空槽位上的 `active_session_id` 与 `lanlink_room_code`，需要重新通过联机会话绑定。租约、快照和转让变化通过用户事件流通知小队每个活跃成员：`squad_save.lease_acquired`、`squad_save.lease_released`、`squad_save.lease_taken_over`、`squad_save.snapshot_committed`、`squad_save.ownership_transferred`。事件只是通知，收到后应重新读取小队详情或快照链。

### 快照提交与冲突救援

主链提交必须同时提供**当前** `fencing_token` 和与当前 head 一致的 `base_snapshot_id`。清单格式与个人云存档的 manifest 相同（`format: "copper-save-manifest-v1"`，最多 5000 项，单文件默认 ≤ 50 MiB，序列化默认 ≤ 1 MiB；当前生效值见个人 `GET /game-saves/quota`）。

```http
POST /api/v1/squads/{squadId}/slots/{slotId}/snapshots
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "fencing_token": 7,
  "base_snapshot_id": "<当前 head 快照 UUID，首次提交为 null>",
  "mode": "normal",
  "manifest": {
    "format": "copper-save-manifest-v1",
    "files": [
      {"path": "saves/0.msav", "size": 4194304, "sha256": "<64 位小写十六进制>"},
      {"path": "settings.bin", "size": 20480, "sha256": "<64 位小写十六进制>"}
    ]
  },
  "reason": "after_exit",
  "game": {"version": "v160.7", "build": 8},
  "save": {"map_name": "示例地图", "wave": 42, "playtime_seconds": 7993},
  "mods": [{"id": "example-mod", "version": "1.2.0"}],
  "device_id": "desktop-main"
}
```

```json
{
  "data": {
    "id": "<快照 UUID>",
    "slot_id": "<槽位 UUID>",
    "squad_id": "<小队 UUID>",
    "revision": 12,
    "parent_snapshot_id": "<上一 head 快照 UUID>",
    "uploader_user_id": 123,
    "fencing_token": 7,
    "branch_type": "main",
    "retention_tier": "recent",
    "format": "manifest_v1",
    "sha256": "<清单规范化摘要>",
    "size": 4214784,
    "file_count": 2,
    "game": {"version": "v160.7", "build": 8},
    "save": {"map_name": "示例地图", "wave": 42, "playtime_seconds": 7993},
    "mods": {"count": 1, "manifest_hash": "<Mod 清单摘要或 null>"},
    "reason": "after_exit",
    "pinned": false,
    "is_head": true,
    "created_at": "2026-11-20T12:00:00.000Z",
    "no_changes": false,
    "pruned_snapshot_ids": ["<被 GFS 淘汰的快照 UUID>"]
  },
  "meta": { "request_id": "req_..." }
}
```

快照对象字段：

| 字段 | 含义 |
|---|---|
| `id` / `slot_id` / `squad_id` | 快照、槽位和小队的 UUID；均视为不透明值。 |
| `revision` | 槽位内单调递增的版本号。冲突分支也会分配新 revision，但不会成为 head。 |
| `parent_snapshot_id` | 提交时参考的上一 head；冲突救援分支为提交时看到的 head 或 `base_snapshot_id`。 |
| `uploader_user_id` | 提交该快照的成员。 |
| `fencing_token` | 提交时使用的租约令牌；可用来判断提交者是否持有当时的写权限。 |
| `branch_type` | `main` 或 `conflict`。 |
| `retention_tier` | `recent`、`daily`、`pinned` 或 `conflict`，由 GFS 裁剪维护。 |
| `format` | 当前为 `manifest_v1`。 |
| `sha256` / `size` / `file_count` | 清单规范化摘要、逻辑文件总大小和文件数。 |
| `game` / `save` / `mods` | 游戏版本、存档显示信息和 Mod 摘要；`mods` 为 `{ count, manifest_hash }`。 |
| `reason` | `manual`、`before_launch`、`after_exit`、`periodic`、`restore`、`conflict` 或 `import`；冲突救援固定为 `conflict`。 |
| `pinned` / `is_head` | 是否置顶；是否为主链当前 head。 |
| `created_at` | 服务端创建时间。 |

提交规则：

- `base_snapshot_id` 必须等于当前 `head_snapshot_id`（首次提交两者都为 `null`），否则返回 409 `SQUAD_SAVE_CONFLICT`，`details[0]` 返回 `base_snapshot_id` 与 `head_snapshot_id`。
- 内容与 head 完全一致（manifest 摘要相同）时不消耗 revision：返回 head 摘要并带 `no_changes: true`，不发送 `squad_save.snapshot_committed`。
- 清单中的每个 `sha256 + size` 必须已在本小队的 `squad_save_blobs` 或有效暂存会话中；缺失返回 409 `SQUAD_SAVE_BLOB_MISSING`，`details` 列出缺失项。校验、配额检查和建快照在同一事务内，任何一项失败整体回滚。
- 主链提交和恢复都要求当前 `fencing_token`；token 过期返回 409 `SQUAD_SAVE_LEASE_STALE`。
- `mode:"conflict_rescue"` 用于当前持有者主动降级，或“最近一次被接管”的原房主保存尚未提交的本地内容。提交仍必须携带 `fencing_token`：调用者必须是当前持有者并携带当前 token，或是租约行记录的上一次持有者（`previous_holder_user_id`）并携带其当时的 `previous_fencing_token`；其他成员即使使用很小的 token 也会返回 409 `SQUAD_SAVE_LEASE_STALE`，避免绕过写租约无限写入冲突分支。由于文件暂存和上传字节都要求当时持有租约，旧房主只能复用被接管前已上传为 `ready` 的文件。冲突救援不推进 head，写入 `branch_type: "conflict"`、`retention_tier: "conflict"`、`reason: "conflict"`，`is_head` 为 `false`，`pruned_snapshot_ids` 为空。可选的 `base_snapshot_id` 必须属于本槽位，否则返回 409 `SQUAD_SAVE_BASE_SNAPSHOT_INVALID`。冲突分支不会自动裁剪，可由队长/管理员显式删除，或通过恢复流程重新成为主链。
- `POST .../snapshots/{snapshotId}/restore` 需要 `fencing_token` 和当前 head（`confirm_head_snapshot_id`）；head 不一致返回 409 `SQUAD_SAVE_CONFLICT`。恢复会创建新的主链 revision，原快照保留。

### 文件级差量上传与下载

1. 先获取并保持写租约，再 `POST .../slots/{slotId}/blobs/check`（body `{"sha256":["...","..."]}`）。查询严格限定在当前小队，返回 `{"exists":[...],"missing":[...]}`。
2. 对每个 `missing` 调用 `POST .../slots/{slotId}/blobs`（body `{"sha256":"...","size":4194304}`）。本小队已持有该内容时返回 `{"no_upload_required":true,"sha256":"...","size":4194304}`；否则返回 `upload_id` 与 `upload.url`。创建会话要求当前写租约，租约不在有效期内返回 409 `SQUAD_SAVE_LEASE_REQUIRED`。
3. 把原始字节 `PUT` 到 `/api/v1/squads/{squadId}/blobs/uploads/{uploadId}/file`。只有创建该上传会话的成员可以写入；服务端校验大小与 SHA-256，失败分别返回 409 `SQUAD_SAVE_SIZE_MISMATCH` / `SQUAD_SAVE_CHECKSUM_MISMATCH`。上传会话默认 10 分钟有效，过期返回 410 `SQUAD_SAVE_UPLOAD_EXPIRED`。
4. 用完整清单提交快照。上传成功返回 `{"upload_id":"...","uploaded":true,"size_bytes":4194304,"sha256":"...","status":"ready"}`。
5. 下载时先 `GET .../snapshots/{snapshotId}/manifest`，再 `POST .../snapshots/{snapshotId}/blobs/download`（body `{"sha256":[...]}`）。响应 `downloads` 数组每项含 `path`、`size`、`sha256` 与 `download.url`，客户端只拉取本机缺失的文件。
6. 对下载地址发送带 Bearer 的 `GET`，校验 SHA-256 后写入临时文件再替换。响应为 `application/octet-stream`，带 `ETag: "sha256-<摘要>"`，路径同源、非签名、可复用；服务端每次重新校验调用者仍是该小队活跃成员、快照和文件属于该槽位。

个人云存档已持有的相同内容不会自动计入小队：`squad_save_blobs` 与 `game_save_blobs` 物理隔离，必须在小队内重新建立引用。

### GFS 分层裁剪

每次主链提交（含恢复）后，服务端在同一事务内同步执行 Grandfather-Father-Son 分层保留：

- 保留每个槽位**最近 10 个未置顶主链快照**；
- 保留过去 **7 个自然日（含当天）每天最后一个未置顶主链快照**；
- 保留**全部 pinned 快照**，每槽最多置顶 10 个，超过返回 409 `SQUAD_SAVE_PIN_LIMIT_EXCEEDED`；
- 保留**全部 `branch_type = "conflict"` 分支**，不参与自动裁剪。

淘汰时对快照做软删（`deleted_at`）、删除文件行，并对该快照引用的每个 blob 将 `ref_count` 减 1。`ref_count` 归零时写入 `pending_delete_at = NOW() + 宽限期`（默认 24 小时），进入延迟 GC。配额按 `ref_count > 0` 统计，所以淘汰后创建者配额**立即释放**；物理对象由维护任务（约 15 分钟一轮、每批最多 100 个）在宽限期后删除。删除失败会重新排期，不会误删仍被存活快照引用的对象。

提交和恢复响应的 `pruned_snapshot_ids` 列出本次被淘汰的快照 ID。客户端应把它视为该槽位历史发生变化的通知；被淘汰的快照不可再读取、下载或恢复。GFS 不会淘汰当前 head，因为最新主链快照总在“最近 10 个”集合内。

### 配额

小队共享存档与个人云存档共用同一份统一配额。`GET /api/v1/game-saves/quota` 返回：

| 字段 | 含义 |
|---|---|
| `breakdown.personal_bytes` | 个人云存档中仍被存活快照引用的唯一 blob 字节。 |
| `breakdown.owned_squads_bytes` | 当前账号作为队长的小队中仍被存活快照引用的唯一 blob 字节之和。 |
| `breakdown.pending_bytes` | 个人与名下小队尚未被任意存活快照引用、且仍处于有效期内的暂存上传预留字节。 |
| `used_bytes` | `personal_bytes + owned_squads_bytes + pending_bytes`。 |
| `limit_bytes` | 统一配额上限；与个人云存档共用。 |

- 小队创建者的额度同时约束其个人存档和名下所有小队。任意成员创建/提交小队文件时，服务端按**创建者**的 `used_bytes` 校验；不足时返回 409 `SQUAD_OWNER_QUOTA_EXCEEDED`。
- 非创建者收到的 `SQUAD_OWNER_QUOTA_EXCEEDED` 不携带具体数值（`details` 为空）；创建者本人收到的 `details[0]` 含 `used_bytes`、`limit_bytes`、`required_bytes`，便于自行清理。
- 队长转让接受前会检查新队长的统一配额能否承接该小队；不足返回 `SQUAD_TRANSFER_QUOTA_EXCEEDED` 并整体回滚。
- `logical_bytes` 仍只统计个人云存档快照的逻辑大小，不包含小队快照。

### 错误码

| 错误码 | HTTP | 含义 |
|---|---|---|
| `SQUADS_DISABLED` | 403 | 小队共享存档功能未启用，或底层个人云存档未启用。 |
| `SQUAD_INVALID_METADATA` | 400 | 小队名称、槽位名称、成员、设备标识或 `fencing_token` 字段校验失败。 |
| `SQUAD_NOT_FOUND` | 404 | 小队不存在或已删除。 |
| `SQUAD_PERMISSION_DENIED` | 403 | 调用者不是活跃成员，或角色不足以执行该操作。 |
| `SQUAD_LIMIT_EXCEEDED` | 409 | 已达到每账号可创建的活跃小队数量上限。 |
| `SQUAD_MEMBER_LIMIT_EXCEEDED` | 409 | 接受邀请会超过小队成员上限。 |
| `SQUAD_MEMBER_ALREADY_EXISTS` | 409 | 目标账号已经是活跃成员。 |
| `SQUAD_MEMBER_NOT_FOUND` | 404 | 目标账号不是该小队的活跃成员。 |
| `SQUAD_FRIEND_REQUIRED` | 403 | 只能邀请已接受的好友。 |
| `SQUAD_INVITE_NOT_FOUND` | 404 | 没有待接受的小队邀请。 |
| `SQUAD_OWNER_ROLE_IMMUTABLE` | 409 | 队长角色不能直接修改，必须走两步转让。 |
| `SQUAD_OWNER_MUST_TRANSFER` | 409 | 队长必须先完成转让才能退出。 |
| `SQUAD_TRANSFER_NOT_FOUND` | 404 | 没有待确认的队长转让。 |
| `SQUAD_TRANSFER_PENDING` | 409 | 小队已有未过期的待确认转让，至多一条。 |
| `SQUAD_TRANSFER_EXPIRED` | 410 | 队长转让已过期，需重新发起。 |
| `SQUAD_TRANSFER_STALE` | 409 | 转让期间现任队长或成员状态已变化。 |
| `SQUAD_TRANSFER_QUOTA_EXCEEDED` | 409 | 新队长的统一配额不足以承接该小队；事务回滚。 |
| `SQUAD_SLOT_LIMIT_EXCEEDED` | 409 | 小队共享存档槽数量已达上限。 |
| `SQUAD_SAVE_SLOT_NOT_FOUND` | 404 | 共享存档槽不存在或已删除。 |
| `SQUAD_SAVE_SNAPSHOT_NOT_FOUND` | 404 | 快照不存在、已删除或不属于该槽位。 |
| `SQUAD_SAVE_HEAD_SNAPSHOT_DELETE_FORBIDDEN` | 409 | 不能单独删除主链当前 head。 |
| `SQUAD_SAVE_PIN_LIMIT_EXCEEDED` | 409 | 每槽最多置顶 10 个快照。 |
| `SQUAD_SAVE_BLOB_MISSING` | 409 | 清单引用了本小队尚未持有的文件；`details` 列出缺失项。 |
| `SQUAD_SAVE_BLOB_NOT_IN_SNAPSHOT` | 404 | 请求的文件不属于该快照清单。 |
| `SQUAD_SAVE_BASE_SNAPSHOT_INVALID` | 409 | 提供的基准快照已删除或属于其他槽位。 |
| `SQUAD_SAVE_CONFLICT` | 409 | 主链 head 已变化或恢复时 head 确认不一致。 |
| `SQUAD_SAVE_INVALID_HASH` | 400 | SHA-256 不是 64 位小写十六进制。 |
| `SQUAD_SAVE_FILE_TOO_LARGE` | 413 | 单个文件超过服务端大小上限。 |
| `SQUAD_SAVE_SIZE_MISMATCH` | 409 | 上传对象大小与声明不一致。 |
| `SQUAD_SAVE_CHECKSUM_MISMATCH` | 409 | 上传对象 SHA-256 与声明不一致。 |
| `SQUAD_SAVE_STORAGE_UNAVAILABLE` | 503 | 存档存储未配置、暂不可用或对象缺失；可重试。 |
| `SQUAD_SAVE_UPLOAD_NOT_FOUND` | 404 | 上传会话不存在或属于其他成员。 |
| `SQUAD_SAVE_UPLOAD_EXPIRED` | 410 | 上传会话已过期或已取消。 |
| `SQUAD_OWNER_QUOTA_EXCEEDED` | 409 | 小队创建者的统一配额不足；非创建者不返回具体数值。 |
| `SQUAD_OWNER_CHANGED` | 409 | 暂存/提交期间队长发生转让，计费归属不再确定；`retryable: true`，重试即可。 |
| `SQUAD_SAVE_LEASE_HELD` | 409 | 槽位存在未过期的其他持有者；`details` 含持有者与房间信息。 |
| `SQUAD_SAVE_LEASE_STALE` | 409 | `fencing_token` 已过期、被接管或不属于调用者。 |
| `SQUAD_SAVE_LEASE_REQUIRED` | 409 | 上传暂存前必须先获取当前写租约。 |
| `SQUAD_TAKEOVER_FORBIDDEN` | 403 | 只有队长或管理员可以强制接管未过期租约。 |

### 客户端要求

- 把 `squadId`、`slotId`、`snapshotId`、`uploadId` 视为不透明值，不解析、不推测顺序，也不要把它们当作跨系统的稳定 ID。
- 上传前先 `lease/acquire`，把返回的 `fencing_token` 与 `lease_id` 保存在内存中；按 90 秒节奏调用 `lease/renew`，网络抖动时不要等到 150 秒到期才续期。
- 提交主链快照必须携带当前 `fencing_token` 和明确的 `base_snapshot_id`。收到 409 `SQUAD_SAVE_LEASE_STALE` 时不要重试同一 token；若只是要保住本地进度，且你曾被接管、此前已把文件暂存为 `ready`，改用 `mode:"conflict_rescue"` 并携带被接管前的旧 token 保存为冲突分支。
- 收到 `squad_save.lease_taken_over` 后立即停止主链提交和上传暂存，等待当前操作结束；不要尝试用旧 token 覆盖。需要继续游戏时重新读取槽位与租约，按新的 head 提交。
- 实时事件只是通知，可能丢失或延迟；收到任何小队事件后重新读取 `GET /squads/{squadId}/slots/{slotId}`、快照链或清单，以 API 快照为准。
- 下载按“清单 → 缺失文件授址 → 单文件下载”的顺序进行，校验 SHA-256 后再替换本地文件；保留一份已校验的本地副本，直到云端提交被确认。
- 查询配额时使用 `breakdown` 解释空间占用。成员无法看到创建者的具体剩余额度，遇到 `SQUAD_OWNER_QUOTA_EXCEEDED` 应提示联系队长清理，而不是自行重试。
- 删除云端小队或槽位不会删除本地存档；OAuth 范围被撤销后停止使用对应令牌。

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
