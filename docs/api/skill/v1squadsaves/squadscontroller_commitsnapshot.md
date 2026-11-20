# SquadsController_commitSnapshot

> POST /api/v1/squads/{squadId}/slots/{slotId}/snapshots · 契约：openapi-public-v1.json

提交共享存档快照

持有当前 fencing_token 才能推进主链；过期 token 返回 409 SQUAD_SAVE_LEASE_STALE，可用 mode=conflict_rescue 保存为 conflict 分支。提交成功后同步执行 GFS 裁剪。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`game_content.saves.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/squads/{squadId}/slots/{slotId}/snapshots`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `squadId` | 字符串 | 是 | - |
| `slotId` | 字符串 | 是 | - |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "base_snapshot_id": {}, // 本次提交基于的主链快照；与当前 head 不一致时返回 SQUAD_SAVE_CONFLICT。
  "device_id": "string", // 客户端设备标识。
  "fencing_token": 0.0, // 租约 fencing_token；只有当前持有者才能推进主链。
  "game": {
    "build": 0.0, // 游戏构建号。
    "version": "string" // Mindustry 游戏版本。
  }, // 游戏版本信息。
  "manifest": {
    "files": [{
      "path": "string", // 数据目录内的相对路径；禁止绝对路径、..、反斜杠、冒号与重复路径。
      "sha256": "string", // 文件内容 SHA-256 小写十六进制值。
      "size": 0.0 // 文件字节数。
    }], // 文件清单，最多 5000 项。
    "format": "string", // 清单格式；当前仅支持 copper-save-manifest-v1。
    "game": {
      "build": 0.0, // 游戏构建号。
      "version": "string" // Mindustry 游戏版本。
    }, // 游戏版本信息；也可放在请求体顶层。
    "mods": [{
      "id": "string", // Mod 稳定标识。
      "name": "string", // Mod 显示名称。
      "sha256": "string", // Mod 文件 SHA-256 小写十六进制值。
      "version": "string" // Mod 版本。
    }], // 该存档使用的 Mod 列表；也可放在请求体顶层。
    "save": {
      "map_name": "string", // 存档中的地图名称。
      "playtime_seconds": 0.0, // 累计游玩秒数。
      "wave": 0.0 // 当前波次。
    } // 游戏内存档显示信息；也可放在请求体顶层。
  }, // 本次快照的完整文件清单。
  "mode": "string", // conflict_rescue 将旧房主的过期提交保存为 conflict 分支，不推进主链。
  "mods": [{
    "id": "string", // Mod 稳定标识。
    "name": "string", // Mod 显示名称。
    "sha256": "string", // Mod 文件 SHA-256 小写十六进制值。
    "version": "string" // Mod 版本。
  }], // 该存档使用的 Mod 列表。
  "reason": "string", // 保存原因。
  "save": {
    "map_name": "string", // 存档中的地图名称。
    "playtime_seconds": 0.0, // 累计游玩秒数。
    "wave": 0.0 // 当前波次。
  } // 游戏内存档显示信息。
}
```

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
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/squads/{squadId}/slots/{slotId}/snapshots" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "base_snapshot_id": {},
  "device_id": "string",
  "fencing_token": 0.0,
  "game": {
    "build": 0.0,
    "version": "string"
  },
  "manifest": {
    "files": [{
      "path": "string",
      "sha256": "string",
      "size": 0.0
    }],
    "format": "string",
    "game": {
      "build": 0.0,
      "version": "string"
    },
    "mods": [{
      "id": "string",
      "name": "string",
      "sha256": "string",
      "version": "string"
    }],
    "save": {
      "map_name": "string",
      "playtime_seconds": 0.0,
      "wave": 0.0
    }
  },
  "mode": "string",
  "mods": [{
    "id": "string",
    "name": "string",
    "sha256": "string",
    "version": "string"
  }],
  "reason": "string",
  "save": {
    "map_name": "string",
    "playtime_seconds": 0.0,
    "wave": 0.0
  }
}
JSON
```
