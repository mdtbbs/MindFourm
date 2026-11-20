# ClientConfigV1Controller_config

> GET /api/v1/client/config · 契约：openapi-public-v1.json

## 认证与权限

- 认证：公开；无需 access token。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/client/config`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `platform` | 字符串 | 否 | 客户端平台标识 |
| `version_code` | 数字 | 否 | 当前已安装客户端版本号 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/client/config?platform=<platform>&version_code=<version_code>"
```
