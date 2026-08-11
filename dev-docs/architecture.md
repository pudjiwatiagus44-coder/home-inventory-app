# Architecture Truth

## 推荐架构

- 推荐产品形态：Web/PWA first，后续再评估移动 App。
- 当前技术路线：Next.js + TypeScript + 阿里云自托管 + 自有 PostgreSQL + 自有认证/服务端权限层 + PWA + Android 内测 APK。
- 推荐部署形态：阿里云 `homestorag.xyz` 自托管，部署路线真源见 `dev-docs/deployment-route.md`。
- Supabase 状态：已于 2026-08-11 归档，不再作为实施、测试、部署、调试、权限验证或代码定位目标。

## 禁止路径

- 禁止把当前 Python + JSON 本地服务改造成多用户公开后端。
- 禁止在没有用户确认和真源更新时切换到 Firebase。
- 禁止重新启用 Supabase 作为当前实现路线，除非用户明确要求并先更新真源。
- 禁止原生 App 先行。
- 禁止把用户数据表或数据库连接直接暴露给前端。
- 禁止把数据库密码、session secret、SMTP 授权码、AI key 暴露给浏览器或提交到 Git。
- 禁止 mock 数据冒充真实功能。

## 技术路线

- 前端框架：Next.js。
- 语言：TypeScript。
- PWA：manifest + service worker 或框架推荐 PWA 插件，进入实现前再定具体方式。
- UI 基础：shadcn/ui + Tailwind CSS + 项目自己的 design tokens。
- 设计系统 owner：前端项目内的 token、基础组件和后续 `dev-docs/frontend-design.md`。
- 后端能力：Next.js API routes + service/repository 分层，服务端根据 session 做权限校验。
- 数据库：自有 PostgreSQL。
- 迁移方式：SQL migration 文件，不在控制台手改后忘记回写。
- 第三方 SDK/API：当前不使用 Supabase；已确认外部服务按功能范围接入 QQ SMTP、火山引擎豆包等。
- 技术选择真源：`dev-docs/technical-selection.md`。

当前自托管技术路线：

- 前端框架：继续使用 Next.js。
- 运行时：继续优先使用 Node.js / Next.js，避免引入第二套后端语言。
- 数据库：阿里云服务器上的 PostgreSQL。
- 登录：自有邮箱密码登录。
- 权限：服务端权限校验 + 数据库约束。
- 部署：阿里云轻量应用服务器 + Nginx/systemd + HTTPS。

## Owner Map

| 概念 | Owner | 不能由谁拥有 | 验证方式 |
| --- | --- | --- | --- |
| 产品边界 | `dev-docs/project-brief.md` | 临时代码、聊天记忆 | 文档审阅 |
| 技术路线 | `dev-docs/technical-selection.md` | 单个组件或随手依赖 | 文档审阅 + package 检查 |
| 前端路由 | Next.js app route | 数据库 | 本地页面访问 |
| 设计 token | `src/styles/globals.css` 和基础组件 | 零散页面内联样式 | 截图和 CSS 检查 |
| 业务组件 | `src/components/inventory/` | 数据库触发器 | UI 行为验证 |
| API 合同 | Next.js API route + service contract | UI 文案 | API/数据库验证 |
| 业务逻辑 | 前端 use case + 服务端权限 + 数据库约束 | 纯 UI 显示层 | 正负路径测试 |
| 数据库 schema | `dev-docs/sql/` SQL + repository contract | 前端本地状态 | migration diff |
| 登录/权限 | 自有认证 + 服务端权限校验 | 前端隐藏按钮 | 用户 A/B、家庭 A/B 权限负例 |
| 第三方接入 | 服务端封装层 | 任意页面随手初始化 | 环境变量和调用检查 |
| 部署/配置 | `dev-docs/deployment-route.md` + `.env.example` + 阿里云服务器配置 | 硬编码密钥、聊天记忆、个人电脑进程 | 构建、环境变量、HTTPS 和生产 URL 验收 |
| 认证 | 服务端认证层 + `dev-docs/technical-selection.md` | 前端 localStorage、聊天记忆 | 登录正负例、session 过期、密码存储验证 |
| 数据库 | 自有 PostgreSQL + migration | 控制台手工状态、前端本地状态 | migration、备份恢复、跨用户负例 |
| 部署 | `dev-docs/deployment-route.md` + 阿里云配置 | 个人电脑进程 | ICP 备案、生产域名、HTTPS、日志和访问测试 |

## 初始数据模型草案

```text
users
  -> profiles
  -> households
  -> household_members
  -> household_invitations
  -> household_join_requests
  -> areas
  -> locations
  -> items
  -> pending_photos（2026-08-07：拍照识别缩略图暂存）
```

每个用户注册后自动拥有一个默认家庭空间。2026-08-06 已确认将家庭成员共享纳入当前范围，`households` / `household_members` 直接承载共享，`household_invitations` 承载邀请链接，`household_join_requests` 承载加入申请；areas / locations / items 继续以 `household_id` 归属家庭，不需要因共享做数据迁移。

### profiles

- `id` references `users.id`
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
- `photo_key`（2026-08-07 新增：物品缩略图文件名，可空、唯一）
- `created_by`
- `created_at`
- `updated_at`

## 权限边界

- 用户只能读取自己是成员的 household 的数据。
- 用户只能写入自己是成员的 household 的 areas、locations、items。
- `owner` 与 `member` 对 household 内 areas、locations、items 的读写权限相同，由服务端按成员关系判断。
- 只有 `owner` 能邀请成员、移除成员、更新和删除 household。
- 成员关系只能通过注册初始化函数（owner）或房主批准申请（member）创建；不允许普通前端直接插入/修改 `household_members`。
- 申请必须通过有效邀请链接提交（安全函数校验 token），批准前不拥有任何家庭数据访问权；只有 owner 能批准或拒绝申请。
- 数据属于 household：成员被移除后立即失去访问权，数据保留在 household 内。
- 第一版没有管理员读取用户数据的功能。
- 前端可以显示或隐藏按钮，但真正权限必须由服务端校验保证。
- 用户数据表不得直接暴露给前端。
- 数据库密码和服务端密钥只能在服务器环境变量或运维脚本中使用，不能暴露给浏览器。

## 请求生命周期

```text
用户操作
  -> Next.js 页面/组件
  -> 前端表单校验
  -> Next.js API route
  -> 服务端 session 识别用户
  -> service 层校验 household membership
  -> PostgreSQL repository 读写
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
  -> 删除 household_members 中该成员的记录（服务端仅允许 owner 且不能移除自己）
  -> 该成员下一次请求即被服务端拒绝访问家庭数据
  -> 家庭内 areas/locations/items 数据保持不变
```

## 2026-08-06 家庭成员共享架构决策

- 邀请方式：房主生成分享链接（token，默认 30 天有效，可作废/重新生成，同一家庭同一时间一个有效链接），通过微信等外部渠道手动发送；对方打开链接注册/登录后提交加入申请，房主批准后成为成员。第一版不发真实邮件，不接入微信授权或微信开放平台。
- 链接落地页：展示家庭名称、“申请加入”按钮和 Android 内测版 App 下载入口；下载地址为部署配置项。
- 权限：`owner` / `member` 对库存数据权限相同；仅 `owner` 可管理成员和家庭；不做角色变更、不做房主转让。
- 数据归属：数据属于 household；成员被移除后数据保留、访问立即失效。
- 家庭形态：一个账号可属于多个家庭，UI 提供“当前家庭”切换器；所有清单请求基于当前家庭，服务端仍从 session 推导用户和家庭，不接受客户端伪造可信 `householdId`。
- 家庭切换器的“当前家庭”选择只是客户端状态；真正可访问哪些家庭由服务端依据 membership 决定，前端不能靠切换器越权读取其他家庭。
- 现有 areas/locations/items 共享权限由服务端 membership 校验兜底；需要维护的是 `household_invitations`（邀请链接）、`household_join_requests`（加入申请）和成员管理服务端接口。
- 实施路线（2026-08-06 用户确认，2026-08-11 收口）：直接在自托管部署（`homestorag.xyz`，自有 PostgreSQL + 自有认证 + 服务端权限校验）上实现并上线；Supabase/RLS 方案已归档，不以 Supabase 为实施目标。
- 家庭共享先做 Web/PWA；Android 内测版提供房主邀请分享与申请审批能力（App 内生成邀请链接并通过系统分享/复制发给家人，家人申请后房主在 App 内批准/拒绝），成员管理等仍以 Web 端为主；Android 0.5.23 起提供当前家庭切换：启动/登录时加载全部 household，点顶部家庭名称切换，snapshot 请求携带所选 householdId，服务端仍校验 membership；Android 0.5.24 计划改为家庭名旁小切换图标下拉切换，长按家庭名重命名。

## 验证方式

- 本地启动命令：待 scaffold 后确认，预期为 `npm run dev`。
- 构建命令：待 scaffold 后确认，预期为 `npm run build`。
- 测试命令：待测试框架确认后写入。
- UI 验证：注册、登录、新增位置、新增物品、搜索、编辑、删除、退出。
- API/数据库验证：检查自托管 PostgreSQL 表数据和服务端 API 响应。
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
- 服务端仍根据当前 session 推导 user，并按用户选择的 householdId 校验 membership 后读取 household；Android 可以携带“当前家庭”选择，但服务端必须校验该用户确实属于所选家庭，不得信任客户端伪造的 `householdId`。
- 同步版本依据第一版优先使用服务器返回的 `updatedAt`。更新和删除请求携带客户端操作时看到的基础 `serverUpdatedAt`，服务端发现记录已变化时返回冲突，不允许客户端覆盖较新的服务器数据。
- 离线新增使用本地临时 id 和 `pending_create` 状态；网络恢复后 Android 自动提交，成功后替换为服务器 id 与最新 `updatedAt`。
- 离线编辑和删除进入 `pending_operations` 队列；恢复网络后按队列提交，冲突时服务器状态优先，客户端展示需用户重新确认的状态。
- 第一版同步触发点：登录后、App 启动、手动刷新/同步、网络恢复、在线写入成功后。不做后台长时间同步、推送实时同步或复杂合并 UI。
- 家庭成员共享先做 Web/PWA（2026-08-06 确认）；Android 内测版包含房主邀请分享与申请审批能力（App 内生成邀请链接并分享/复制，App 内批准/拒绝加入申请），成员管理等以 Web 端为主，服务端权限模型保持兼容；Android 0.5.23 起包含当前家庭切换器，清单读取携带用户选择的 householdId。

## 2026-08-07 拍照识别物品架构（Android 内测版先行）

用户确认在 Android 内测版新增拍照识别物品能力，边界：服务器只保存缩略图、识别用清晰图存手机本地、豆包识别、Android 先行。详见设计文档 `docs/superpowers/specs/2026-08-07-photo-recognition-design.md`。

识别与保存链路（mode=name）：

```text
Android 拍物品正面照
  -> 本地压缩到约 1280px（200–400KB）
  -> POST /api/recognition（mode=name）
  -> 服务器校验登录与家庭
  -> 生成缩略图暂存（pending_photos）+ 调豆包识别名称
  -> 返回名称 + 缩略图暂存 id
  -> 用户确认表单
  -> 保存物品时带 photoKey -> items.photo_key 关联缩略图
  -> 物品列表展示缩略图
```

有效期识别链路（mode=expiry）：只调豆包读日期，不存图，识别结果回填过期日。

关键边界：

- 豆包 API key 只存服务器环境变量，App/前端不接触。
- 缩略图访问走登录态接口，服务端校验物品所属家庭成员身份；不允许公开静态访问。
- 未关联缩略图 24 小时后清理；识别接口按账号限频，防刷额度。
- 第一版缩略图存服务器本地磁盘，经存储抽象层访问，后续可切换 OSS。
- `items` 表新增 `photo_key` 列（可空、唯一）；新增 `pending_photos` 表；具体字段与服务端权限见 `dev-docs/database-design.md`。

## 2026-08-08 草稿箱与照片增强架构（Android 内测版）

用户确认的后续增强（2026-08-07 决策的延伸，先实施后回写真源）：

- 本地清晰图存储：识别/拍照用图（1280px 压缩图）由 App 保存到手机私有目录 `filesDir/photos/<photoKey>.jpg`（`LocalPhotoStore`），放大预览本地优先、缺失回退服务器缩略图；服务器不保存该清晰图，换设备/重装后不可恢复。缩略图仍按 2026-08-07 架构存服务器。
- 草稿箱（纯客户端）：Android Room 新增 `drafts` 表（`DraftEntity`/`DraftDao`，DB 版本 4）；草稿含本地清晰照片（`draft_<id>.jpg`）+ 识别后的 `photoKey` + 名称/备注/过期日/区域/位置；`DraftRepository` 实现 `DraftGateway`（创建/后台识别/删除/读图），识别在 ViewModel 后台协程执行（35 秒超时兜底，失败标记完成），App 前台恢复（ON_RESUME）与启动时自动补识别「识别中」或空名称草稿；确认保存时调既有 items 建档接口并删除草稿（保留 photoKey 本地大图），用户手动删除草稿才完整清理。
- 批量导入：`PickMultipleVisualMedia` 一次选多张 → 每张压缩 → 建草稿（预填当前区域/位置）→ 后台识别；进度经 `BatchImportUiState` 显示，完成后自动关闭新增面板。
- 区域/位置管理：区域条/位置条长按打开编辑弹窗（复用 `AreaFormDialog`/`LocationFormDialog`，区域重命名/改色/删除，位置重命名/重分配区域/删除）；新增位置默认带当前选中区域；新增物品默认预选当前选中（或最近使用）的区域/位置。
- 未分配筛选：`DashboardFilters.unassigned` 筛选 `locationId == null` 的物品；不选区域/位置可直接保存；切换未分配清空区域/位置筛选。
- 拍照与预览：物品无图「拍照」按钮直接调起系统相机（`ActivityResultContracts.TakePicture` + FileProvider）；图片预览 `PhotoPreviewDialog` 支持双击放大 4 倍、捏合至 6 倍、单指拖动，缩略图同样可放大。
- 成员权限分级（2026-08-08 用户确认）：`household_members.role` 新增 `readonly` 档位；`readonly` 成员对 areas/locations/items 只能读（含照片读取），新增/编辑/删除由服务端校验拒绝（在 `inventory-service` 写操作前按角色拦截）；`member` 保持全部权限；仅 `owner` 可管理成员（邀请/移除/改角色）。
- 邀请使用 App：邀请弹窗新增「邀请使用 App」入口，分享内测版 APK 下载链接；对方注册后为独立用户，与家庭邀请无关。
- App 内帮助：顶部「帮助」入口展示内置说明书（内容与 `dev-docs/user-manual.md` 同步，App 内以静态资源承载）。
- 实时刷新机制：Android 数据层采用 Room Flow → ViewModel StateFlow → Compose `collectAsState` 自动重组（新增/编辑/删除区域、位置、物品即时生效）；物品行缩略图缓存以 `(item.id, item.photoKey)` 为 key，照片新增/更换立即重载；主界面支持 Material3 下拉刷新（`PullToRefreshBox`，触发 sync + snapshot）。

## 2026-08-08 登录页增强与密码重置架构

- 密码重置请求生命周期：用户点「忘记密码」输入邮箱 → `POST /api/auth/forgot-password`（邮箱不存在也返回成功，防枚举；限频 5 次/小时/邮箱+IP）→ 生成 32 字节 base64url 令牌，HMAC-SHA256 哈希入库（`password_reset_tokens`，30 分钟过期、一次性、同用户单令牌）→ nodemailer 经 QQ SMTP 发送重置链接邮件 → 用户打开 `/reset-password?token=...` → `POST /api/auth/reset-password` 校验令牌 → bcrypt 重哈希更新 `users.password_hash` → 标记令牌已用 → 作废该用户全部 `auth_sessions` → 用户用新密码登录。
- 新增表：`password_reset_tokens`（表结构与权限见 `dev-docs/database-design.md`）；权限边界由服务端校验。
- 新增接口：`POST /api/auth/forgot-password`、`POST /api/auth/reset-password`；新增页面：`/forgot-password`、`/reset-password`。
- 记住邮箱：Web 用 localStorage（key `home_inventory_remembered_email`），Android 用 `RememberedEmailStore`（EncryptedSharedPreferences）；只存邮箱，不存密码；登录态保持逻辑不变。
- Android 注册入口：复用现有 `POST /api/auth/register` 与 session cookie 流程，注册成功即进入 App。
- 详细设计见 `docs/superpowers/specs/2026-08-08-auth-login-enhancements-design.md`，实施计划见 `docs/superpowers/plans/2026-08-08-auth-login-enhancements.md`。
