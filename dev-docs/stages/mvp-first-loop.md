# MVP First Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 阶段目标

让已登录用户完成第一版家庭物品管理闭环：

```text
登录
  -> 初始化自己的默认家庭空间
  -> 新增区域
  -> 新增位置
  -> 新增物品
  -> 按区域/位置查看物品
  -> 查看真实物品列表
  -> 搜索物品
  -> 编辑/删除物品
  -> 验证用户 A/B 数据隔离
```

本阶段完成后，用户应该能在 `/app` 中用真实 Supabase 数据维护自己的区域、位置和物品清单。刷新页面或重新登录后，已创建的数据仍然存在。

## 源真源

- `dev-docs/project-brief.md`
- `dev-docs/technical-selection.md`
- `dev-docs/architecture.md`
- `dev-docs/database-design.md`
- `dev-docs/acceptance.md`
- `supabase/migrations/202607020001_initial_schema.sql`
- `src/features/inventory/AppDashboard.tsx`
- `src/features/inventory/dashboard-data.ts`
- `src/features/inventory/household-bootstrap.ts`

## 当前项目状态

- Next.js + TypeScript + Supabase 路线已确认。
- Supabase public env 骨架已存在。
- 登录页 UI 已存在。
- 登录后 `/app` 应用首页已存在。
- 默认 household 初始化流程代码已存在。
- 初始数据库 migration 已由用户在 Supabase 项目中执行成功。
- `/app` 已接入区域、位置、物品 CRUD、搜索/筛选和基础过期展示。
- 真实 Supabase 写入路径已通过用户侧新增物品反馈验证。
- 2026-07-04 用户 A/B 权限负例已完成，13 项通过 / 0 项失败，证据记录见 `dev-docs/acceptance.md`。
- 当前阶段进入收口状态：不继续扩大功能范围，先对齐真源、复跑本地验证，并保留用户体验验收缺口。

## 同类参考证据

| 来源 | 为什么可参考 | 可学习点 | 不复制什么 | 本项目适配 |
| --- | --- | --- | --- | --- |
| 当前本地版置物管理系统 | 已验证“位置 + 物品 + 搜索 + 过期提醒”是有效核心模型 | 保留低成本录入、按位置查找、快速搜索 | 不复制 Python + JSON、本地局域网、无账号假设 | 只学习信息结构和使用习惯，云端实现从 Supabase/RLS 开始 |
| Supabase Auth / RLS 官方文档 | 本阶段依赖 Supabase 登录和行级权限 | 用数据库 RLS 做权限兜底 | 不把权限只放在前端按钮显示层 | 每个用户只能访问自己 household 的数据 |
| Supabase Next.js quickstart | 本阶段使用 Next.js + Supabase client | 学习官方 client 初始化和 session 调用方式 | 不引入自建后端或 service role key 到浏览器 | 继续沿用现有 `src/lib/supabase/` 初始化层 |
| Homebox / Grocy 等家庭库存产品 | 同属家庭物品/库存管理 | 位置、物品、搜索、到期信息是常见核心 | 不复制复杂资产管理、扫码、照片、多人共享、库存流水 | 第一版只做个人私有清单，保持小闭环 |

参考扫描状态：已记录方向性参考；未做深度竞品流程复刻。若后续要做更完整信息架构或视觉设计，应单独补 `dev-docs/frontend-design.md`。

## 第三方集成证据

本阶段唯一第三方服务是 Supabase。

- 已确认使用：Supabase Auth、Supabase Postgres、Row Level Security、Supabase JavaScript SDK。
- 已有官方资料记录：`dev-docs/technical-selection.md`。
- 禁止使用：Supabase service role key、数据库密码、真实用户数据入仓。
- 环境变量边界：浏览器只允许使用 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
- 已验证：真实 Supabase 项目中的用户 A/B RLS 负例，结果记录在 `dev-docs/acceptance.md`。

## 范围

本阶段要做：

- 默认 household 初始化流程验证和必要修复。
- 区域管理的最小闭环：新增、编辑、删除区域，并展示区域下的位置。
- 位置管理的最小闭环：新增位置、读取位置、选择位置，位置可归属区域。
- 物品管理的最小闭环：新增、展示、搜索、编辑、删除。
- 物品查看支持按区域和位置筛选。
- 过期日期字段的基础展示。
- 加载、空状态、保存失败、权限失败的明确提示。
- 用户 A/B 权限负例验证。
- 阶段验收证据写回 `dev-docs/acceptance.md`。

## 不做什么

本阶段明确不做：

- 家庭成员共享。
- 照片或附件上传。
- 扫码识别。
- AI 图片识别。
- 会员付费。
- 管理员后台。
- 原生 iOS/Android。
- 推送通知。
- 导入本地 JSON 数据。
- 大规模库存流水、采购、价格、资产折旧。
- 自建后端服务。
- 更换 Supabase、Next.js 或数据库路线。

## 功能开工评估

| 项目 | 判断 |
| --- | --- |
| 目标用户 | 登录后的普通家庭个人用户 |
| 用户动作 | 维护自己的区域、位置和物品 |
| 可见结果 | `/app` 中能看到真实保存的区域、位置和物品清单 |
| 风险等级 | 标准任务，包含数据库读写和权限验证，不能跳过验收 |
| 功能大小 | 大功能，属于 MVP 第一闭环 |
| 当前 owner | `src/features/inventory/` 负责业务 UI 和数据组织；Supabase schema/RLS 负责数据安全 |
| 推荐插入路线 | 扩展现有 `/app` 和 `src/features/inventory/`，复用现有 Supabase client |
| 拒绝路线 | 不新增并行 mock 数据层；不新增自建后端；不改 schema；不绕过 RLS |

## 基础影响检查

| 边界 | 本阶段是否改变 | 说明 |
| --- | --- | --- |
| 技术栈 | 否 | 继续使用 Next.js + TypeScript + Supabase |
| 目录结构 | 小幅新增 | 只在 `src/features/inventory/` 下新增聚焦文件 |
| 前端路由 | 否 | 继续使用 `/app` |
| 数据库 schema | 否 | 使用已设计并执行的初始 migration |
| 权限模型 | 否 | 使用现有 RLS 设计；必须验证负例 |
| 第三方服务 | 否 | 只使用 Supabase |
| 环境变量 | 否 | 不新增 secret |
| 支付/上传 | 否 | 明确不做 |
| 部署 | 否 | 仍处于本地/MVP 验证阶段 |

如实施中发现必须新增字段、修改 RLS、引入 route handler、引入新服务或改变登录流程，必须停止并先更新真源文档。

## 子阶段拆分

| 子阶段 | 目标 | 主要文件 | 完成标准 | 验证方式 |
| --- | --- | --- | --- | --- |
| 1. 数据读取与状态整理 | 把 `/app` 数据读取整理成可支撑 CRUD 的 owner 层 | `src/features/inventory/dashboard-data.ts`, `src/features/inventory/AppDashboard.tsx` | 能稳定读取 household、areas、locations、items；空状态清晰 | `npm test`, `npm run lint`, 浏览器打开 `/app` |
| 2. 区域和位置管理 | 登录用户能管理自己的 area/location | `src/features/inventory/` | 区域可新增/编辑/删除；位置可新增并归属区域；刷新后存在 | 浏览器手动新增/编辑/删除；Supabase 表记录确认 |
| 3. 新增物品 | 登录用户能选择位置并新增 item | `src/features/inventory/` | 新增物品写入 Supabase，列表显示真实数据 | 浏览器手动新增；刷新后仍存在 |
| 4. 物品列表、筛选和搜索 | 用户能按区域/位置查看和搜索自己的物品 | `src/features/inventory/` | 支持按名称/备注搜索，按区域/位置筛选，展示区域、位置和过期日期 | 浏览器搜索和筛选路径验证 |
| 5. 编辑和删除物品 | 用户能修改和删除自己的 item | `src/features/inventory/` | 编辑后刷新仍正确；删除后不再显示 | 浏览器编辑/删除路径验证 |
| 6. 权限负例验证 | 证明用户 A/B 数据隔离 | Supabase 项目、`dev-docs/acceptance.md` | B 不能读写删 A 的 household/area/location/item | 记录 A/B 测试结果和失败响应 |
| 7. 阶段收口 | 更新验收证据并做 Git checkpoint | `dev-docs/acceptance.md`, Git | 证据完整，未验证项明确 | `npm test`, `npm run lint`, `npm run build`, git status |

## 子阶段执行清单

状态说明：以下清单按 2026-07-04 收口证据更新。`[x]` 表示已有代码、命令或 Supabase 负例证据；`[ ]` 表示仍需要用户体验或截图类确认，不能包装成已完成。

### 子阶段 1：数据读取与状态整理

- [x] 确认现有 dashboard 数据类型覆盖 household、locations、items。
- [x] 补齐单元测试，覆盖空数据、已有物品、缺失 household 名称。
- [x] 保持未登录访问 `/app` 时跳转或提示登录。
- [x] 验证未配置 Supabase env 时不假装成功。
- [x] 不新增 mock 数据。

完成标准：

- `/app` 能显示真实 Supabase 返回的数据。
- 空状态不暗示功能已完成。
- 测试、lint 通过。

### 子阶段 2：区域和位置管理

- [x] 在 `/app` 中提供新增区域入口。
- [x] 为区域提供编辑入口。
- [x] 为区域提供删除入口，删除前必须确认。
- [x] 在 `/app` 中提供新增位置入口。
- [x] 区域表单字段包含 `name` 和 `color`。
- [x] 位置表单字段包含 `name` 和可选 `area_id`。
- [x] 写入 `areas` 时必须带当前用户自己的 `household_id`。
- [x] 写入 `locations` 时必须带当前用户自己的 `household_id`。
- [x] `area_id` 只能来自当前 household 的区域，允许不选择区域。
- [x] 保存成功后刷新区域和位置列表。
- [x] 删除区域后，该区域下的位置显示为“未分区”，位置和物品不应被删除。
- [x] 保存失败时显示明确错误。

完成标准：

- 用户能创建至少一个区域。
- 用户能编辑区域名称和颜色。
- 用户能删除区域，刷新后仍不存在。
- 用户能创建至少一个位置。
- 用户能把位置归属到区域。
- 用户能创建无区域的位置。
- 该位置刷新后仍存在。
- 未登录用户不能创建位置。

### 子阶段 3：新增物品

- [x] 启用“新增物品”入口。
- [x] 表单字段包含 `name`、`location_id`、`note`、`expire_date`。
- [x] `name` 必填，并遵守数据库长度限制。
- [x] `location_id` 只能来自当前 household 的位置。
- [x] 保存成功后出现在物品列表。

完成标准：

- 用户能新增一个带位置的物品。
- 用户能新增一个无过期日期的物品。
- 用户能新增一个带过期日期的物品。
- 刷新页面后物品仍存在。

### 子阶段 4：物品列表、筛选和搜索

- [x] 列表展示物品名称、区域、位置、备注摘要、过期日期。
- [x] 提供基础搜索输入。
- [x] 搜索范围为 `items.name` 和 `items.note`。
- [x] 提供区域筛选。
- [x] 提供位置筛选。
- [x] 空搜索结果显示清晰提示。
- [x] 不引入全文搜索索引；MVP 使用 `ilike` 即可。

完成标准：

- 搜索已存在物品能命中。
- 搜索不存在关键词时不显示错误。
- 按区域筛选时只显示该区域下位置中的物品。
- 按位置筛选时只显示该位置中的物品。
- 用户只看到自己 household 的物品。

### 子阶段 5：编辑和删除物品

- [x] 为列表项提供编辑入口。
- [x] 支持修改名称、位置、备注、过期日期。
- [x] 为列表项提供删除入口。
- [x] 删除前必须有明确确认。
- [x] 更新/删除失败时显示错误。

完成标准：

- 编辑后刷新仍保存。
- 删除后刷新仍不存在。
- 不能编辑或删除不属于当前用户 household 的 item。

### 子阶段 6：权限负例验证

- [x] 准备用户 A 和用户 B。
- [x] 用户 A 创建 area、location 和 item。
- [x] 用户 B 登录后无法看到用户 A 的数据。
- [x] 用户 B 使用用户 A 的 `household_id` 插入 area 失败。
- [x] 用户 B 使用用户 A 的 `household_id` 插入 item 失败。
- [x] 用户 B 使用用户 A 的 `item_id` 更新 item 失败。
- [x] 用户 B 使用用户 A 的 `item_id` 删除 item 失败。
- [x] 未登录请求不能读取用户数据。

完成标准：

- 每个负例都有结果记录。
- 失败来自 Supabase/RLS 或数据库约束，不是只靠前端隐藏按钮。
- 验证结果写回 `dev-docs/acceptance.md`。

### 子阶段 7：阶段收口

- [x] 运行 `npm test`。
- [x] 运行 `npm run lint`。
- [x] 运行 `npm run build`。
- [ ] 浏览器验证桌面视口 `/login` 和 `/app`。
- [ ] 浏览器验证移动视口 `/app` 无横向溢出。
- [x] 更新 `dev-docs/acceptance.md` 的证据记录。
- [x] 检查 `.env.local` 未被提交。
- [x] 创建 Git checkpoint：上一轮验证提交为 `4d69808 checkpoint: inventory mvp validation`；本次文档收口由本轮 Git 提交记录。

完成标准：

- 第一闭环验收路径完成。
- 权限负例完成。
- 未验证项如实保留。

## 可能触碰的文件

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| 前端页面 | `src/app/app/page.tsx` | 继续作为 `/app` 页面入口 |
| 业务组件 | `src/features/inventory/AppDashboard.tsx` | 当前 dashboard owner，可能拆分 |
| 业务数据 | `src/features/inventory/dashboard-data.ts` | dashboard 展示数据整理 |
| household 初始化 | `src/features/inventory/household-bootstrap.ts` | 登录后默认 household 获取 |
| Supabase client | `src/lib/supabase/client.ts` | 只复用，不随意改初始化边界 |
| 测试 | `src/features/inventory/*.test.ts` | 增加业务数据和表单行为测试 |
| 样式 | `src/app/globals.css` | 只在必要时补 token，不做大视觉改版 |
| 验收文档 | `dev-docs/acceptance.md` | 阶段证据写回 |

如果实现需要修改 `supabase/migrations/` 或 `dev-docs/database-design.md`，说明当前计划与数据库真源不一致，必须先停止确认。

## 安全、权限和数据要求

- 所有用户数据读写必须经过当前登录用户 session。
- 前端不得传入或保存 service role key。
- public 数据表访问必须依赖 RLS。
- 新增、编辑、删除必须使用当前用户所属 household。
- `location_id` 必须属于同一个 household。
- 表单校验不能替代数据库约束。
- 错误提示可以给用户看原因，但不能泄露密钥、数据库连接信息或其他用户数据。
- 不允许用 mock 数据冒充已接入 Supabase。

## 验收路径

第一阶段验收必须跑通：

```text
打开本地应用
  -> 注册/登录用户 A
  -> 自动创建或读取默认家庭空间
  -> 新增区域
  -> 新增位置
  -> 新增物品
  -> 按区域/位置筛选物品
  -> 搜索物品
  -> 编辑物品
  -> 删除物品
  -> 退出
  -> 注册/登录用户 B
  -> 确认用户 B 看不到用户 A 的数据
  -> 验证用户 B 不能读写删用户 A 的数据
```

命令证据：

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run dev -- --hostname 127.0.0.1 --port 3000`

可见证据：

- `/login` 可登录。
- `/app` 可显示当前用户家庭空间。
- 新增位置和物品后刷新仍存在。
- 搜索、编辑、删除路径可见。
- 桌面和移动视口无明显布局破裂。

数据库证据：

- 用户 A 的 `areas`、`locations` 和 `items` 存在于自己的 household。
- 用户 B 查询不到用户 A 的数据。
- 用户 B 对用户 A 的 `household_id` / `item_id` 写入或修改失败。

## 停止条件

遇到以下情况必须停止并先更新真源或询问用户：

- 需要新增或修改数据库表、字段、索引、RLS 策略。
- 需要改登录方式或 session 管理方式。
- 需要引入自建后端、Next.js route handler 或 server action 来承载核心写入。
- 需要真实 service role key、数据库密码或生产用户数据。
- 想加入照片上传、扫码、家庭共享、支付、管理员后台。
- Supabase migration 与 `dev-docs/database-design.md` 不一致。
- 权限负例失败，用户 B 能读写用户 A 数据。

## Git checkpoint 规则

- 每个子阶段完成并通过对应验证后，可以做一个小 checkpoint。
- 阶段收口前必须检查 `.env.local`、真实密钥、真实用户数据没有进入 Git。
- 若 `dev-docs/` 后续计划不进入公开远程仓库，推送前必须重新确认隐私边界。

## 用户确认状态

当前状态：用户已确认执行“区域管理 + 位置管理 + 物品 CRUD + 搜索/筛选 + 过期提示”闭环。

用户需要确认：

- 已确认本阶段加入区域 CRUD。
- 已确认区域是位置的上属，物品通过位置归入区域。
- 本阶段仍不加入家庭共享、照片、扫码、AI 识别、支付、原生 App。

已确认可以进入代码实现。

## 未验证项

- 真实浏览器中完整走一遍新增区域、带区域新增位置、新增物品、搜索、筛选、编辑、删除的用户验收陪跑。
- 移动端完整操作体验和截图证据。
