# Family Sharing Implementation Plan

> **状态：设计已确认，尚未实施。** 本文档是家庭成员共享的第一阶段实施计划。没有用户对本计划确认前，不编写 migration、不修改 RLS、不写功能代码。
>
> **For agentic workers:** REQUIRED SUB-SKILL: 实施时使用 `subagent-driven-development` 或 `executing-plans`，按步骤执行并逐项打勾；涉及数据库和权限的步骤必须先通过负例验证再声明完成。

## 阶段目标

让房主可以通过分享链接邀请家人加入自己的家庭空间：

```text
房主在家庭设置生成邀请链接
  -> 房主通过微信等渠道把链接发给对方
  -> 对方打开链接落地页：看到家庭名称、Android 内测 App 下载入口和“申请加入”按钮
  -> 未注册用户先注册/登录，登录后回到链接页
  -> 对方提交加入申请（pending）
  -> 房主在家庭设置批准申请
  -> 对方成为该家庭 member，可查看/新增/编辑/删除家庭区域、位置、物品
  -> 房主可以移除成员，被移除成员立即失去访问权
  -> 一个账号可属于多个家庭，UI 提供“当前家庭”切换器
```

本阶段完成后，同一家庭的多个账号可以共同维护一份家庭物品清单；未提交申请、申请被拒绝或被移除的账号无法访问该家庭数据。权限由 RLS 兜底，前端按钮只是体验层。

## 源真源

- `dev-docs/project-brief.md`（2026-08-06 家庭成员共享决策）
- `dev-docs/architecture.md`（2026-08-06 家庭成员共享架构决策）
- `dev-docs/database-design.md`（邀请链接表、申请表、安全函数、RLS、负例设计）
- `dev-docs/acceptance.md`（家庭成员共享验收路径与验收门槛）
- `supabase/migrations/202607020001_initial_schema.sql`（现有 schema 基线）

## 当前状态

- 2026-08-06 用户确认将家庭成员共享纳入当前范围，邀请方式为“微信链接 + 对方自主申请 + 房主批准”，链接落地页含 Android 内测 APK 下载入口。
- 产品、架构、数据库、验收真源已更新；本实施计划已建立。
- 2026-08-06 已进入实施：`supabase/migrations/202608060001_family_sharing.sql` 已编写；家庭数据层 `src/features/family/`、链接落地页 `/join/<token>`、家庭设置面板和当前家庭切换器代码已实现并通过本地测试/lint/build。
- Android 内测版本阶段不实现共享 UI，服务端权限模型保持兼容；APK 下载地址为部署配置项。

## 实施状态（2026-08-06）

已完成（本地验证通过）：

- migration 文件：`household_invitations` / `household_join_requests` / 六个安全函数 / RLS 策略，与 `database-design.md` 一致。
- 家庭数据层：`src/features/family/family-data.ts`（token、有效期、链接状态、校验）和 `family-actions.ts`（生成/作废链接、申请、批准/拒绝、成员管理、家庭列表）。
- 链接落地页：`/join/<token>`，含登录/注册、申请加入、Android APK 下载入口（`NEXT_PUBLIC_APK_DOWNLOAD_URL`）。
- 家庭设置面板 `FamilySettings.tsx` 与当前家庭切换器已接入 `/app`（Supabase 测试路线）。
- 验证：`npm test` 36 个测试文件 / 252 通过；`npm run lint` 通过；`npm run build` 通过并生成 `/join/[token]` 路由。

未完成（需要用户或后续阶段）：

- 在真实 Supabase 项目执行 migration。
- 家庭共享权限负例（未申请不可访问、批准后可读写、member 不能管理、移除立即失效、无效 token 不能申请、非 owner 不能批准）。
- 真实浏览器验收陪跑（房主生成链接 → 家人申请 → 批准 → 共同编辑 → 移除成员）。
- 自托管（中国大陆正式版）路线的同步实现：API routes + 服务端权限 + `mainland_initial_schema.sql` 对应表与函数。
- Android APK 服务器托管、构建后自动上传和版本检查更新。

## 范围

本阶段要做：

- 新建 `household_invitations`（邀请链接：token、有效期、作废时间）。
- 新建 `household_join_requests`（加入申请：pending / approved / rejected）。
- `household_members` 新增 owner 删除成员的 RLS（不能删除自己）；member 插入只走批准申请的安全函数。
- 新增安全函数：`get_household_for_invitation(token)`、`submit_household_join_request(token)`、`approve_household_join_request(request_id)`、`reject_household_join_request(request_id)`、`list_household_members(household_id)`、`list_household_join_requests(household_id)`。
- 房主家庭设置：生成/复制/作废邀请链接、查看加入申请并批准或拒绝、成员列表、移除成员。
- 链接落地页：展示家庭名称、“申请加入”按钮、Android 内测 APK 下载入口；APK 由服务器静态托管，每次 Android 构建后自动上传最新版并更新版本信息，落地页与 App 检查版本提示更新；未登录先注册/登录后回到链接页。
- 当前家庭切换器：登录后返回该账号的全部 household，UI 选择当前家庭，清单读写基于当前家庭。
- 家庭共享权限负例验证（数据库 + 真实浏览器）。

本阶段明确不做：

- 真实邮件/短信通知（链接由房主手动通过微信等渠道发送）。
- 微信授权登录、微信开放平台、公众号/小程序集成。
- 房主转让、成员自助退出。
- 成员角色变更（owner/member 固定，member 不能自提权）。
- 多家庭数据合并或迁移。
- Android 家庭共享 UI（仅链接落地页提供 APK 下载入口）。
- 照片、扫码、支付、AI 识别等范围外能力。

## 数据与权限设计摘要

完整设计见 `dev-docs/database-design.md`，实施必须与其一致：

- `household_invitations(id, household_id, token, created_by, created_at, updated_at, expires_at, revoked_at)`；token 唯一、随机不可猜；有效链接 = `revoked_at is null and expires_at > now()`。
- 部分唯一索引保证同一家庭同一时间只有一个未作废链接；生成新链接前先作废旧链接。
- `household_join_requests(id, household_id, user_id, status, created_at, decided_at, decided_by)`；同一账号对同一家庭最多一条 pending 申请。
- `household_invitations` RLS：仅 owner 可 select/insert/delete；申请人只能通过安全函数使用 token。
- `household_join_requests` RLS：owner 看自己家庭的申请，申请人看自己的申请；不开放普通 insert/update/delete。
- 六个安全函数：查家庭、提交申请、批准（创建 member）、拒绝、成员列表、申请列表；调用方不能指定目标家庭。
- areas / locations / items 现有 member-only 策略无需改动，天然支持共享。
- 链接落地页的 APK 下载地址通过部署配置项注入（如 `NEXT_PUBLIC_APK_DOWNLOAD_URL`），不硬编码。

## 功能开工评估

| 项目 | 判断 |
| --- | --- |
| 目标用户 | 希望和家人共同维护家庭物品清单的已登录用户 |
| 用户动作 | 房主生成并分享链接、批准申请、移除成员；家人打开链接、注册/登录、申请加入 |
| 可见结果 | 家庭设置可管理链接与申请；链接落地页可下载 App 并申请；批准后共享家庭数据可共同读写 |
| 风险等级 | 高风险：涉及权限、RLS、数据库 schema，必须先设计后实施，负例必验 |
| 当前 owner | `dev-docs/database-design.md` 负责 schema/RLS；`src/features/inventory/` 与新增家庭特性层负责 UI 和写入 |
| 推荐插入路线 | 新增 migration + 新增链接落地页路由（如 `/join/<token>`）+ 复用现有清单读写路径 + 当前家庭切换 |
| 拒绝路线 | 不绕过 RLS；不接受客户端传入可信 `householdId`；不把 token 暴露给非 owner；不引入真实邮件或微信授权；不做成员自提权 |

## 子阶段拆分

| 子阶段 | 目标 | 主要文件 | 完成标准 | 验证方式 |
| --- | --- | --- | --- | --- |
| 1. 家庭共享 migration | 新建邀请链接表、申请表、四个安全函数、成员管理 RLS | `supabase/migrations/202608060001_family_sharing.sql` | 与 `database-design.md` 一致；Supabase 执行成功 | migration diff + Supabase SQL Editor |
| 2. 房主邀请与申请管理 | 家庭设置：生成/复制/作废链接、查看申请、批准/拒绝、移除成员 | `src/features/family/` 新增文件、`src/app/app/page.tsx` | owner 可完成全流程；member 看不到管理入口且数据库拒绝 | 浏览器 + RLS 负例 |
| 3. 链接落地页 | `/join/<token>`：展示家庭名称、App 下载、申请加入；未登录先注册/登录 | 新增 `src/app/join/[token]/page.tsx`、登录回跳 | 有效链接可申请；无效/过期链接明确提示；App 下载入口可用 | 浏览器 A/B 验证 |
| 4. 当前家庭切换 | 登录后列出全部 household，切换当前家庭 | `household-bootstrap.ts`、`AppDashboard.tsx`、dashboard 数据读取 | 切换家庭只影响当前操作上下文；不越权 | 浏览器 A/B 家庭切换验证 |
| 5. 家庭共享权限负例 | 数据库级负例验证 | Supabase 项目、`dev-docs/acceptance.md` | 未申请/被拒绝不可访问、批准后可读写、member 不能管理、移除立即失效、无效 token 不能申请、非 owner 不能批准 | 记录负例结果 |
| 6. 浏览器验收陪跑与收口 | 真实用户路径走通并写回证据 | `dev-docs/acceptance.md`、Git | 房主生成链接 → 家人申请 → 批准 → 共同编辑 → 移除成员全流程通过 | `npm test`、`npm run lint`、`npm run build`、浏览器截图 |

## 子阶段执行清单

状态说明：`[ ]` 表示未实施。实施时按顺序执行并打勾，禁止把未验证项标记为已完成。

### 子阶段 1：家庭共享 migration

- [ ] 新建 `household_invitations` 表，字段与 `database-design.md` 一致。
- [ ] 新建 `household_join_requests` 表，字段与 `database-design.md` 一致。
- [ ] token 唯一约束、有效链接部分唯一索引、pending 申请部分唯一索引。
- [ ] 为两张表启用 RLS 并创建 owner/applicant 策略。
- [ ] 为 `household_members` 新增 owner 删除成员策略（不能删除自己）。
- [ ] 新增 `get_household_for_invitation` / `submit_household_join_request` / `approve_household_join_request` / `reject_household_join_request` 并 grant。
- [ ] migration 在真实 Supabase 项目执行成功。

### 子阶段 2：房主邀请与申请管理

- [ ] 家庭设置展示成员列表（仅成员可见，owner 可管理）。
- [ ] owner 生成邀请链接并复制；同一家庭同一时间只有一个有效链接。
- [ ] owner 可作废链接并重新生成；过期链接明确显示状态。
- [ ] owner 看到 pending 申请列表，可批准或拒绝。
- [ ] owner 可移除成员；被移除成员立即失去访问。
- [ ] member 不显示管理入口，且 RLS 拒绝其管理操作。

### 子阶段 3：链接落地页

- [ ] `/join/<token>` 显示家庭名称、“申请加入”按钮和 Android 内测 APK 下载入口。
- [ ] 未登录用户点击申请时先注册/登录，登录后回到链接页。
- [ ] 有效 token 提交申请成功；已有 pending 申请时给出明确提示。
- [ ] 无效/过期/已作废 token 显示明确错误，不泄露家庭信息。
- [ ] APK 下载地址来自部署配置项，不在代码中硬编码。
- [ ] APK 托管与版本信息（如 `apk/version.json`）已部署；每次构建后自动上传，下载入口可下载最新版。

### 子阶段 4：当前家庭切换

- [ ] 登录后返回该账号全部 household 列表。
- [ ] UI 提供当前家庭切换器；默认选中默认家庭。
- [ ] 区域/位置/物品读写全部基于当前家庭。
- [ ] 切换家庭不改变其他家庭数据，不越权读取。

### 子阶段 5：家庭共享权限负例

- [ ] 未提交申请或被拒绝的账号读写共享家庭返回 0 行或权限错误。
- [ ] 申请批准后成员可读写；批准前不能。
- [ ] 无效/过期/已作废 token 调用 `submit_household_join_request` 失败且无副作用。
- [ ] 非 owner 调用批准/拒绝函数失败。
- [ ] member 插入邀请/成员关系失败；删除其他成员失败。
- [ ] owner 删除自己的成员关系失败。
- [ ] 被移除成员再次读取返回 0 行，家庭数据保留。
- [ ] 同一家庭同一时间只能有一个有效链接；同一账号对同一家庭只能有一条 pending 申请。
- [ ] 非 owner 无法通过普通查询读取邀请 token。
- [ ] 结果写回 `dev-docs/acceptance.md`。

### 子阶段 6：浏览器验收陪跑与收口

- [ ] 房主生成链接 → 微信复制 → 家人打开 → 下载 App 入口可见 → 申请 → 房主批准 → 双方共同新增/编辑/删除物品 → 刷新后仍存在。
- [ ] 成员被移除后刷新，数据消失且家庭数据仍在房主侧保留。
- [ ] `npm test`、`npm run lint`、`npm run build` 通过。
- [ ] `.env.local` 与真实密钥未进入 Git。
- [ ] 验收证据写回 `dev-docs/acceptance.md`，创建 Git checkpoint。

## 可能触碰的文件

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| migration | `supabase/migrations/202608060001_family_sharing.sql` | 新建邀请链接表、申请表、安全函数、RLS |
| 链接落地页 | `src/app/join/[token]/page.tsx`（新增） | 家庭信息、申请加入、App 下载 |
| 家庭数据 | `src/features/inventory/household-bootstrap.ts` | 返回全部 household 与当前家庭 |
| 业务组件 | `src/features/inventory/AppDashboard.tsx` | 家庭设置入口、当前家庭切换器 |
| 家庭特性 | `src/features/family/`（新增） | 生成/作废链接、查看申请、批准/拒绝、移除成员 |
| 环境配置 | `.env.example` | 新增 `NEXT_PUBLIC_APK_DOWNLOAD_URL` 占位符 |
| 部署脚本 | 服务器 APK 上传脚本（新增） | 构建后自动上传最新 APK 并更新版本信息 |
| 测试 | 对应 `*.test.ts` | 链接、申请、切换、权限行为测试 |
| 验收文档 | `dev-docs/acceptance.md` | 负例与浏览器证据写回 |

如果实施中发现需要修改 `database-design.md` 未覆盖的字段、策略或函数，必须先停止并更新真源。

## 安全、权限和数据要求

- 所有读写必须经过当前登录用户 session；服务端从 session 推导用户和 household，不接受客户端传入可信 `householdId`。
- 邀请 token 是敏感凭证：只有 owner 能在家庭设置中查看链接；申请人只能通过安全函数使用 token。
- member 关系只能由注册初始化（owner）或 `approve_household_join_request`（member）创建，禁止普通前端直接 insert/update。
- 未提交申请、申请被拒绝或被移除的账号不能读取家庭数据，不能只靠前端隐藏按钮。
- 不发送真实邮件、不接入微信授权；不保存密码、service role key 或真实用户数据到仓库。
- APK 下载地址是部署配置项；第一版不上架应用商店。
- 不允许用 mock 数据冒充已接入共享功能。

## 验收路径

见 `dev-docs/acceptance.md` 的“家庭成员共享验收路径”。数据库负例见 `dev-docs/database-design.md` 的“验收负例”。

## 停止条件

- 家庭共享 migration 与 `database-design.md` 不一致时停止。
- 需要真实邮件服务、微信授权、房主转让、成员自退、角色变更或多家庭合并时停止并询问。
- 家庭共享 RLS 负例未通过前，不声明共享功能安全可用。
- 需要真实 service role key、数据库密码或生产用户数据时停止。
- Android 内测版本阶段发现必须实现共享 UI 才能验收时，先确认再扩大范围。

## 未验证项

- 家庭共享 migration 尚未编写和执行。
- 链接生成/申请提交/批准/拒绝/移除成员的真实 Supabase 负例未验证。
- 链接落地页（含 App 下载入口）与当前家庭切换器 UI 未实现。
- APK 服务器托管、构建后自动上传、落地页与 App 版本检查更新机制未实现和验证。
- 真实浏览器中房主生成链接、家人申请、批准、共同编辑、移除成员的验收陪跑未完成。

## 用户确认状态

已确认：

- 2026-08-06 用户确认将家庭成员共享纳入当前范围（Web/PWA 先行）。
- 2026-08-06 用户确认邀请方式：生成链接通过微信发给对方，对方自己申请加入，房主批准。
- 2026-08-06 用户确认链接落地页包含 Android App 下载地址。

需要用户确认：

- 本文档（实施计划）与 `database-design.md` 中的表结构、安全函数、RLS 和负例设计。
- 确认后进入子阶段 1（migration），再逐子阶段实施。
