# Database Design Truth

## 当前结论

当前数据库真源只面向阿里云自托管版本：

- 数据库：自有 PostgreSQL。
- 身份来源：自有 `users` / `auth_sessions`。
- 权限边界：Next.js API route 读取 session，service 层校验用户和 household membership，repository 层只执行已校验的数据库操作。
- 前端和 Android 客户端不得直连 PostgreSQL，不得携带可信用户身份，不得绕过服务端权限校验。

## 当前 SQL 真源

- 基础 schema：`dev-docs/sql/mainland_initial_schema.sql`
- 家庭共享：`dev-docs/sql/family_sharing_self_hosted.sql`
- 成员角色：`dev-docs/sql/member_roles_self_hosted.sql`
- 密码重置：`dev-docs/sql/password_reset_self_hosted.sql`
- 区域/位置照片：`dev-docs/sql/area_location_photos_self_hosted.sql`（2026-08-11）

## 归档说明

旧 Supabase/RLS 设计已归档到 `dev-docs/archive/2026-08-11-supabase-history/database-design-supabase-rls.md`。

默认开发、搜索、计划和实现不要进入 `dev-docs/archive/`。只有用户明确要求查看历史 Supabase 资料时，才允许读取归档。

## 验证要求

- schema 变更必须先更新本文件和对应 `dev-docs/sql/` migration。
- 权限变更必须覆盖用户 A/B、家庭 A/B、owner/member/readonly 负例。
- 发布前必须验证 API 负例，而不是只检查前端按钮隐藏。

## 区域/位置照片表结构（2026-08-11）

- `areas` 新增 `photo_key text`，可空、唯一；唯一索引 `areas_photo_key_unique` 只作用于非空值。
- `locations` 新增 `photo_key text`，可空、唯一；唯一索引 `locations_photo_key_unique` 只作用于非空值。
- 区域/位置照片不走 `pending_photos` 暂存：上传接口直接压缩、保存文件、更新 `photo_key`；替换时删除旧文件，删除区域/位置时清理关联照片文件。
- 照片接口携带 `householdId` 查询参数，服务端按 membership 校验后再操作。
- 照片读取沿用家庭成员权限；写入要求非 readonly 成员，服务端校验。
- 服务器保存约 1280px、100–300KB 清晰图；Android 本地缓存，Web 浏览器缓存。

## 部署验证

- 2026-08-11 已在 `home_inventory_test` 执行 `dev-docs/sql/area_location_photos_self_hosted.sql`，`areas.photo_key`、`locations.photo_key` 及两个唯一索引已确认。
- 真实 PostgreSQL 集成测试 `src/server/photos/photo-repository.integration.test.ts` 覆盖照片 key 的写入、替换、读取、清空。
