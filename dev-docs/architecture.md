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
  -> household_invitations
  -> household_join_requests
  -> areas
  -> locations
  -> items
```

每个用户注册后自动拥有一个默认家庭空间。2026-08-06 已确认将家庭成员共享纳入当前范围，`households` / `household_members` 直接承载共享，`household_invitations` 承载邀请链接，`household_join_requests` 承载加入申请；areas / locations / items 继续以 `household_id` 归属家庭，不需要因共享做数据迁移。

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
- `role`：`owner` / `member`；owner 管理家庭与成员，owner 与 member 对家庭内库存数据权限相同
- `created_at`

### household_invitations

- `id`
- `household_id`
- `token`：随机不可猜的分享令牌，URL-safe
- `created_by`：生成链接的 owner
- `created_at`
- `updated_at`
- `expires_at`：默认 30 天
- `revoked_at`：作废时间，为空表示有效

邀请链接不绑定具体成员：拿到链接的人都可以提交申请；链接有效期和作废状态决定能否申请。链接通过微信等外部渠道手动发送，不接入微信授权。

### household_join_requests

- `id`
- `household_id`
- `user_id`：申请人
- `status`：`pending` / `approved` / `rejected`
- `created_at`
- `decided_at`
- `decided_by`：审批人（owner）

每个账号对同一家庭最多一条 `pending` 申请；批准后由安全函数创建 `member` 成员关系。

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

- 用户只能读取自己是成员的 household 的数据。
- 用户只能写入自己是成员的 household 的 areas、locations、items。
- `owner` 与 `member` 对 household 内 areas、locations、items 的读写权限相同（RLS 均按成员关系判断）。
- 只有 `owner` 能邀请成员、移除成员、更新和删除 household。
- 成员关系只能通过注册初始化函数（owner）或房主批准申请（member）创建；不允许普通前端直接插入/修改 `household_members`。
- 申请必须通过有效邀请链接提交（安全函数校验 token），批准前不拥有任何家庭数据访问权；只有 owner 能批准或拒绝申请。
- 数据属于 household：成员被移除后立即失去访问权，数据保留在 household 内。
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

家庭成员邀请与加入流程：

```text
房主在家庭设置生成邀请链接（token，默认 30 天有效）
  -> 房主通过微信等渠道把链接发给对方
  -> 对方打开链接落地页：看到家庭名称、Android 内测 App 下载入口和“申请加入”按钮
  -> 未登录用户先注册/登录（登录后回到链接页）
  -> 调用 submit_household_join_request(token)
  -> 安全函数校验 token 有效且未作废
  -> 创建 household_join_requests（status = pending）
  -> 房主在家庭设置看到加入申请并批准
  -> 调用 approve_household_join_request
  -> 创建 household_members（role = member），申请状态改为 approved
  -> 成员刷新后在“当前家庭”切换器中看到并进入该家庭
```

链接落地页的 App 下载入口指向 Android 内测 APK 的服务器静态托管地址（部署配置项，不硬编码到业务代码）；每次 Android 构建后自动上传最新 APK 并更新版本信息，落地页与 App 通过版本信息检查最新版，安装由用户确认，不做静默安装。

成员移除流程：

```text
房主在成员列表选择移除成员
  -> 删除 household_members 中该成员的记录（RLS 仅允许 owner 且不能移除自己）
  -> 该成员下一次请求即被 RLS 拒绝访问家庭数据
  -> 家庭内 areas/locations/items 数据保持不变
```

## 2026-08-06 家庭成员共享架构决策

- 邀请方式：房主生成分享链接（token，默认 30 天有效，可作废/重新生成，同一家庭同一时间一个有效链接），通过微信等外部渠道手动发送；对方打开链接注册/登录后提交加入申请，房主批准后成为成员。第一版不发真实邮件，不接入微信授权或微信开放平台。
- 链接落地页：展示家庭名称、“申请加入”按钮和 Android 内测版 App 下载入口；下载地址为部署配置项。
- 权限：`owner` / `member` 对库存数据权限相同；仅 `owner` 可管理成员和家庭；不做角色变更、不做房主转让。
- 数据归属：数据属于 household；成员被移除后数据保留、访问立即失效。
- 家庭形态：一个账号可属于多个家庭，UI 提供“当前家庭”切换器；所有清单请求基于当前家庭，服务端仍从 session 推导用户和家庭，不接受客户端伪造可信 `householdId`。
- 家庭切换器的“当前家庭”选择只是前端状态；真正可访问哪些家庭由 RLS 依据 membership 决定，前端不能靠切换器越权读取其他家庭。
- 现有 areas/locations/items 的 member-only RLS 天然支持共享，无需改动；需要新增的是 `household_invitations`（邀请链接）、`household_join_requests`（加入申请）、成员管理 RLS 以及提交申请/批准申请的安全函数。
- 实施路线（2026-08-06 用户确认）：直接在自托管部署（`homestorag.xyz`，自有 PostgreSQL + 自有认证 + 服务端权限校验）上实现并上线；Supabase/RLS 方案仅作为历史设计参考，不以 Supabase 为实施目标。自托管路线的权限由服务端校验兜底（等价于 RLS 设计），数据库表结构与 Supabase 版保持一致。
- 家庭共享先做 Web/PWA；Android 内测版提供房主邀请分享与申请审批能力（App 内生成邀请链接并通过系统分享/复制发给家人，家人申请后房主在 App 内批准/拒绝），成员管理等仍以 Web 端为主；Android 仍按当前 session 推导的 household 读取数据。

## 验证方式

- 本地启动命令：待 scaffold 后确认，预期为 `npm run dev`。
- 构建命令：待 scaffold 后确认，预期为 `npm run build`。
- 测试命令：待测试框架确认后写入。
- UI 验证：注册、登录、新增位置、新增物品、搜索、编辑、删除、退出。
- API/数据库验证：检查 Supabase 表数据。
- 权限负例：用户 B 不能读写用户 A 的 household 数据。
- 家庭共享负例：未提交申请或被拒绝的账号不能读写家庭数据；被移除成员立即失去访问；member 不能邀请/移除成员或改角色。
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
- 家庭成员共享先做 Web/PWA（2026-08-06 确认）；Android 内测版包含房主邀请分享与申请审批能力（App 内生成邀请链接并分享/复制，App 内批准/拒绝加入申请），成员管理等以 Web 端为主，服务端权限模型保持兼容，Android 仍按当前 session 推导的 household 读取数据。
