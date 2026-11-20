# analyzeResourceV2Version

> POST /api/v1/resources/{id}/versions/analyze · 契约：openapi-public-v1.json

安全解析待发布的 Resource 版本文件

需要 resource.upload scope。只静态解析 Mod JAR/ZIP，绝不执行 Java/JavaScript/native code；地图和蓝图复用现有 renderer。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/analyze`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | - |
| `mod_author_overrides` | 对象 | 否 | Mod 发布者字段覆盖；解析原值会单独保留 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Parser summary, structured metadata, localization summary and findings. |
| `400` | 文件损坏、格式无效、安全检查失败或解析器不可用。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | Resource 不存在。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/analyze" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/file" \
  # 可选字段：mod_author_overrides
```
