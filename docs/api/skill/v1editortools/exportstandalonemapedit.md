# exportStandaloneMapEdit

> POST /api/v1/editor-tools/map/export · 契约：openapi-public-v1.json

通过官方 MapIO 读写导出本地地图编辑结果

不要求 Resource 管理权限；地图内容、对象、规则和波次继续经过 Renderer 安全校验。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：20 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/editor-tools/map/export`

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | - |
| `operations` | 字符串 | 是 | ResourceV2ExportMapDto JSON |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Official Mindustry .msav bytes. |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）返回 `application/octet-stream`：直接是文件内容，不使用 `{ data, meta }` 信封。

调用方应检查状态码、`Content-Type`、`ETag` 或文件哈希，不要按 JSON 解析。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/editor-tools/map/export" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/file" \
  -F "operations=<operations>"
```
