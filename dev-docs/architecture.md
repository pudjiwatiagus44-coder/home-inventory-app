# Architecture Truth

## 推荐架构

- 推荐产品形态：Web/PWA first，后续再评估移动 App。
- MVP 技术路线：Next.js + TypeScript + Supabase Auth + Supabase Postgres + RLS + PWA。
- 中国大陆正式版目标路线：Next.js + TypeScript + 国内云 PostgreSQL + 自有认证/权限层 + PWA。
- 推荐部署形态：Vercel + Supabase 仅作为临时测试版；中国大陆正式版部署到国内云平台，部署路线真源见 `dev-docs/deployment-route.md`。
- 为什么路线要调整：本产品面向中国大陆用户时，访问稳定性、备案、数据存储和运维要求会成为核心约束。Supabase/Vercel 适合快速 MVP，但中国大陆正式版需要国内云资源、国内数据库、备案流程和可控的服务端权限层。

## 禁止路径

- 禁止把当前 Python + JSON 本地服务改造成多用户公开后端。
- 禁止在没有用户确认和真源更新时切换到 Firebase。
- 禁止在未完成中国大陆正式版迁移计划前直接替换 Supabase 或自建后端。
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

中国大陆正式版目标技术路线：

- 前端框架：继续使用 Next.js。
- 运行时：继续优先使用 Node.js / Next.js，避免引入第二套后端语言。
- 数据库：迁移到国内云 PostgreSQL。
- 登录：从 Supabase Auth 迁移为自有邮箱密码登录或国内可用认证服务。
- 权限：从 Supabase RLS 迁移为服务端权限校验 + 数据库约束的等效边界。
- 部署：国内云服务器或国内云应用托管。

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
| 中国大陆正式版认证 | 待新增的服务端认证层 + `dev-docs/technical-selection.md` | Supabase Auth、前端 localStorage、聊天记忆 | 登录正负例、session 过期、密码存储验证 |
| 中国大陆正式版数据库 | 国内云 PostgreSQL + migration | Supabase 控制台手工状态、前端本地状态 | migration、备份恢复、跨用户负例 |
| 中国大陆正式版部署 | `dev-docs/deployment-route.md` + 国内云平台配置 | Vercel preview、个人电脑进程 | ICP 备案、生产域名、HTTPS、日志和访问测试 |

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

## 2026-08-04 Excel 批量备份与导入架构

- Excel 解析、备份文件生成、导入预检和冲突数据结构由前端特性层 `src/features/inventory/excel-backup.ts` 拥有。
- 导入提交必须通过登录态 API route 和 `createInventoryService` 执行，服务端根据当前 session 解析用户和 household，不接受客户端传入 `householdId`。
- 导入预检以当前用户 dashboard 数据作为对比基准，不查询或暴露其他用户数据。
- 提交导入时允许的动作只有 `create`、`keep`、`overwrite`、`skip`：`create` 新增物品并按需创建区域/位置；`keep` 保留差异重复项为一条新物品；`overwrite` 只更新已有物品备注和有效期；`skip` 不写入。
- API route 文件只能导出 Next.js 允许的 HTTP 方法和 route 配置，不导出业务常量。

## 2026-08-04 Android 原生内测版架构

- Android 原生内测版作为新增移动端客户端，不替代现有 Web/PWA，也不改变服务端作为权限边界的 owner。
- Android 技术路线：Kotlin + Jetpack Compose + MVVM。
- Android 本地缓存：Room，至少包含 `areas`、`locations`、`items`、`pending_operations`、`sync_state`。
- Android 安全存储：session/token 使用 Android Keystore 或 EncryptedSharedPreferences；禁止保存明文密码、数据库密码、服务端密钥或真实云密钥。
- Android 网络层：通过 HTTPS 调用现有 Next.js 认证和库存 API；客户端不得直连 PostgreSQL。
- 服务端仍根据当前 session 推导 user 和 household；Android 请求不得提交或伪造可信 `householdId`。
- 同步版本依据第一版优先使用服务器返回的 `updatedAt`。更新和删除请求携带客户端操作时看到的基础 `serverUpdatedAt`，服务端发现记录已变化时返回冲突，不允许客户端覆盖较新的服务器数据。
- 离线新增使用本地临时 id 和 `pending_create` 状态；网络恢复后 Android 自动提交，成功后替换为服务器 id 与最新 `updatedAt`。
- 离线编辑和删除进入 `pending_operations` 队列；恢复网络后按队列提交，冲突时服务器状态优先，客户端展示需用户重新确认的状态。
- 第一版同步触发点：登录后、App 启动、手动刷新/同步、网络恢复、在线写入成功后。不做后台长时间同步、推送实时同步或复杂合并 UI。
