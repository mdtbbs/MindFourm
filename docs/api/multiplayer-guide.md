# 第三方联机接入指南

本页面向第三方 Mod、启动器与桌面客户端，走完从应用申请到会话、联机与实时事件的完整路径。基础契约为 MindAuth OAuth 授权码 + PKCE S256 与 MindFourm Multiplayer V1；两者都在公开 OpenAPI 与公开导航范围内。LanLink 是官方实现、Broker、SDK 与兼容层，其内部 Broker API、机器接口与管理界面不属于公开客户端契约。

阅读顺序建议：先看本页的角色与门槛，再按步骤接入；协议细节分别见[第三方客户端接入指南](./public-client-v1.md)与[多人联机 API V1](./multiplayer-v1.md)。

## 接入角色与允许路径

| 角色 | 允许的路径 | 当前状态 |
| --- | --- | --- |
| 第三方 Mod / 启动器 / 桌面客户端 | MindAuth 公开客户端 OAuth（授权码 + PKCE S256）+ `/api/v1/presence/*`、`/api/v1/multiplayer/*`、`/api/v1/realtime/*` | 公开；以站点开关与应用审核结果为准 |
| 第三方游戏服务（server-to-server） | 无公共身份接口 | **未开放**；服务端集成凭证不在公开客户端文档范围 |
| Relay Agent operator | 无公开机器接口操作说明 | 未作为第三方产品开放；属于 MDTBBS 基础设施边界 |

第三方 Mod/启动器接入的就是上表第一行的公开路径：登录用 MindAuth 公开客户端，联机信令用 Multiplayer V1。论坛账号、好友、会话与网络候选交换由论坛负责；游戏数据在客户端之间传输，P2P 不通时经过官方中继。

论坛无法从客户端提交的字段推断身份。应用的 `client_id`、对端 role 等由服务端从令牌内省结果与服务端状态派生，请求体提交这些字段不会被采纳（未被接口声明的字段会被参数校验拒绝）。

## 三道独立门槛

联机 API 同时受三道门槛约束，缺一即失败，且三者由不同系统控制：

| 门槛 | 控制方 | 失败表现 |
| --- | --- | --- |
| OAuth 权限范围（用户授权） | 用户在 MindAuth 授权页逐项同意；令牌按实际授予的 scope 校验 | 403 `INSUFFICIENT_SCOPE` |
| 应用能力（应用许可） | MindAuth 应用审核：`supports_multiplayer`、`supports_presence`、`supports_join_intent` | 403 `CLIENT_CAPABILITY_NOT_APPROVED` |
| 站点功能开关（平台开放） | 站点运营配置：Multiplayer 会话/邀请/中继与第三方联机开关 | 403 `FEATURE_DISABLED` |

说明：

- 权限范围只说明应用可以请求哪类操作，不代表应用已获准使用联机功能，也不代表站点已开放该功能。
- 应用能力只看 MindAuth 审核后的应用资料；论坛**不维护第二套应用白名单**。公开客户端与需要额外审核的能力是两个概念：创建公开客户端是自助的，联机能力需要审核。
- 站点开关与能力都受运行时状态影响：客户端应先读 `GET /api/v1/capabilities` 与 `GET /api/v1/multiplayer/capabilities`，再展示入口，不要靠报错来探测。
- 第三方令牌在 Multiplayer 会话、邀请、加入与中继路径上同时受第三方联机开关与 `supports_multiplayer` 约束；Presence 创建连接与活动发布要求 `supports_presence`，并以在线状态与富活动的站点开关为准，不额外要求第三方联机开关。
- 能力检查按 MindAuth 标记的第一方分类放行：只有明确标记为第一方的 OAuth 客户端跳过第三方能力检查，其余令牌（包括缺少分类信息的）一律按第三方处理（fail-closed）。`/api/v1/multiplayer/*` 的受保护操作（含 capabilities、preferences 读取）检查 `supports_multiplayer`；Presence 的创建连接与活动发布在令牌明确标记为第三方时校验 `supports_presence`。

## 第一步：申请公开客户端

1. 在 MindAuth 开发者中心创建应用。公开客户端由你自助创建，创建后立即取得 `client_id`，没有 `client_secret`。
2. 登记精确的重定向地址：Web 用 HTTPS 完整地址；原生应用用自己的 scheme；桌面本机回环只接受 `127.0.0.1`、`[::1]`、`localhost`，端口 `0` 表示运行时随机端口。不要在回调里放通配符、fragment 或 userinfo。
3. 申请产品实际需要的权限范围，并在应用资料中申请联机能力：
   - `presence.read` / `presence.write`：在线状态与富活动；需要 `supports_presence` 能力。
   - `multiplayer.read` / `multiplayer.write`：会话、邀请、加入与中继；需要 `supports_multiplayer` 能力。
   - 需要被启动器处理加入意图的场景，再申请 `supports_join_intent` 并提供带 `{intent_id}` 的启动 URI 模板；该能力还用于“默认联机客户端”偏好列表。
4. 审核与变更：应用资料与能力以 MindAuth 审核结果为准；审核通过或撤销后，论坛在下一次读取应用资料时生效（见[生命周期与时效](#生命周期与时效)）。

**绝对不要放进客户端的内容：**`client_secret`、论坛 External API Key、Relay Agent 的机器凭据、任何服务端密钥或刷新令牌。公开客户端只持有自己的 `client_id`；访问令牌与刷新令牌按用户会话安全存储，不随发行包分发。

## 第二步：PKCE 授权与令牌安全

完整的协议细节见[第三方客户端接入指南](./public-client-v1.md)与 MindAuth 公开客户端 PKCE 指南。要点：

1. 每次登录生成新的 `state` 与 `code_verifier`，计算 `code_challenge = BASE64URL(SHA256(code_verifier))`；不复用上一次的值。
2. 用系统浏览器打开 MindAuth `/api/authorize`；回调成功后先校验 `state`，再用授权码、相同的 `redirect_uri` 与 `code_verifier` 调用 `/api/token`。
3. 访问令牌是不透明令牌：只作为 `Authorization: Bearer` 使用，客户端不解析、不落日志。
4. 刷新令牌按平台安全存储；刷新遵循 MindAuth 的轮换与 `Idempotency-Key` 语义（见授权指南）。
5. 退出或解除授权调用 MindAuth `/api/revoke` 或用户的“已授权应用”页面。

论坛服务端用保密的资源服务器凭据校验令牌，该凭据不进入任何客户端。令牌失效、撤销或被拒绝时继续调用会得到 401。

## 第三步：在线状态与活动

联机功能推荐先建立 Presence 连接，让好友看到在线状态与加入入口。

```http
POST /api/v1/presence/connections
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"platform":"launcher","status":"online"}
```

- 平台取值：`web`、`launcher`、`lanlink`、`mindustry_mod`、`android`；状态取值：`online`、`idle`、`dnd`、`invisible`。
- 返回 `connection_id`（`prs_…`）、`heartbeat_interval`（30 秒）与 `expires_in`（90 秒）。每 30 秒调用一次心跳，90 秒无心跳连接过期。
- 富活动通过 `PUT /api/v1/presence/connections/{id}/activity` 发布；`client_id`、`platform`、`updated_at` 由已认证连接补齐，请求体里提交的应用资料不会生效。
- 标记为第三方的令牌在创建连接与发布活动时会校验 `supports_presence`；心跳、修改状态与删除既有连接不重复校验该能力。
- 在线状态与活动的可见性仍受用户隐私设置约束；好友聚合接口返回的 `actions` 全部由服务端策略计算。

写操作（POST/PUT/PATCH/DELETE）还遵循站点验证策略与封禁状态：在要求手机号验证的站点（如 MDTBBS），写入前需完成手机号验证；在要求邮箱验证的站点则检查邮箱验证。

## 第四步：会话与对端

```http
POST /api/v1/multiplayer/sessions
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"game_id":"mindustry","game_version":"v157","visibility":"friends","join_policy":"friends","max_players":8}
```

- 可见范围：`private`、`friends`、`unlisted`；加入策略：`open`、`friends`、`request`、`invite_only`。`private + open` 组合不合法。缺省为 `private + friends`。
- `max_players` 取值 2–64，缺省 8。`joining`、`active` 与仍在恢复窗口内的 `disconnected` 对端都占用名额。
- 创建响应包含 `session`、`peer` 与一次性 `resume_token`；`unlisted` 会话还返回一次性展示的 `join_code`（10 位十六进制）。
- `resume_token` 绑定用户与 OAuth `client_id`，只能使用一次，恢复成功后轮换出新令牌。立即安全保存；旧令牌在成功恢复后不可再用。
- 对端心跳每 30 秒一次；90 秒无心跳变为 `disconnected` 并清理候选与中继分配，保留 60 秒恢复窗口；窗口结束后过期，名额释放。
- 房主主动离开：普通成员返回 `{"status":"left"}`；房主返回 `{"status":"closing","grace_seconds":60}`，会话在 60 秒宽限期内可由同一用户、同一客户端凭恢复令牌恢复，否则关闭。
- 会话 `expires_at` 是创建后 4 小时（当前实现值，非 SLA 承诺）；到期后服务端关闭会话。

## 第五步：邀请、加入请求与加入意图

| 流程 | 发起 | 有效期 | 消费语义 |
| --- | --- | --- | --- |
| 邀请 | 活跃对端 `POST /multiplayer/invites` | 5 分钟 | 接受返回 `join_intent`；重复接受在可恢复时返回同一结果 |
| 加入请求 | 申请者 `POST /sessions/{id}/join-requests` | 5 分钟 | 房主批准后返回绑定申请者客户端的 `join_intent`，10 分钟有效 |
| 加入意图 | 邀请接受、房主批准、或直接 `POST /sessions/{id}/join-intents` | 首次使用 60 秒 | 绑定用户；首次成功使用时绑定客户端；相同用户与客户端在 10 分钟恢复窗口内重放返回相同结果 |

- 加入意图是单次消费凭据：不要重放；只有当客户端成功消费并保存事件游标后，才向服务端发送批准事件的确认。
- `POST /multiplayer/join-intents/{id}/consume` 恢复窗口内重试是安全的（幂等返回同一对端与稳定恢复令牌）；跨客户端使用返回 `JOIN_INTENT_CLIENT_MISMATCH`。
- 不公开会话加入码只作为短期邀请信息分享，不承诺长期有效。
- V1 没有公共大厅与房主迁移；被屏蔽关系优先于所有加入路径。

## 第六步：网络候选交换

- 每个活跃对端用 `POST /sessions/{id}/candidates` 发布自己的候选地址；每对端最多 32 条，每条 90 秒有效。
- 重复发布相同的 `kind`、`transport`、`address`、`port` 会续期并复用原 `candidate_id`，适合定期刷新。
- `metadata` 序列化后不超过 1 KiB，不要放入令牌、凭据或敏感信息。
- 地址只在同会话对端之间短期交换；`GET .../peers/{peerId}/candidates` 只对同会话活跃对端可见。
- 客户端负责 STUN/NAT 探测与 P2P 建连；论坛只做信令交换，不转发或保存游戏数据。

## 第七步：官方中继与 Relay WSS

P2P 不通时，对端可以用一次性凭证经由官方中继连接：

```http
POST /api/v1/multiplayer/sessions/{id}/relay
Authorization: Bearer <ACCESS_TOKEN>
```

响应包含 `allocation_id`、`agent_id`、`endpoint`（WSS 地址）、短期 `credential` 与 `expires_in`（120 秒）。

- 凭证时效与受众：当前实现签发的凭证只对指定 Relay Agent 与指定分配有效，120 秒到期。**未承诺**固定网络路径、区域选择或延迟指标。
- 使用方式：凭证只允许放入 WSS 建连后的首条认证帧；不得放入 URL、查询参数、子协议名、日志或分析事件。收到 `auth_ok` 后按已公布的客户端数据通道格式传输。
- 单次消费与重试：凭证在服务端被消费一次；同一 Agent 连接的重复确认在到期前可重试；换连接标识重放会被拒绝（`RELAY_LIMIT_REACHED`）；已撤销或过期的分配返回 `RELAY_UNAVAILABLE`。
- 续期与重复请求：已连接的对端可再次调用分配接口就地续期，服务端要求沿用同一 Agent 与连接身份；若上一次分配仍未被 Agent 确认（尚未建立连接），重复请求会得到 `RELAY_LIMIT_REACHED`。
- 撤销：对端离开、超时清理或失效时，服务端将分配标记为撤销并通过 `relay.revoked` 事件通知会话；凭证随后的任何消费都会被拒绝。**未承诺** Agent 侧 TCP/WSS 物理断开的时刻，该行为属于基础设施边界（[仅见基础设施边界](#公开-api-与仅基础设施边界)）。

## 第八步：实时事件

低延迟更新走 `/realtime/v1` WebSocket，API 快照仍是事实来源。

1. 用 `POST /api/v1/realtime/tickets` 创建 60 秒有效的一次性票据（`friends.read`）。
2. 以 `/realtime/v1?ticket=…` 连接；票据在连接成功或过期后立即失效，不记录、不分享。
3. 首帧 `hello` 含心跳间隔（30 秒）。发送 `{"type":"heartbeat"}` 维持；订阅会话用 `{"type":"subscribe","sessions":["ses_…"]}`（最多 32 个），订阅要求调用者是会话活跃对端。
4. 事件确认使用 `{"type":"ack","stream":"user","id":"…"}`；断线后发送 `{"type":"resume","last_event_id":"…","sessions":{…}}`。收到 `resume_failed`（`reason: snapshot_required`）时重新读取 API 快照，不要依赖事件补发。消息上限 16 KiB。

服务端帧：`hello`、`heartbeat_ack`、`subscribed`、`event`、`ack`、`error`、`resumed`、`resume_failed`。事件流保留 600 秒，恢复最多补发 200 条。连接被拒绝时按关闭码区分：票据缺失或无效关闭码 4401 `AUTH_REQUIRED`；来源不匹配关闭码 4403 `ORIGIN_DENIED`。单条客户端消息上限 16 KiB，超过时由协议层关闭连接；无法解析的消息返回 `error` 帧（当前实现为通用 `ACTIVITY_INVALID`）。

## 生命周期与时效

逐对象的签发者、受众、TTL、续期与消费/重放语义集中在[多人联机 API V1 的生命周期与时效](./multiplayer-v1.md#生命周期与时效)表中（该表由当前实现逐项核对）。客户端设计超时与重试时，注意三类容易踩错的期限：对端心跳 30 秒 / 租期 90 秒、加入意图首次使用 60 秒 / 结果恢复 10 分钟、Relay 凭证 120 秒。

这些时效都是当前实现值，用于客户端设计，**不构成 SLA 承诺**；标注“未承诺”的语义不得被当成保证。

## 错误处理、重试与幂等

统一按 HTTP 状态与稳定 `error.code` 处理，不解析 `message`。联机全部稳定错误码、HTTP 状态与是否可重试，见[多人联机 API V1 的错误码表](./multiplayer-v1.md#错误码)。

重试纪律：

- 可安全重试（幂等或受恢复语义保护）：GET 快照、心跳、候选重复发布、加入意图恢复窗口内的消费、同一中继连接的凭证确认。
- 单次消费凭据不得重放：Peer 恢复令牌、加入意图（非恢复语义）、实时票据、中继凭证。响应丢失时不要盲目重发旧值；按各自恢复语义处理，或回到 API 快照重新建状态。
- 429 一律按有上限的指数退避重试；有 `Retry-After` 时至少等待该时长，不要忙等。
- Multiplayer V1 当前没有 `Idempotency-Key` 语义；幂等性由各资源的恢复窗口与续期规则提供（加入意图结果恢复、中继同连接重试）。不要假设通用幂等键。
- `4xx`（除 429）表示要求未满足或状态已变化，先改请求或改状态；`5xx` 可退避重试，并携带 `meta.request_id` 便于排查。

## 限流

限流按「已认证用户 > 会话 > IP」的身份粒度、按接口独立计桶。达到上限返回 HTTP 429 `RATE_LIMITED`，并带 `Retry-After`（固定窗口剩余秒数）。未单独声明的读接口默认约 1200/60s，写接口默认约 180/60s。

联机接口的更严格限制（会话创建、加入请求、中继分配 10/60s；加入与意图消费 30/60s；邀请与意图创建 20/60s；候选读写 120/60s；Presence 心跳 60/60s 等）逐项列在[多人联机 API V1 的接口一览](./multiplayer-v1.md#接口一览)与公开 OpenAPI 的 `x-rate-limit` 元数据中。限制属于站点策略，运行时可能收紧；不要用“上次能通过”推断当前额度。

## 撤销、封禁与隐私

影响边界（均为当前实现，未承诺即时生效的强制断开）：

- **OAuth 撤销**：撤销后新请求最迟约 30 秒内被拒绝；已建立的 WebSocket 不会被服务端主动切断，重连与刷新会失败。
- **封禁**：新请求被拒绝（缓存最长 10 秒）；已建立连接持续到自然结束；封禁状态可查询接口返回的稳定错误按 403 处理。
- **应用能力撤销**：仅阻止后续受保护请求（含会话、邀请、加入、中继，以及 Presence 的创建与活动发布）；不立即中止现有会话。
- **站点开关关闭**：与能力撤销类似，只影响新请求；中继开关关闭时不再分配新凭证，既有凭证到期即止。
- **隐私**：在线状态、活动、最后在线时间与加入动作全部由服务端隐私策略与屏蔽关系裁决；客户端直接使用服务端返回的 `actions`，不要自行推导。

不得记录、不得外泄：访问令牌、刷新令牌、`client_secret`、服务端资源服务器凭据、Relay 凭证、实时票据、Agent 机器凭据、External API Key，以及任何用户 PII（邮箱、手机号、IP）明细。候选 `metadata` 与活动文本不要携带上述内容。调试日志只保留状态、`request_id` 与散列后的标识。

## Sandbox 与示例

当前不提供面向第三方的独立 sandbox 环境或测试应用，也没有开发旁路接口或预置测试令牌。测试请使用自己的公开客户端连接你被允许使用的部署，并遵循该部署的站点开关；开发者中心的[在线调试](/api/v1/debugger)使用你自己的公开客户端对当前站点执行真实请求，不等于沙盒。

本页与[接入指南](./public-client-v1.md)的示例只用公开 PKCE 客户端、`client_id`、重定向地址与访问令牌占位符，不包含任何机密凭据、测试令牌、内部主机或机器凭据。若曾在任何示例或客户端中放入过机密值，视为已泄露并立即轮换。

## 待验证项（Needs Verification）

下列内容无法由本仓库代码证明，本页**不把它们写成承诺**；需要上线验收或运营确认后再补结论：

- 生产部署当前的站点开关取值（会话、邀请、中继、第三方联机、在线状态、富活动）——属于部署配置，不在仓库。
- 是否提供面向第三方的独立 sandbox 或 Staging 环境——当前没有；若运营方后续提供，需同步更新本页与[接入指南](./public-client-v1.md)。
- MindAuth 应用能力（`supports_multiplayer` 等）的审核时长与拒绝理由回执——MindAuth 侧流程，本仓库无对应契约。
- Relay Agent 的实际部署区域、容量水位与网络路径——基础设施侧信息，不属于公开客户端契约。
- Agent 侧 TCP/WSS 物理断开时刻、撤销后连接被强制关闭的具体时延——当前实现只保证不主动断开，未承诺断开时点。
- 生产环境对上述 TTL 与限流值的任何运营调整——客户端应按响应头与错误码自适应，不要硬编码为唯一事实。

## 公开 API 与仅基础设施边界

公开导航与公开 OpenAPI 只包含稳定 public OAuth 与 Multiplayer V1。以下内容**不属于**公开客户端文档，不在本导航中提供说明或链接：

| 分类 | 归属 |
| --- | --- |
| 服务端集成接口与 External API Key（如 `/api/external/v1/*` 系列） | 私有基础设施说明；凭证只在可信服务端保存 |
| Relay Agent 注册、心跳、分配确认、撤销等机器接口 | 私有基础设施说明；仅 MDTBBS 基础设施使用 |
| 内部 Relay 凭证消费与撤销流程 | 基础设施侧实现，客户端不可见 |
| LanLink Broker API、管理界面与内部接口 | 私有基础设施说明；LanLink 集成文档以相同的公共/内部边界表达 |
| 论坛历史兼容路由、管理端与开发快照 | 不属于第三方契约 |

第三方客户端只需 Public API：公开 OAuth + Multiplayer V1 + 公开文档合同。若你的产品是服务端服务或中继运营方，请联系站点运营评估，不要基于未公开接口进行投入。
