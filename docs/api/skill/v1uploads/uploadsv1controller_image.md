# UploadsV1Controller_image

> POST /api/v1/uploads/images · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`forum.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：180 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/uploads/images`

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | JPEG、PNG、GIF 或 WebP 图片，最大 2 MiB |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | 返回可嵌入帖子或资源正文的公开图片地址。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1UploadsImagesPostResponse

```json
{
  "filename": "string", // 服务端生成的文件名。
  "mime_type": "string", // 检测到的图片 MIME 类型。
  "original_name": "string", // 上传时的原始文件名。
  "size": 0, // 图片字节数。
  "url": "string" // 论坛同源公开图片路径。
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/uploads/images" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/file"
```
