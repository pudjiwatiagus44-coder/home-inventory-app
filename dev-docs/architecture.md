# Architecture Truth

## 推荐架构

- 推荐产品形态：Web/PWA first，后续再包装成移动 App。
- 推荐技术路线：Supabase Auth + Supabase Postgres + RLS + 前端 Web/PWA。
- 推荐部署形态：前端部署到托管平台，数据和认证由 Supabase 承载。
- 为什么这是主路线：本产品的核心难点是账号、用户数据隔离、结构化查询和长期保存。Supabase 提供 Auth、Postgres 和 Row Level Security，适合从 MVP 走向公开用户。
- 被拒绝路线和原因：
  - 当前 Python + JSON 本地服务：适合个人局域网，不适合多用户账号和公开推广。
  - 自建完整后端：第一阶段维护成本过高。
  - Firebase：也可行，但本项目的数据关系更适合 Postgres。
  - 原生 App 先行：会拖慢账号、数据和核心闭环验证。

## 技术路线

- 前端框架：待最终技术选型确认。主推荐倾向 Next.js 或 Vite + React，理由是生态成熟、Supabase 官方文档充足、适合 PWA。
- 设计系统 owner：前端项目内的 design tokens 和基础组件。
- 后端能力：第一阶段优先使用 Supabase Auth、Postgres、RLS 和自动 API；仅在需要复杂服务端逻辑时再加入自定义后端。
- 数据库：Supabase Postgres。
- 迁移方式：SQL migration 文件，不在控制台手改后忘记回写。
- 第三方 SDK/API：Supabase JavaScript SDK。
- 官方资料：
  - Supabase Auth: https://supabase.com/docs/guides/auth
  - Password Auth: https://supabase.com/docs/guides/auth/passwords
  - Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
  - Supabase with Next.js: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs

## Owner Map

| 概念 | Owner | 不能由谁拥有 | 验证方式 |
| --- | --- | --- | --- |
| 产品边界 | `dev-docs/project-brief.md` | 临时代码、聊天记忆 | 文档审阅 |
| 前端路由 | 前端应用路由配置 | Supabase 数据库 | 本地页面访问 |
| 设计 token | 前端样式/token 文件 | 零散页面内联样式 | 截图和 CSS 检查 |
| 业务组件 | 前端业务组件 | 数据库触发器 | UI 行为验证 |
| API 合同 | Supabase schema/RLS + 客户端调用约定 | UI 文案 | API/数据库验证 |
| 业务逻辑 | 前端 use case + 数据库约束/RLS | 纯 UI 显示层 | 正负路径测试 |
| 数据库 schema | migration SQL | 前端本地状态 | migration diff |
| 登录/权限 | Supabase Auth + RLS | 前端隐藏按钮 | 用户 A/B 权限负例 |
| 第三方接入 | Supabase SDK 初始化层 | 任意页面随手初始化 | 环境变量和调用检查 |
| 部署/配置 | `.env.example` + 平台配置说明 | 硬编码密钥 | 构建和环境检查 |

## 初始数据模型草案

```text
auth.users
  -> profiles
  -> households
  -> household_members
  -> areas
  -> locations
  -> items
```

第一版虽然不做家庭成员共享，但仍建议保留 `households` 概念。每个用户注册后自动拥有一个默认家庭空间，后续扩展共享时不用大迁移。

### profiles

- `id` references `auth.users.id`
- `display_name`
- `created_at`

### households

- `id`
- `owner_user_id`
- `name`
- `created_at`

### household_members

- `household_id`
- `user_id`
- `role`：第一版仅 `owner`
- `created_at`

### areas

- `id`
- `household_id`
- `name`
- `color`
- `sort_order`
- `created_at`
- `updated_at`

### locations

- `id`
- `household_id`
- `area_id`
- `name`
- `sort_order`
- `created_at`
- `updated_at`

### items

- `id`
- `household_id`
- `location_id`
- `name`
- `note`
- `expire_date`
- `created_by`
- `created_at`
- `updated_at`

## 权限边界

- 用户只能读取自己所属 household 的数据。
- 用户只能写入自己所属 household 的 areas、locations、items。
- 第一版没有管理员读取用户数据的功能。
- 前端可以显示/隐藏按钮，但真正权限必须由 RLS 保证。
- service role key 只能在服务端或运维脚本中使用，不能暴露给浏览器。

## 请求生命周期

```text
用户操作
  -> 前端表单校验
  -> Supabase client 带当前用户 session 请求
  -> Supabase Auth 识别用户
  -> Postgres RLS 校验 household membership
  -> 数据写入/读取
  -> 前端展示成功、失败、空状态或权限错误
```

## 验证方式

- 本地启动命令：待技术选型最终确认。
- 构建命令：待技术选型最终确认。
- 测试命令：待技术选型最终确认。
- UI 验证：注册、登录、新增位置、新增物品、搜索、编辑、删除、退出。
- API/数据库验证：检查 Supabase 表数据。
- 权限负例：用户 B 不能读写用户 A 的 household 数据。
- Git checkpoint：第一阶段文档和代码分别小步提交。

