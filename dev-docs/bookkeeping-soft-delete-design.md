# 一键记账软删除与同步墓碑契约

日期：2026-08-29  
状态：P0-T0 服务器契约真源；仅供测试设计与后续实现使用，未授权生产执行。

## 1. 范围与不变量

- 只读写 `bookkeeping_*` 表，不修改库存、家庭、认证或其他业务表。
- 交易删除是软删除：写入 `deleted_at`，保留原交易字段和稳定 UUID；服务器不自动硬删除墓碑。
- 服务器使用 UTC `now()` 判断恢复窗口。客户端时间只能展示，不能决定是否允许恢复。
- 恢复窗口为严格小于 30×24 小时；恰好 30 天及以后拒绝，未来删除时间拒绝。
- 请求和响应不得包含 `rawOcrText`、截图、识别置信度或密钥。

## 2. 请求与响应契约

### 新增、修改与删除

`UPSERT` 新增可无 `serverId`，客户端必须在重试前分配稳定 UUID；修改必须携带稳定 `serverId`、`baseUpdatedAt` 和 `localUpdatedAt`。基线过期返回 `conflict`，不得伪造 `applied`。

`DELETE` 必须携带 `op`、`entityType`、`localId`、稳定 `serverId`、`baseUpdatedAt` 和 `localUpdatedAt`，不携带交易 payload。首次删除写入 `deleted_at` 和新的服务端 `updated_at`，返回 `applied`；同一 UUID 重复 DELETE 必须幂等返回 `applied`，不得生成新记录。不存在、归属不符或实体类型不符返回 `rejected/not_found`，不得静默成功。

### 恢复

恢复使用带稳定 UUID 的完整脱敏 `UPSERT`。服务端读取当前墓碑的 `deleted_at`，使用服务端 UTC 时间判定：删除未满 30 天才允许清空 `deleted_at` 并返回 `applied`；恰好 30 天、超过 30 天、未来时间或不存在时分别返回 `rejected/restore_window_expired`、`rejected/invalid_deleted_at` 或 `rejected/not_found`。恢复必须经过冲突检查。

### 拉取墓碑、结果与隔离

`since` 增量必须返回墓碑：`deleted: true`、稳定 `serverId` 和 `serverUpdatedAt`，不得被 `deleted_at is null` 过滤；客户端只更新本地软删除状态，不物理删除。

每个操作必须有结果。只有身份匹配的 `applied` 才能标记本地同步完成；`conflict`、`rejected` 或缺失结果继续待同步。相同 DELETE 重试使用相同 UUID。

所有查询、写入、墓碑拉取和恢复都必须通过当前用户拥有的 `bookkeeping_accounts` 过滤。用户 A 不能读取、删除、恢复用户 B 的账本或交易；指定他人 `accountId` 返回 403 或等价拒绝，不返回数据。

## 3. 测试矩阵

| 场景 | 预期证据 |
|---|---|
| 新增、修改无冲突 | 稳定 UUID，返回 `applied` |
| 修改基线过期 | `conflict`，不覆盖服务端较新版本 |
| 首次 DELETE | 写墓碑、更新 `updated_at`、`applied` |
| 重复 DELETE | 幂等 `applied`，不新增记录 |
| DELETE 不存在 UUID | `rejected/not_found` |
| 29 天 23:59:59 恢复 | `applied`，清空 `deleted_at` |
| 恰好 30 天或超过 30 天恢复 | `rejected/restore_window_expired` |
| 未来 `deleted_at` 恢复 | `rejected/invalid_deleted_at` |
| `since` 增量 | 含 `deleted=true` 墓碑 |
| 墓碑下拉到另一设备 | 本地软删除，不物理删除 |
| A 访问 B 账本 | 403 或空，不泄露 B 数据 |
| DELETE/恢复重试 | 结果可重复，UUID 不变化 |
| 脱敏边界 | 无 rawOcrText、截图、confidence、密钥 |

## 4. 迁移、回滚与发布门

迁移只允许新增或校正 `bookkeeping_transactions.deleted_at timestamptz` 及增量查询所需索引；必须使用幂等 DDL，不得修改库存表。执行前在 `home_inventory_test` 做备份/快照并记录 schema 检查结果；失败时仅回滚本次 `bookkeeping_*` 迁移，不删除已有账目。

服务器实现前必须在测试库验证账号隔离、上述矩阵和迁移升级路径。生产发布前必须有备份、可执行回滚方案、构建/类型检查/测试库集成测试证据和停机窗口；未获用户确认不得连接生产库、执行迁移、部署或重启服务。

## 5. 未验证项

- 现有服务器实现尚未满足严格 30 天恢复拒绝和重复 DELETE 幂等契约。
- 测试库集成测试、迁移执行、生产发布均未进行。
