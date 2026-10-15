# createPackVersionDownloadGrants

> POST /api/v1/packs/{packId}/versions/{versionId}/download-grants · 契约：openapi-public-v1.json

Issue a batch of download grants for the Pack pinned files

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.download`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/packs/{packId}/versions/{versionId}/download-grants`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `packId` | 字符串 | 是 | - |
| `versionId` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | One grant result and stable download URL for each exact file pinned by the Pack version. |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.download |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1PacksPackIdVersionsVersionIdDownloadGrantsPostResponse

```json
{
  "grants": [{
    "download_url": "string",
    "file_public_id": "string",
    "granted": false, // False when this actor already has a recent grant for the same file.
    "resource_public_id": "string",
    "resource_version_public_id": "string"
  }],
  "pack_public_id": "string",
  "pack_version_public_id": "string"
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/packs/{packId}/versions/{versionId}/download-grants" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
