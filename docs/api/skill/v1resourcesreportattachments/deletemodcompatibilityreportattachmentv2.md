# deleteModCompatibilityReportAttachmentV2

> DELETE /api/v1/resources/mods/compatibility-reports/{reportId}/attachments/{attachmentId} · 契约：openapi-public-v1.json

删除本人兼容报告的附件

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `DELETE`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/compatibility-reports/{reportId}/attachments/{attachmentId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `reportId` | 字符串（UUID） | 是 | - |
| `attachmentId` | 字符串（UUID） | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | The report author deleted the private attachment. |
| `400` | A report or attachment identifier is not a UUID. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | The report or attachment does not exist or is not owned by the current user. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** ResourceV2ReportAttachmentDeleteDto

```json
{
  "deleted": false,
  "public_id": "string"
}
```

## 调用示例

```bash
curl --fail-with-body -X DELETE \
  "$FORUM_BASE_URL/api/v1/resources/mods/compatibility-reports/{reportId}/attachments/{attachmentId}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
