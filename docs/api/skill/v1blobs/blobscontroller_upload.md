# BlobsController_upload

> PUT /api/v1/blobs/uploads/{uploadId}/content · 契约：openapi-public-v1.json

上传 blob 内容

将原始字节 PUT 到该地址。服务端会校验声明的大小与 SHA-256，任何不一致都会拒绝并丢弃数据。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`blob.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：120 次 / 600 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `PUT`

**地址：** `$FORUM_BASE_URL/api/v1/blobs/uploads/{uploadId}/content`

### 请求头

| 请求头 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `content-type` | 字符串 | 是 | 必须是 application/octet-stream |

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | 字符串 | 是 | 上传会话 UUID |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 字节已被接收并通过大小与 SHA-256 校验。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `415` | 请求体不是 application/octet-stream。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X PUT \
  "$FORUM_BASE_URL/api/v1/blobs/uploads/{uploadId}/content" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: <content-type>"
```
