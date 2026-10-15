# ResourcesV1WriteController_submitUploadDraft

> POST /api/v1/resources/drafts/{draftId}/submit · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：180 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/drafts/{draftId}/submit`

### 请求头

| 请求头 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `Idempotency-Key` | 字符串 | 否 | ASCII key scoped to the authenticated user. Reuse it unchanged to replay the first submission result for 24 hours. |

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `draftId` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Submits an owner-bound resource draft to existing forum moderation. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`201`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/drafts/{draftId}/submit" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: <Idempotency-Key>"
```
