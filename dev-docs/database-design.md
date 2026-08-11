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

## 归档说明

旧 Supabase/RLS 设计已归档到 `dev-docs/archive/2026-08-11-supabase-history/database-design-supabase-rls.md`。

默认开发、搜索、计划和实现不要进入 `dev-docs/archive/`。只有用户明确要求查看历史 Supabase 资料时，才允许读取归档。

## 验证要求

- schema 变更必须先更新本文件和对应 `dev-docs/sql/` migration。
- 权限变更必须覆盖用户 A/B、家庭 A/B、owner/member/readonly 负例。
- 发布前必须验证 API 负例，而不是只检查前端按钮隐藏。
