# listResourceGithubReleasesV2

> GET /api/v1/resources/{id}/source-sync/github/releases · 契约：openapi-public-v1.json

手动读取 GitHub Release、README 與 License 预览

作者手动读取公开 Mod 的 GitHub 信息；每次最多四个固定 GitHub API 请求、一页 Release。开启自动同步后，独立后台任务最多每 15 分钟检查一次，并安全导入符合过滤条件的新版本。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：12 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/source-sync/github/releases`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 整数 | 否 | 最小 1；最大 30 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Filtered public GitHub releases plus bounded README and License previews. |
| `400` | Resource public UUID or page size is invalid. |
| `401` | Provided optional credentials are invalid. |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | Resource is not public or has no enabled GitHub source. |
| `502` | GitHub is unavailable, rate-limited, or returned invalid data. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/{id}/source-sync/github/releases?limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
