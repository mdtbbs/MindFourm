# BlobsController_remove

> DELETE /api/v1/blobs/{blobId} · 契约：openapi-public-v1.json

删除 blob

软删除绑定；对象在引用数归零并经过宽限期后被回收。重复删除返回 404。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`blob.delete`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `DELETE`

**地址：** `$FORUM_BASE_URL/api/v1/blobs/{blobId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `blobId` | 字符串 | 是 | blob UUID |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** BlobDeletedDto

```json
{
  "deleted": 0.0,
  "id": "string"
}
```

## 调用示例

```bash
curl --fail-with-body -X DELETE \
  "$FORUM_BASE_URL/api/v1/blobs/{blobId}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
