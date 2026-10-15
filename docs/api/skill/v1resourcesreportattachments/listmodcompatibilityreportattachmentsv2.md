# listModCompatibilityReportAttachmentsV2

> GET /api/v1/resources/mods/compatibility-reports/{reportId}/attachments · 契约：openapi-public-v1.json

读取有权限访问的兼容报告附件清单

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/compatibility-reports/{reportId}/attachments`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `reportId` | 字符串（UUID） | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Private metadata only; rows contain public UUIDs and no numeric IDs or storage keys. |
| `400` | The report identifier is not a UUID. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | The report does not exist or the current user cannot view its attachments. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** ResourceV2ReportAttachmentListDto

```json
{
  "items": [{
    "can_delete": false, // True only for the report author, who may delete this attachment.
    "created_at": "string",
    "download_url": "string", // Private authenticated download route; never a public storage URL.
    "kind": "string",
    "mime_type": "string",
    "name": "string",
    "public_id": "string",
    "sha256": "string",
    "size_bytes": 0.0
  }],
  "max_attachments": 0.0,
  "max_file_size_bytes": 0.0,
  "max_total_size_bytes": 0.0
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/mods/compatibility-reports/{reportId}/attachments" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
