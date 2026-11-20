# getPackVersionManifest

> GET /api/v1/packs/{packId}/versions/{versionId}/manifest · 契约：openapi-public-v1.json

Get a deterministic manifest for one published Pack version

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/packs/{packId}/versions/{versionId}/manifest`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `packId` | 字符串 | 是 | - |
| `versionId` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Pack manifest with fixed published member versions and stable file download URLs. |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1PacksPackIdVersionsVersionIdManifestGetResponse

```json
{
  "members": [{
    "dependencies": [{
      "external_identifier": "string",
      "notes": "string",
      "resource_public_id": "string",
      "type": "string",
      "version_constraint": "string"
    }],
    "download_url": "string",
    "file_name": "string",
    "name": "string",
    "resource_kind": "string",
    "resource_public_id": "string",
    "sha256": "string",
    "size_bytes": 0,
    "version": "string",
    "version_public_id": "string"
  }],
  "pack": {
    "game_version": "string", // Exact supported Mindustry game version when declared.
    "public_id": "string",
    "version": "string",
    "version_public_id": "string"
  },
  "schema_version": 0
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/packs/{packId}/versions/{versionId}/manifest" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
