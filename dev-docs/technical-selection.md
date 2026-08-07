# Technical Selection

## 结论

当前 MVP 技术主线：`Next.js + TypeScript + Supabase + PWA`。

中国大陆正式版目标主线：`Next.js + TypeScript + 国内云 PostgreSQL + 自有认证/权限层 + PWA`。

MVP 路线已经由用户确认并完成基础实现。2026-07-05 用户进一步确认要直接面向中国大陆用户使用，因此正式版需要从 Supabase 托管路线迁移到中国大陆部署路线。除非用户明确批准并更新本文件，否则后续不得切换到 Firebase、原生 App 先行、纯 Vite 前端或本地 Python/JSON 后端。

## 已审计证据

- 用户确认第一版按推荐路线：Web/PWA、邮箱密码登录、单账号私有清单、不上传照片、Supabase 路线。
- `dev-docs/project-brief.md`：MVP 是注册登录后管理自己的家庭物品。
- `dev-docs/architecture.md`：数据模型围绕 users、households、areas、locations、items。
- `dev-docs/acceptance.md`：必须验证用户 A/B 数据隔离。
- 官方资料：
  - Supabase Auth: https://supabase.com/docs/guides/auth
  - Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
  - Supabase Next.js quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
  - Next.js docs: https://nextjs.org/docs
  - `dev-docs/deployment-route.md`：中国大陆正式版路线已确认，Vercel + Supabase 仅保留为临时测试版。

## 推荐产品形态

第一版做 Web/PWA，不做原生 iOS/Android。PWA 可以先满足手机桌面入口、响应式使用和快速迭代。等账号、数据、搜索和权限跑通后，再评估是否包装或重做移动端。

## 平台能力判断

| 需求 | 平台分类 | Web/PWA 能拥有 | 需要其他平台的部分 | 结论 |
| --- | --- | --- | --- | --- |
| 注册登录 | Browser web + managed auth | 登录页、session UI、错误提示 | Supabase Auth | Web/PWA 足够 |
| 私有物品清单 | Browser web + database | 表单、列表、搜索、状态 | Supabase Postgres + RLS | Web/PWA 足够 |
| 用户数据隔离 | Database security | UI 隐藏非授权入口 | RLS 必须兜底 | 必须用 RLS 验证 |
| PWA 安装体验 | Browser web | manifest、service worker、响应式 UI | 无 | 第一版可做 |
| 照片、扫码、推送 | Mobile/native or browser APIs | 第一版不做 | 后续再评估 | 非 MVP |

## 前端选择

选择：Next.js + TypeScript。

理由：

- Next.js 约定清晰，适合 AI 协助维护。
- TypeScript 能约束数据对象，减少字段漂移。
- Supabase 官方提供 Next.js quickstart 和 SSR/Auth 相关资料。
- 未来如果需要登录回调、导入任务、服务端校验、支付 webhook 或通知任务，Next.js 比纯静态前端更有余量。

不选 Vite React 作为主线：

- Vite 更轻，但它更适合纯前端应用。
- 本项目后续很可能需要服务端边界，如邀请链接、导入、支付或通知。
- 选择 Next.js 可以减少后续补后端的概率。

## UI 和设计系统选择

选择：shadcn/ui + Tailwind CSS + 项目自己的 design tokens。

规则：

- shadcn/ui 是组件基础，不是最终设计真源。
- Tailwind 是实现工具，不是设计系统。
- 颜色、间距、圆角、字体、状态、布局密度必须由项目 token 和基础组件治理。
- 禁止每个页面随手发明一套视觉风格。
- 工具型 SaaS 界面应保持清爽、紧凑、易扫描，避免营销页式大卡片堆叠。

预期 owner：

- `src/styles/globals.css`：全局 token 和主题入口。
- `src/components/ui/`：基础 UI 组件。
- `src/components/inventory/`：物品、位置、搜索等业务组件。
- `dev-docs/frontend-design.md`：进入前端设计阶段时补充。

## 后端和数据选择

MVP 选择：Supabase Auth + Supabase Postgres + Row Level Security。

理由：

- Supabase Auth 支持邮箱密码等认证方式。
- Supabase Auth 可以和数据库 RLS 结合，让用户 token 参与数据库行级访问控制。
- 本项目数据关系清晰，Postgres 比文档数据库更自然。
- 第一版可以不自建完整后端，降低维护成本。

RLS 是安全硬边界：

- public schema 中暴露给前端访问的用户数据表必须启用 RLS。
- 没有 RLS 策略和用户 A/B 负例验证前，不能声明 MVP 安全可用。
- service role key 不能出现在浏览器代码、公开仓库或 `.env.example` 的真实值里。

中国大陆正式版选择：国内云 PostgreSQL + 自有认证/权限层。

原因：

- Supabase 托管版没有中国大陆正式部署区域，不适合作为面向中国大陆用户的长期生产后端。
- 当前应用的大部分业务数据模型可以迁移到标准 PostgreSQL。
- 自有认证/权限层需要重新实现“邮箱 + 密码登录、session、用户只能访问自己数据”的规则。
- Supabase RLS 的安全思想要保留，但正式版不能假设 Supabase RLS 继续存在。

## 数据库选择

MVP 选择：Supabase Postgres。

中国大陆正式版选择：国内云 PostgreSQL。

第一版核心表：

- `profiles`
- `households`
- `household_members`
- `household_invitations`
- `areas`
- `locations`
- `items`

2026-08-06 已确认将家庭成员共享纳入当前范围：`households` / `household_members` 承载共享，`household_invitations` 承载邀请链接，`household_join_requests` 承载加入申请；areas/locations/items 继续按 `household_id` 归属，不需要更换数据库。

## 运行时和部署边界

主运行时：Node.js / Next.js。

托管建议：

- 临时测试版前端：Vercel 免费层。
- 临时测试版数据和认证：Supabase 免费层继续承载 Auth、Postgres 和 RLS。
- 中国大陆正式版前端/后端：国内云服务器或国内云应用托管。
- 中国大陆正式版数据和认证：国内云 PostgreSQL + 自有认证/权限层。
- 本地开发：`npm install`、`npm run dev`、`.env.local`。

部署路线真源：`dev-docs/deployment-route.md`。

初始在线测试目标是让用户在电脑关机、换网络、不在同一路由器下仍可登录使用。中国大陆正式版目标是让中国大陆用户稳定访问，因此需要新的部署和后端迁移阶段。

仍优先保持单一 Node.js / Next.js 运行时。中国大陆正式版需要增加服务端认证、数据库访问和权限校验，但不默认引入 Python、Go、Java 或第二套后端运行时。

## 备选路线取舍

### Firebase

可行，但不作为主线。它适合实时同步和移动生态，但本项目的用户、家庭、区域、位置、物品关系更适合 Postgres。Firestore 权限规则也能做隔离，但关系型查询和未来导出统计不如 Postgres 顺手。

### Vite React + Supabase

可行，但不作为主线。它更轻，但缺少 Next.js 的服务端余量。考虑未来可能出现导入、邀请、通知、支付 webhook，Next.js 更稳。

### 自建后端 + PostgreSQL

中国大陆正式版选择该方向，但实现必须分阶段推进。原因是正式版需要国内云部署、ICP备案、数据库备份、日志监控和不依赖 Supabase 的认证权限层。不能在未完成迁移设计前直接替换当前 Supabase 路线。

### 原生 App 先行

暂不选择。手机体验更好，但上架、证书、审核、适配和调试链路都会拖慢 MVP。第一阶段先用 Web/PWA 验证核心价值。

### Python + JSON 本地服务

不作为新产品后端。它适合当前个人局域网原型，不适合多用户账号、公开推广和长期云端数据隔离。

## 风险和复评触发器

需要重新评估技术路线的情况：

- 第一版必须加入原生扫码、后台推送或离线强能力。
- Supabase 成本、区域、合规或可用性不能满足目标用户。
- 需要复杂服务端任务、队列、定时任务或高级审计，Next.js + Supabase 无法清晰承载。
- 需要团队协作开发且现有结构无法维护。

## 下一步

下一步先写中国大陆正式版迁移实施计划，覆盖云平台选择、域名备案、国内数据库、自有认证、权限校验、数据迁移、部署脚本、备份恢复和发布验收。不要在该计划确认前直接改认证或数据库代码。

## 2026-08-04 Android 原生内测版例外

用户已明确批准在现有 Web/PWA 和中国大陆后端路线之外，新增 Android 原生内测版作为移动端产品线。该例外的边界如下：

- 先做 Android 内测 APK，后续再单独规划 iOS。
- Android 使用 Kotlin 原生实现，推荐 Jetpack Compose + MVVM + Room。
- Android 必须复用现有邮箱 + 密码账号、Next.js 后端 API、session 和服务端权限边界。
- Android 不直连 PostgreSQL，不保存数据库密码、service role key、私钥或真实云密钥。
- Android 第一阶段包含离线缓存和离线编辑；离线新增在网络恢复后自动同步。
- 离线编辑和删除的冲突策略为服务器优先：不自动覆盖服务器较新数据。
- 本例外不包含应用商店上架、正式签名发布、推送通知、高清原图照片上传、扫码识别、支付或 iOS 实现。
- 2026-08-07 用户批准在 Android 内测版范围内新增拍照识别（仅保存物品缩略图、原图识别后即弃、豆包识别），详见 `docs/superpowers/specs/2026-08-07-photo-recognition-design.md`。
- 家庭成员共享先做 Web/PWA（2026-08-06 确认）；Android 内测版提供房主邀请分享（生成链接 + 系统分享/复制），申请与审批以 Web 端为主，服务端权限模型保持兼容。

## 2026-08-07 拍照识别第三方 AI 服务决策

- 用户确认 Android 内测版拍照识别使用火山引擎豆包视觉（Doubao Vision）。不选用 OpenAI 等国际模型（大陆访问稳定性、数据出境与成本均不占优），不选用通义千问（用户选择，另行维护火山引擎接入）。
- API key 只存服务器环境变量（自托管路线），App/前端永不接触；识别请求由服务器转发，App 不得直连豆包。
- 成本估算：图片压缩到约 1280px 后，单次识别输入约 1000–3000 token、输出数百 token，单价约 0.005–0.02 元/次（视觉模型输入约 0.8–3 元/百万 token、输出约 2–9 元/百万 token，具体以火山引擎官方定价为准）。
- 数据合规：识别照片会瞬时发送给火山引擎，公开推广前隐私政策必须写明；识别接口限频防滥用。
