# Mainland Database Design

## 目标

这是中国大陆正式版 PostgreSQL schema 草案。它用于后续自有邮箱密码登录、服务端权限校验和阿里云部署准备，不影响当前 Vercel + Supabase 临时测试版。

对应 SQL 草案见：

- `dev-docs/sql/mainland_initial_schema.sql`

## 与当前 Supabase 版的差异

当前临时版：

- 用户身份来自 Supabase `auth.users`。
- 数据隔离主要依赖 Supabase RLS。
- `items.created_by` 默认通过 `auth.uid()` 写入。

国内正式版草案：

- 新增自有 `users` 表。
- 新增 `auth_sessions` 表。
- `profiles`、`households`、`household_members`、`items.created_by` 改为引用自有 `users.id`。
- 不使用 Supabase RLS。
- 用户隔离由 Next.js 服务端权限校验 + PostgreSQL 外键/组合外键共同保证。

## 表清单

认证表：

- `users`
- `auth_sessions`

业务表：

- `profiles`
- `households`
- `household_members`
- `areas`
- `locations`
- `items`

## 关键权限边界

- 每个用户第一版只有一个默认 household。
- 所有业务数据通过 `household_id` 收敛。
- 前端传入的 `household_id`、`area_id`、`location_id`、`item_id` 都不可信。
- 服务端写入前必须确认当前用户属于目标 household。
- 更新和删除必须按当前用户 household 过滤，不能只按主键执行。
- `locations.area_id` 和 `items.location_id` 通过组合外键保证同 household。

## 当前状态

状态：草案，未执行到任何生产数据库。

下一步：

1. 密码哈希算法已确认使用 bcrypt。
2. session 默认有效期已确认为 30 天。
3. 测试阶段先不做邮箱验证和密码重置；正式公开前必须补齐。
4. 在本地 PostgreSQL 或阿里云测试 PostgreSQL 中演练 migration。
