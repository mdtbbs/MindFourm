# exportResourceSchematicEdit

> POST /api/v1/resources/{id}/versions/{versionId}/schematic-editor/export · 契约：openapi-public-v1.json

安全导出编辑后的蓝图副本

公开资源允许任何用户编辑和导出副本；私有资源仍需 Owner/Maintainer 权限。原资源发布权限保持不变。可对已发布蓝图执行旋转、水平镜像、删除、移动、放置方块，以及通过按 Mindustry v160.5 配置类型区分的安全配置编辑。只读取托管版本并返回新文件，不修改原版本；未知或不支持安全写回的配置/内容会拒绝导出。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/schematic-editor/export`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |
| `versionId` | 字符串（UUID） | 是 | 已发布 Version public UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "add_blocks": [{
    "block": "string",
    "config": {}, // Same strict typed configuration shape as config_edits; verified by the official decoder.
    "copy_from_x": 0.0, // Copy config from this original source anchor; both coordinates required.
    "copy_from_y": 0.0,
    "logic_source": "string",
    "rotation": 0.0,
    "x": 0.0,
    "y": 0.0
  }],
  "config_edits": [{
    "config": {},
    "x": 0.0,
    "y": 0.0
  }], // Discriminated v160.5 typed configuration edits. Unknown config types and unregistered per-block config classes are rejected.
  "delete_positions": [{
    "x": 0.0,
    "y": 0.0
  }],
  "logic_configs": [{
    "source": "string", // Inert processor source text; never evaluated by the renderer.
    "x": 0.0,
    "y": 0.0
  }],
  "mirror_x": false, // Reflect the edited schematic horizontally.
  "move_positions": [{
    "from_x": 0.0,
    "from_y": 0.0,
    "to_x": 0.0,
    "to_y": 0.0
  }],
  "rotate_positions": [{
    "rotation_quarters": 0.0, // Clockwise quarter turns applied to one block.
    "x": 0.0,
    "y": 0.0
  }], // Rotate individual blocks whose configs do not contain coordinate links.
  "rotation_quarters": 0.0 // Number of 90 degree counter-clockwise rotations.
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | An official Mindustry .msch serialization as a downloadable file. |
| `400` | 操作无效、文件无法解析或含有编辑器不支持安全保留的内容。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源或已发布版本不存在。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）返回 `application/octet-stream`：直接是文件内容，不使用 `{ data, meta }` 信封。

调用方应检查状态码、`Content-Type`、`ETag` 或文件哈希，不要按 JSON 解析。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/schematic-editor/export" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "add_blocks": [{
    "block": "string",
    "config": {},
    "copy_from_x": 0.0,
    "copy_from_y": 0.0,
    "logic_source": "string",
    "rotation": 0.0,
    "x": 0.0,
    "y": 0.0
  }],
  "config_edits": [{
    "config": {},
    "x": 0.0,
    "y": 0.0
  }],
  "delete_positions": [{
    "x": 0.0,
    "y": 0.0
  }],
  "logic_configs": [{
    "source": "string",
    "x": 0.0,
    "y": 0.0
  }],
  "mirror_x": false,
  "move_positions": [{
    "from_x": 0.0,
    "from_y": 0.0,
    "to_x": 0.0,
    "to_y": 0.0
  }],
  "rotate_positions": [{
    "rotation_quarters": 0.0,
    "x": 0.0,
    "y": 0.0
  }],
  "rotation_quarters": 0.0
}
JSON
```
