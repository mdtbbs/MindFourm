# ResourcesV1Controller_listResources

> GET /api/v1/resources · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 数字 | 否 | 每页返回数量 |
| `offset` | 数字 | 否 | 列表起始偏移量 |
| `q` | 字符串 | 否 | 按资源名称或描述搜索 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Public resource list |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources?limit=<limit>&offset=<offset>&q=<q>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
