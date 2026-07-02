# Technical Selection

## 结论

主路线：`Next.js + TypeScript + Supabase + PWA`。

这条路线已经由用户确认。除非用户明确批准并更新本文件，否则后续实现不得切换到 Firebase、自建后端、原生 App 先行、纯 Vite 前端或本地 Python/JSON 后端。

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

选择：Supabase Auth + Supabase Postgres + Row Level Security。

理由：

- Supabase Auth 支持邮箱密码等认证方式。
- Supabase Auth 可以和数据库 RLS 结合，让用户 token 参与数据库行级访问控制。
- 本项目数据关系清晰，Postgres 比文档数据库更自然。
- 第一版可以不自建完整后端，降低维护成本。

RLS 是安全硬边界：

- public schema 中暴露给前端访问的用户数据表必须启用 RLS。
- 没有 RLS 策略和用户 A/B 负例验证前，不能声明 MVP 安全可用。
- service role key 不能出现在浏览器代码、公开仓库或 `.env.example` 的真实值里。

## 数据库选择

选择：Supabase Postgres。

第一版核心表：

- `profiles`
- `households`
- `household_members`
- `areas`
- `locations`
- `items`

第一版虽然不做家庭共享，但保留 household 概念，避免未来共享功能大迁移。

## 运行时和部署边界

主运行时：Node.js / Next.js。

托管建议：

- 前端：Vercel 优先评估。
- 数据和认证：Supabase。
- 本地开发：`npm install`、`npm run dev`、`.env.local`。

不引入第二后端运行时。除非未来出现 Next.js/Supabase 不能合理覆盖的工作负载，否则不加入 Python、Go、Java 或独立 Node API 服务。

## 备选路线取舍

### Firebase

可行，但不作为主线。它适合实时同步和移动生态，但本项目的用户、家庭、区域、位置、物品关系更适合 Postgres。Firestore 权限规则也能做隔离，但关系型查询和未来导出统计不如 Postgres 顺手。

### Vite React + Supabase

可行，但不作为主线。它更轻，但缺少 Next.js 的服务端余量。考虑未来可能出现导入、邀请、通知、支付 webhook，Next.js 更稳。

### 自建后端 + PostgreSQL

暂不选择。控制力强，但第一版维护成本过高，会把产品验证拖成基础设施工程。

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

先设计数据库 schema 和 RLS 策略，再 scaffold Next.js 项目。不要在 RLS 设计完成前写真实业务功能。

