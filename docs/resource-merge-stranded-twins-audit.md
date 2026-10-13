# Resource 合并留守孪生行：只读干跑

此交付对应 Issue #71。脚本 [audit-resource-merge-stranded-twins.sql](../scripts/audit-resource-merge-stranded-twins.sql) 只读盘点 `resource_dependencies` / `resource_compatibilities` 与各自 legacy 孪生行的版本分叉，不修数据。

## 判定口径

- legacy 与 modern 通过 `modern.legacy_source_id = legacy.id` 配对；两侧 `resource_version_id` 不相同即输出候选。
- 缺陷代码区间为 `[9af8e892, ce095bd7fea2d9fe20fd60718ac393c624210ce9)`。脚本展示 `resource_merge_logs.created_at` 和 version collision mapping，供业务方核对干跑窗口。`created_at` 是数据库 `DATETIME`，不带时区；执行者须先确认数据库时区及修复在目标环境的实际上线时间，不能把 Git 提交时间直接当成数据库时间谓词，也不能因为时间字段缺失而丢弃分叉。明细查询不按时间硬过滤，避免时区或部署时间差异造成漏报。
- `attachments_migrated` **不参与筛选**。它记录的是 `resource_files` 更新是否有受影响行；两张证据表的重挂在同一迁移分支内，因此 `attachments_migrated = false` 仍可能有本卡要找的孪生分叉。v1 会漏掉这类“有 legacy 行、文件更新 affectedRows 为 0”的数据。
- `legacy_source_id IS NULL` 的 modern-only 行不会与 legacy 表连接，按无孪生排除。没有对应 merge log mapping 的分叉仍会返回，`attribution` 标为 `unattributed_split_needs_manual_review`；检测到多跳链时标为 `matched_but_multihop_needs_manual_review`。这两类不得自动归因；日志无法映射和多跳形态均需人工登记为未覆盖。未归因行的 `source_resource_id` / `target_resource_id` / merge-log `created_at` / source-target mapping IDs 会为空；`modern_row_resource_id` 与 `legacy_row_resource_id` 仅供人工追查，不能代替 merge log 归因。
- 预期缺陷方向是 modern 行仍在 `source_version_id`，legacy 孪生已挂到 `target_version_id`。输出中的 `stranded_table` / `stranded_row_id` 指现代侧留守行，`legacy_twin_id` 供配对复核。`content_key` 列出可逐行比较的业务字段。

## 权限、运行方式与耗时

使用 MySQL 8.0+ 客户端和目标数据库的只读副本或获批只读连接；不要从应用 DataSource 或生产机器上执行。账号仅需以下表的 `SELECT` 权限：`resource_merge_logs`、`resource_versions`、`resources`、`resource_version_dependencies`、`resource_dependencies`、`resource_version_compatibilities`、`resource_compatibilities`。不需要 `INSERT`、`UPDATE`、`DELETE`、DDL、临时表、文件权限或应用密钥。

例如：

```sh
mysql --host="$AUDIT_DB_HOST" --user="$AUDIT_DB_USER" --database="$AUDIT_DB_NAME" \
  --default-character-set=utf8mb4 --batch --raw \
  < scripts/audit-resource-merge-stranded-twins.sql
```

合并日志和四张证据表按主键 / `legacy_source_id` 唯一索引配对。按当前查询形状预计通常为数秒至数分钟；本地没有生产数据，也未运行 `EXPLAIN` 或真实干跑，耗时与命中数均 **Needs Verification**。首次执行应在低峰期预留 10 分钟，记录数据库版本、执行时间、行数及错误；如超时，停止并在只读副本评估执行计划，不要扩大权限或改写生产数据。

## 结果判读与重复检查

- 每行是一条 modern / legacy 孪生分叉候选。`attribution` 为 `matched_version_collision_mapping` 时，可按 `created_at`、资源 ID、版本 ID 对照缺陷窗口；空值/`unattributed_split_needs_manual_review` 需单独核查，不能从汇总中静默剔除。
- 第二个结果集一条记录对应一个有版本冲突映射的 `resource_merge_logs` 行；其中 `p1_trigger_candidate = 1` 表示目标资源当前满足 `status IN ('approved','published') AND is_public = 1`。按此结果集中的日志行计数，不加缺陷时间窗，作为 Issue #65 定义的 P1 触发器候选数；不要按明细留守行数重复计数。数据库真实计数仍为 **Needs Verification**。
- 命中数是候选数，不是可直接更新的行数。legacy 孪生行即使有唯一 `legacy_source_id` 索引，重挂 modern 行仍可能使目标版本出现同内容重复。修复前必须按 `content_key` 与目标版本现存行逐条比对，由业务方决定保留、合并或排除；本卡不提供任何 `UPDATE`。
- 零行只表示本查询未发现可见的直接分叉；不证明多跳合并、无日志映射或历史 schema 缺失形态不存在。

## 构造形态判读（静态核对，未连接数据库）

| 输入形态 | 明细查询结果 |
| --- | --- |
| `attachments_migrated = false`，但 modern 与 legacy 孪生版本不同，且日志有对应版本映射 | 命中；flag 不在查询条件中 |
| modern 行 `legacy_source_id IS NULL` | 排除；无 legacy 配对行 |
| legacy/modern 孪生版本不同且有对应冲突映射 | 命中并标记映射；若多跳则标待人工复核 |

以上是对 SQL 条件的静态判读，不是数据库夹具实跑，也不替代 CNB 独立复审。

## 与 Issue #65 / PR #76 的边界

PR #76 修复 `mergeResource` 后续写入时对 legacy 与 modern 孪生行的对称重映射。此脚本不改 `mergeResource`，不改读侧投影，也不修复历史数据；PR #76 的代码修复不会改变已经写入的历史分叉判定口径。当前没有真实库连接，未执行生产查询；命中数、P1 候选数及实际耗时均为 **Needs Verification**。
