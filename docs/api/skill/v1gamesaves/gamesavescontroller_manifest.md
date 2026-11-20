# GameSavesController_manifest

> GET /api/v1/game-saves/{slotId}/snapshots/{snapshotId}/manifest · 契约：openapi-public-v1.json

读取快照文件清单

仅 manifest 快照可用；返回 path / size / sha256 列表与存档元数据。整包快照请使用整包下载接口。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`game_content.saves.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：120 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/manifest`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `slotId` | 字符串 | 是 | - |
| `snapshotId` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

> 契约未声明成功响应：该接口是否可用、返回什么，取决于站点策略与运行时状态。

调用方应按状态码分支处理，不要假设返回 JSON 结构。

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/manifest" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
