# Architecture Truth

## 推荐架构

- 推荐产品形态：Web/PWA first，后续再评估移动 App。
- 推荐技术路线：Next.js + TypeScript + Supabase Auth + Supabase Postgres + RLS + PWA。
- 推荐部署形态：前端部署到 Vercel 免费层，数据和认证由 Supabase 免费层承载；部署路线真源见 `dev-docs/deployment-route.md`。
- 为什么这是主路线：本产品的核心难点是账号、用户数据隔离、结构化查询和长期保存。Supabase 提供 Auth、Postgres 和 Row Level Security，Next.js 提供清晰的前端、服务端和部署约定，适合从 MVP 走向公开用户。

## 禁止路径

- 禁止把当前 Python + JSON 本地服务改造成多用户公开后端。
- 禁止在没有用户确认和真源更新时切换到 Firebase。
- 禁止第一阶段自建完整后端服务。
- 禁止原生 App 先行。
- 禁止在没有 RLS 的情况下把用户数据表暴露给前端。
- 禁止把 service role key 暴露给浏览器或提交到 Git。
- 禁止 mock 数据冒充真实 Supabase 功能。

## 技术路线

- 前端框架：Next.js。
- 语言：TypeScript。
- PWA：manifest + service worker 或框架推荐 PWA 插件，进入实现前再定具体方式。
- UI 基础：shadcn/ui + Tailwind CSS + 项目自己的 design tokens。
- 设计系统 owner：前端项目内的 token、基础组件和后续 `dev-docs/frontend-design.md`。
- 后端能力：第一阶段优先使用 Supabase Auth、Postgres、RLS 和自动 API；仅在需要复杂服务端逻辑时再加入 Next.js server actions/route handlers。
- 数据库：Supabase Postgres。
- 迁移方式：SQL migration 文件，不在控制台手改后忘记回写。
- 第三方 SDK/API：Supabase JavaScript SDK。
- 技术选择真源：`dev-docs/technical-selection.md`。

## Owner Map

| 概念 | Owner | 不能由谁拥有 | 验证方式 |
| --- | --- | --- | --- |
| 产品边界 | `dev-docs/project-brief.md` | 临时代码、聊天记忆 | 文档审阅 |
| 技术路线 | `dev-docs/technical-selection.md` | 单个组件或随手依赖 | 文档审阅 + package 检查 |
| 前端路由 | Next.js app route | Supabase 数据库 | 本地页面访问 |
| 设计 token | `src/styles/globals.css` 和基础组件 | 零散页面内联样式 | 截图和 CSS 检查 |
| 业务组件 | `src/components/inventory/` | 数据库触发器 | UI 行为验证 |
| API 合同 | Supabase schema/RLS + 客户端调用约定 | UI 文案 | API/数据库验证 |
| 业务逻辑 | 前端 use case + 数据库约束/RLS | 纯 UI 显示层 | 正负路径测试 |
| 数据库 schema | `supabase/migrations/` SQL | 前端本地状态 | migration diff |
| 登录/权限 | Supabase Auth + RLS | 前端隐藏按钮 | 用户 A/B 权限负例 |
| 第三方接入 | Supabase SDK 初始化层 | 任意页面随手初始化 | 环境变量和调用检查 |
| 部署/配置 | `dev-docs/deployment-route.md` + `.env.example` + Vercel/Supabase 平台配置 | 硬编码密钥、聊天记忆、个人电脑进程 | 构建、环境变量、Auth 回跳地址和生产 URL 验收 |

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

第一版虽然不做家庭成员共享，但仍保留 `households` 概念。每个用户注册后自动拥有一个默认家庭空间，后续扩展共享时不需要大迁移。

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
- 前端可以显示或隐藏按钮，但真正权限必须由 RLS 保证。
- public schema 中暴露给前端的用户数据表必须启用 RLS。
- service role key 只能在服务端或运维脚本中使用，不能暴露给浏览器。

## 请求生命周期

```text
用户操作
  -> Next.js 页面/组件
  -> 前端表单校验
  -> Supabase client 带当前用户 session 请求
  -> Supabase Auth 识别用户
  -> Postgres RLS 校验 household membership
  -> 数据写入/读取
  -> 前端展示成功、失败、空状态或权限错误
```

## 验证方式

- 本地启动命令：待 scaffold 后确认，预期为 `npm run dev`。
- 构建命令：待 scaffold 后确认，预期为 `npm run build`。
- 测试命令：待测试框架确认后写入。
- UI 验证：注册、登录、新增位置、新增物品、搜索、编辑、删除、退出。
- API/数据库验证：检查 Supabase 表数据。
- 权限负例：用户 B 不能读写用户 A 的 household 数据。
- Git checkpoint：第一阶段文档和代码分别小步提交。
