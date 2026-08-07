# Development Truth Index

本目录是 Home Inventory App 的内部开发真源。后续代码、数据库、界面、部署和验收都必须回到这里对齐。

## 当前真源索引

- `project-brief.md` - 产品边界、MVP、不做什么、第一闭环。
- `technical-selection.md` - 已确认技术路线、备选路线取舍、平台能力判断、中国大陆正式版目标路线。
- `architecture.md` - 主推荐架构、owner map、数据和权限边界。
- `database-design.md` - Supabase schema、对象关系、RLS 策略和权限负例。
- `mainland-database-design.md` - 中国大陆正式版 PostgreSQL schema 草案和服务端权限边界。
- `deployment-route.md` - 已确认部署路线、免费层边界、中国大陆正式版路线、环境变量和上线前检查。
- `aliyun-test-env-deployment-checklist.md` - 阿里云测试环境部署清单，覆盖服务器、Ubuntu、Node、PostgreSQL、Nginx/systemd、HTTPS 证书、端口、安全组、环境变量、备份和回滚。
- `stages/mvp-first-loop.md` - 第一阶段实施计划：位置、物品 CRUD、搜索和权限负例。
- `stages/family-sharing.md` - 家庭成员共享第一阶段实施计划：邀请、共同编辑、成员管理（2026-08-06 设计已确认，尚未实施）。
- `stages/mainland-production-route.md` - 中国大陆正式版实施路线：备案、国内云、数据库、认证、权限和发布验收。
- `stages/mainland-auth-db-migration.md` - 国内正式版认证、数据库、权限和部署迁移拆分；不影响当前 Vercel/Supabase 临时版。
- `local-postgres-test-runbook.md` - 本地/测试 PostgreSQL 配置、schema、integration test 和安全规则。
- `acceptance.md` - 阶段验收门槛、证据记录、停止条件。

## 文档职责

- 产品方向变更先改 `project-brief.md`。
- 技术栈、框架、数据库变更先改 `technical-selection.md`；部署路线变更先改 `deployment-route.md` 并同步 `technical-selection.md`。
- 数据模型、RLS、owner 边界、请求生命周期变更先改 `architecture.md`。
- 表结构、字段、索引、RLS 策略和数据库负例变更先改 `database-design.md`。
- 验收标准、证据要求、停止条件变更先改 `acceptance.md`。

## 更新规则

- 聊天里的决定必须写回对应真源文档后才算正式决定。
- 代码实现不能覆盖真源文档；发现冲突时先停下报告。
- 高风险能力包括登录、权限、数据库、支付、上传、部署、第三方服务。
- 阶段状态可以标记为 `未验证`，不能把未验证项包装成已完成。

## 当前阶段

项目处于 MVP 基础搭建与阿里云测试环境部署阶段。已完成 Next.js 启动基线、自有认证/权限层雏形、国内 PostgreSQL 测试环境部署、HTTPS 域名接入（`https://homestorag.xyz`）和 ICP 备案号页面展示；用户已在 Supabase 项目中执行 migration 成功，用户 A/B 权限负例在 Supabase 临时路线已完成，在国内 PostgreSQL 路线仍需补齐。当前阿里云测试环境已可通过域名 HTTPS 访问，但正式生产级备份恢复、监控、日志、公安联网备案、邮箱验证、密码重置、隐私政策和用户协议尚未补齐。2026-08-06 用户确认将家庭成员共享纳入当前范围（Web/PWA 先行，自托管路线）：房主生成邀请链接通过微信等渠道发给家人，家人自主申请、房主批准后加入，共同查看编辑、owner 移除成员；Android 内测版含房主邀请分享与申请审批（App 内生成链接并系统分享/复制，App 内批准/拒绝加入申请）和更新提醒（服务器有新版本时提示下载）；链接落地页含 Android 内测 App 下载入口，APK 0.4.0 已托管到服务器（`scripts/upload-apk.ps1` 自动上传）。设计已写入 `project-brief.md`、`architecture.md`、`database-design.md`、`acceptance.md` 和 `stages/family-sharing.md`；家庭共享已在 `homestorag.xyz` 上线并通过线上 smoke，Android 分享/审批/更新提醒待真机验收。2026-08-07 用户确认 Android 内测版新增拍照识别物品（只存缩略图、原图即弃、火山引擎豆包识别），设计见 `docs/superpowers/specs/2026-08-07-photo-recognition-design.md`，已同步 `project-brief.md`、`architecture.md`、`database-design.md`、`technical-selection.md` 和 `acceptance.md`，实施计划待编写。

部署路线已确认两阶段：Vercel 免费层 + Supabase 免费层仅作为临时测试版；用户已在 2026-07-05 确认要直接推进中国大陆正式版，后续需要国内云平台、域名备案、国内 PostgreSQL、自有认证/权限层和正式发布验收。

## 进入开发前必须补齐

- 数据库 schema 和 RLS 策略已完成设计草案，初始 migration 已在 Supabase 项目执行成功。
- 第一阶段实施计划已补齐：`dev-docs/stages/mvp-first-loop.md`，进入代码实现前仍需用户确认范围和第一个子阶段。
- 本地启动命令、测试命令、验收路径。
- `.env.local` 已配置 public Supabase URL 和 publishable key；禁止提交真实值。
- 新增物品表单和物品 CRUD 闭环。
