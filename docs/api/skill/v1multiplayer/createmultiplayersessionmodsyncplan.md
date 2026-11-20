# createMultiplayerSessionModSyncPlan

> POST /api/v1/multiplayer/sessions/{id}/mod-sync-plan · 契约：openapi-public-v1.json

计算加入模组房所需的同步计划并批量签发下载授权

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`multiplayer.read`、`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/multiplayer/sessions/{id}/mod-sync-plan`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | - |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "installed_mods": [{
    "client_only": false, // 是否为纯客户端辅助 Mod（mod.hjson hidden / 白名单）；默认保留不禁用。
    "enabled": false, // 本地是否已启用；缺省为 true。
    "mod_id": "string", // 本地 Mod 的稳定标识。
    "sha256": "string", // 本地文件的 SHA-256；缺失时无法确认已同步。
    "version": "string" // 本地版本号。
  }], // 客户端本地已安装 Mod 清单，最多 128 项；省略时按空清单计算（全部需要下载）。
  "join_code": "string" // 可选房间码；与 join 接口同一校验。持有有效房间码的客人可在加入前读取同步计划。
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 标准成功信封；data 是按房主清单与本地已安装 Mod 计算出的同步计划。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MultiplayerSessionsIdModSyncPlanPostResponse

```json
{
  "generated_at": "string",
  "limits": {},
  "mod_summary": {}, // 房主 Mod 清单与可同步计数。
  "plan_version": 0,
  "preserved_client_mods": [{}], // 纯客户端辅助 Mod，默认保留不禁用。
  "session_id": "string",
  "status": "string", // ready 可直接加入；sync_required 需同步；partial_sync_required 表示仍有需手动获取的 Mod，但可先拉齐可同步项。
  "to_disable": [{}],
  "to_download": [{
    "display_name": "string",
    "download_url": "string",
    "file_public_id": "string",
    "granted": false, // false 表示该文件在 60 秒滚动窗口内已有同账号授权记录。
    "mod_id": "string",
    "reason": "string",
    "resource_public_id": "string",
    "resource_version_public_id": "string",
    "sha256": "string",
    "size_bytes": 0,
    "version": "string"
  }],
  "to_enable": [{}],
  "unresolved": [{
    "display_name": "string",
    "mod_id": "string",
    "reason": "string",
    "resolution_status": "string",
    "resource_public_id": "string",
    "resource_version_public_id": "string",
    "sha256": "string",
    "version": "string"
  }]
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/multiplayer/sessions/{id}/mod-sync-plan" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "installed_mods": [{
    "client_only": false,
    "enabled": false,
    "mod_id": "string",
    "sha256": "string",
    "version": "string"
  }],
  "join_code": "string"
}
JSON
```
