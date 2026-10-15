# upsertResourceGithubSourceSyncV2

> PUT /api/v1/resources/{id}/source-sync/github · 契约：openapi-public-v1.json

配置 Mod 的 GitHub Release 来源

仅 Owner/Maintainer 可操作。允许 HTTPS github.com 仓库 URL 与资产名过滤。enabled=true 表示选择加入每 15 分钟运行的自动轮询和导入；关闭时仍可由作者手动读取和导入。上游资产变更或无法安全验证时会暂停自动同步并通知 Owner，不覆盖已有版本。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `PUT`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/source-sync/github`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "asset_exclude": ["string"], // Case-insensitive asset-name globs to exclude.
  "asset_include": ["string"], // Optional case-insensitive asset-name globs; when non-empty, an asset must match at least one.
  "enabled": false, // Opt in to scheduled GitHub release polling and automatic import (up to once every 15 minutes). Disabled sources still support author-triggered release listing and import.
  "include_prerelease": false,
  "repository_url": "string",
  "stable_only": false
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | GitHub Release source configuration saved. |
| `400` | Repository URL or filter configuration is invalid. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | Resource does not exist. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X PUT \
  "$FORUM_BASE_URL/api/v1/resources/{id}/source-sync/github" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "asset_exclude": ["string"],
  "asset_include": ["string"],
  "enabled": false,
  "include_prerelease": false,
  "repository_url": "string",
  "stable_only": false
}
JSON
```
