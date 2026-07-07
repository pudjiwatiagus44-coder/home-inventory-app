# Development Truth Index

本目录是 Home Inventory App 的内部开发真源。后续代码、数据库、界面、部署和验收都必须回到这里对齐。

## 当前真源索引

- `project-brief.md` - 产品边界、MVP、不做什么、第一闭环。
- `technical-selection.md` - 已确认技术路线、备选路线取舍、平台能力判断、中国大陆正式版目标路线。
- `architecture.md` - 主推荐架构、owner map、数据和权限边界。
- `database-design.md` - Supabase schema、对象关系、RLS 策略和权限负例。
- `mainland-database-design.md` - 中国大陆正式版 PostgreSQL schema 草案和服务端权限边界。
- `deployment-route.md` - 已确认部署路线、免费层边界、中国大陆正式版路线、环境变量和上线前检查。
- `stages/mvp-first-loop.md` - 第一阶段实施计划：位置、物品 CRUD、搜索和权限负例。
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

项目处于 MVP 基础搭建阶段。已创建 Next.js 启动基线、Supabase public env 骨架、登录页 UI、登录后 `/app` 应用首页、数据库设计草案和初始 migration；用户已在 Supabase 项目中执行 migration 成功。用户 A/B 权限负例验证尚未完成。

部署路线已确认两阶段：Vercel 免费层 + Supabase 免费层仅作为临时测试版；用户已在 2026-07-05 确认要直接推进中国大陆正式版，后续需要国内云平台、域名备案、国内 PostgreSQL、自有认证/权限层和正式发布验收。

## 进入开发前必须补齐

- 数据库 schema 和 RLS 策略已完成设计草案，初始 migration 已在 Supabase 项目执行成功。
- 第一阶段实施计划已补齐：`dev-docs/stages/mvp-first-loop.md`，进入代码实现前仍需用户确认范围和第一个子阶段。
- 本地启动命令、测试命令、验收路径。
- `.env.local` 已配置 public Supabase URL 和 publishable key；禁止提交真实值。
- 新增物品表单和物品 CRUD 闭环。
