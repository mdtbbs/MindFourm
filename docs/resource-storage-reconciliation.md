# ResourceStorage 对账与修复

论坛数据库是资源元数据、版本、文件所有权和审核状态的事实源；ResourceStorage（RES）是对象字节、对象校验状态和绑定可见性的事实源。两边必须同时满足下载和发布条件。对账接口只供管理员使用，默认只读。

## 接口

```http
POST /api/admin/resources/storage/reconciliation/scan
Authorization: Bearer <admin-token>
Content-Type: application/json

{}
```

请求可选字段：

- `limit`：本次最多读取的论坛 `resource_files` 行数，范围 1–10000，默认 1000。RES 对象和绑定使用管理员清单的游标分页。
- `repair`：默认 `false`。为 `true` 时只会处理服务明确标记为安全的发现。
- `confirm`：必须与 `repair: true` 同时为 `true`；否则返回 `RESOURCE_STORAGE_REPAIR_CONFIRM_REQUIRED`。

响应包括 `run_id`、扫描时间、是否截断、对象/绑定/本地文件数量、按代码统计、完整发现列表和修复结果。发现条目只包含公开对象/绑定 ID、哈希、大小、状态和安全诊断，不包含 API key、存储路径、短期下载 token 或上游响应正文。

## 发现代码

| 代码 | 含义 | 默认修复 |
| --- | --- | --- |
| `missing_object` | 论坛文件引用的 RES 对象不存在 | 标记本地文件 `unavailable` |
| `missing_binding` | 对象存在，但缺少 `mindforum/resource_file` 绑定 | 以当前资源可见性重新绑定 |
| `binding_owner_mismatch` / `stale_binding_reference` | 绑定所有者或论坛保存的绑定 ID 不一致 | 通过 RES 的 owner 唯一键重绑 |
| `hash_mismatch` / `size_mismatch` / `mime_mismatch` | 本地声明与 RES 权威元数据不一致 | 标记 `unavailable`，不覆盖任何对象 |
| `object_unavailable` | RES 对象不是 `verified` | 标记 `unavailable` |
| `publication_mismatch` | 绑定可见性与已发布版本、资源审核状态或隐私设置不一致 | 重新绑定为 `public` 或 `private` |
| `availability_mismatch` | 本地仍报告可用，但对象已不可用 | 标记 `unavailable` |
| `dangling_resource_file` | 文件缺少有效的版本/资源关联 | 标记 `unavailable` |
| `orphan_binding` | RES 资源文件绑定找不到论坛文件 owner | 只报告 |
| `orphan_object` | 没有资源文件引用、资源文件绑定或其他绑定的对象 | 只报告 |

`public` 的预期条件与发布逻辑一致：资源未删除、资源状态为 `approved`/`published`、`is_public=1`、资源可见性不是 `private`，并且版本状态为 `published`。私有资源仍可以有 `available` 文件；`available` 表示对象可读取，不等于公开。

## 修复边界与审计

修复先通过 RES 绑定的 owner 唯一键创建或更新绑定，再在论坛数据库事务中写入 `provider_binding_id` 和可用状态。对账不会删除 RES 对象，也不会删除旧的未知绑定；物理回收仍由 ResourceStorage 的显式 GC 流程负责。哈希、大小、对象缺失和父级关联异常只会降级为不可用，等待人工重新上传或恢复。

每次请求和完成结果都会写入 `operation_logs`，动作分别为 `resource.storage.reconciliation.requested` 与 `resource.storage.reconciliation.completed`，详情只保存 `run_id`、计数、截断状态和修复结果数量。RES 不可用时扫描失败并保留请求审计；不会因为一次对账自动改变发布状态。

## 运维约束

- 先运行只读扫描，审阅 `findings`，再由管理员明确提交 `repair=true&confirm=true`。
- 扫描或修复都不会在应用启动时自动执行。
- 本版本不执行生产数据库迁移、不做生产对象迁移，也不删除历史文件。
