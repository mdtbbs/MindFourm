# importResourceGithubReleaseV2

> POST /api/v1/resources/{id}/source-sync/github/import · 契约：openapi-public-v1.json

显式导入一个 GitHub Release 资产

仅 Owner/Maintainer 可手动操作；启用的后台同步也复用相同导入校验。资产通过本地格式校验、进入 quarantine，再由现有 ResourceVersionService 分析并创建不可覆盖的版本/revision。若已有 tag 对应的上游资产发生变化，后台会暂停并等待人工确认。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/source-sync/github/import`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "asset_name": "string",
  "tag_name": "string"
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | A new immutable version/revision was created from the selected release asset. |
| `400` | Release channel, asset filter, size, URL, or archive validation failed. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | Resource, source, release, or selected asset does not exist. |
| `502` | GitHub is unavailable or the selected asset could not be downloaded. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`201`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/source-sync/github/import" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "asset_name": "string",
  "tag_name": "string"
}
JSON
```
