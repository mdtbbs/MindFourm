# uploadModIssueReportAttachmentV2

> POST /api/v1/resources/mods/issue-reports/{reportId}/attachments · 契约：openapi-public-v1.json

为本人 Mod 问题报告上传私有日志或图片证据

手机号验证后的报告提交者可上传；附件保持在私有隔离存储，只能由报告提交者、相关 Owner/Maintainer/Publisher 或审核人员读取。请先清除 IP、令牌、用户名、本机路径和其他隐私信息。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/issue-reports/{reportId}/attachments`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `reportId` | 字符串（UUID） | 是 | - |

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | One PNG/JPEG/GIF/WebP image or UTF-8 TXT/LOG/JSON/CRASH log; max 5 MiB. |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Private attachment metadata and an authenticated download route; no storage path is returned. |
| `400` | Unsupported file type/signature, invalid UTF-8 log, or attachment count/size limit reached. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | The report does not exist or the current user cannot modify it. |
| `413` | Multipart file exceeds the 5 MiB per-file limit. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** ResourceV2ReportAttachmentDto

```json
{
  "can_delete": false, // True only for the report author, who may delete this attachment.
  "created_at": "string",
  "download_url": "string", // Private authenticated download route; never a public storage URL.
  "kind": "string",
  "mime_type": "string",
  "name": "string",
  "public_id": "string",
  "sha256": "string",
  "size_bytes": 0.0
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/mods/issue-reports/{reportId}/attachments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/file"
```
