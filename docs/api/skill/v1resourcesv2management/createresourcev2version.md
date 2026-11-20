# createResourceV2Version

> POST /api/v1/resources/{id}/versions · 契约：openapi-public-v1.json

发布新的 Resource 版本或创建不可覆盖的 revision

同一版本号再次上传会创建新的 revision，并保留旧文件。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `version` | 字符串 | 是 | 最长 50 |
| `version_mode` | 字符串 | 否 | 可选值：semver / compatibility |
| `release_channel` | 字符串 | 否 | 可选值：release / beta / alpha / snapshot |
| `game_version_min` | 字符串 | 否 | 最长 80 |
| `game_version_max` | 字符串 | 否 | 最长 80 |
| `content` | 字符串 | 否 | 最长 20000 |
| `mod_id` | 字符串 | 否 | 最长 128 |
| `mod_author_overrides` | 对象 | 否 | - |
| `file` | 文件 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Version UUID, monotonically increasing revision number and analysis findings. |
| `400` | Invalid version, file, parser output, or input metadata. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | Resource does not exist. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`201`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "version=<version>" \
  -F "file=@/path/to/file" \
  # 可选字段：version_mode、release_channel、game_version_min、game_version_max、content、mod_id、mod_author_overrides
```
