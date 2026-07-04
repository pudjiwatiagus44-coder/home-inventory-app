# Acceptance Truth

## 验收门槛

| 门槛 | 需要的证据 | 状态 |
| --- | --- | --- |
| 项目边界 | `dev-docs/project-brief.md` 已确认 | 已确认初版 |
| 技术路线 | `Next.js + TypeScript + Supabase + PWA` 已由用户确认 | 已确认 |
| 架构 owner | `dev-docs/architecture.md` owner map 完成 | 已确认初版 |
| 启动基线 | `npm install`、`npm run lint`、`npm run build`、`npm run dev` 已验证 | 已验证 |
| 第一闭环 | 用户注册到管理物品的完整流程跑通 | 未验证 |
| 数据影响 | 数据创建、更新、删除证据 | 未验证 |
| 权限安全 | RLS 设计草案和初始 migration 已完成并已执行，用户 A/B 负例尚未执行 | migration 已执行，未验证 |
| 第三方 | Supabase 官方文档和 sandbox/API 证据 | 部分确认 |
| UI | 截图、响应式、空/加载/错误状态 | 未验证 |
| Git | `.gitignore`、私有资料、checkpoint | 未验证 |

## 第一阶段验收路径

```text
打开本地应用
  -> 注册用户 A
  -> 创建默认家庭空间
  -> 新增区域/位置
  -> 新增物品
  -> 搜索物品
  -> 编辑物品
  -> 删除物品
  -> 退出登录
  -> 注册用户 B
  -> 确认用户 B 看不到用户 A 的数据
```

## 证据记录

当前运行证据：

- `npm install`：成功安装 361 个 package。
- `npm run lint`：退出码 0。
- `npm run build`：退出码 0，Next.js 生成 `/` 和 `/_not-found` 静态页面。
- `npm run dev -- --hostname 127.0.0.1 --port 3000`：本地服务启动在 `http://127.0.0.1:3000`。
- 浏览器桌面视口：`1280x720`，页面标题为 `Home Inventory`，无 console error。
- 浏览器移动视口：`390x844`，无横向溢出，无 console error。
- Supabase 接入骨架：`npm test` 通过 3 个测试文件 / 6 个测试。
- 登录页：`/login` 可打开，邮箱/密码表单可见，无 console error；短密码会显示 `密码至少需要 8 位`。
- 登录页未配置 Supabase 时：有效邮箱密码会显示 `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，不会假成功。
- Supabase public env 默认读取修复：`npm test` 通过 5 个测试文件 / 13 个测试，`npm run lint` 和 `npm run build` 通过。
- 应用首页：`/app` 已创建；未登录访问显示“请先登录”，无 console error；登录成功后会跳转到 `/app`。
- 新增位置 + 新增物品闭环代码证据：新增 `src/features/inventory/inventory-actions.ts`，覆盖位置名称校验、物品字段校验、写入 `locations`、写入 `items`、Supabase/RLS 错误透传；`npm test` 通过 7 个测试文件 / 26 个测试。
- `/app` UI 证据：已接入 `locations` 读取、新增位置表单、新增物品表单、物品位置展示；`npm run lint` 和 `npm run build` 通过。
- 浏览器未登录证据：Chrome headless 访问 `http://127.0.0.1:3000/app`，页面标题为 `Home Inventory`，显示“请先登录”，无 console error。
- 未验证：真实登录后新增位置、真实登录后新增物品、刷新后仍存在、用户 A/B 权限负例。
- RLS 报错排查：截图显示新增 `locations` 时触发 `new row violates row-level security policy for table "locations"`；已新增修复 migration `supabase/migrations/202607030001_repair_default_household_rls.sql`，用于幂等修复默认 household、owner membership、默认区域、locations RLS、items RLS 和 `items_set_created_by` trigger。该 migration 尚未在真实 Supabase 项目执行。
- RLS 报错继续排查：截图显示新增 `items` 时触发 `new row violates row-level security policy for table "items"`；前端新增物品 payload 已显式传 `created_by = 当前登录用户 id`，同时 repair migration 已补齐 items insert policy 和 created_by trigger。
- RLS 二次修复：新增 `supabase/migrations/202607030002_reset_inventory_rls_policies.sql`，用于清理真实 Supabase 项目里可能残留的 inventory 表旧策略，并重新创建 `areas`、`locations`、`items` 的 member-only RLS。该 migration 尚未在真实 Supabase 项目执行。
- 用户侧验收：执行 RLS 二次修复后，用户反馈“新增茶叶成功了”。说明当前登录用户新增 item 的真实 Supabase 写入路径已跑通。仍未验证用户 A/B 权限负例。
- 2026-07-03 区域/位置/物品管理闭环代码证据：新增区域 CRUD、位置归属区域、物品编辑/删除、按区域/位置筛选、搜索和基础过期状态；`npm test` 通过 7 个测试文件 / 39 个测试，`npm run lint` 通过，`npm run build` 通过。
- 2026-07-03 `/app` 未登录浏览器验证：本地服务 `http://127.0.0.1:3000` 可访问；打开 `http://127.0.0.1:3000/app`，页面标题为 `Home Inventory`，显示“请先登录”和“去登录”，无页面 console error。
- 2026-07-04 Supabase RLS 用户 A/B 权限负例验证：使用 public Supabase client 和两个真实登录 session（A=`73***@qq.com`，B=`lu***@outlook.com`）执行。A 可创建自己的 area/location/item；B 可创建自己的 area；B 查询 A 的 household/area/location/item 均返回 `rows=0`；B 向 A household 插入 area 返回 `new row violates row-level security policy for table "areas"`；B 向 A household 插入 item 返回 `new row violates row-level security policy for table "items"`；B 更新/删除 A item 均返回 `rows=0`；未登录 anon 读取 A item 返回 `rows=0`；A item 在 B 更新/删除尝试后仍保持原 note。结果：13 项通过 / 0 项失败。临时 area/location/item 测试记录已清理，测试账号仍保留在 Supabase Auth。
- 新增区域代码证据：已接入 `areas` 创建能力，新增位置时可选择所属区域，物品展示可显示区域/位置关系；`npm test` 通过 7 个测试文件 / 30 个测试，`npm run lint` 和 `npm run build` 通过。
- 未验证：真实登录后新增区域、带区域新增位置、区域/位置关系刷新后仍存在。
- 2026-07-04 过期物品展示区代码证据：`/app` 物品清单上方新增“即将过期物品”和“已过期物品”两个展示区域；即将过期沿用 30 天内到期规则，两个区域按过期日从近到远显示最多 5 个重点物品，并显示总数。`npm test` 通过 7 个测试文件 / 40 个测试，`npm run lint` 通过，`npm run build` 通过。
- 2026-07-04 最终本地验证证据：在 `C:\Users\Administrator\Desktop\home-inventory-app` 执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 40 个测试；执行 `npm run lint`，exit code 0，ESLint 无报错输出；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。构建日志显示读取 `.env.local`，该文件仅用于本地环境变量，不应提交到 Git。

后续每个阶段必须记录：

- 文件路径。
- 命令和结果。
- 本地 URL 或部署 URL。
- 截图。
- Supabase 表结构和 RLS 策略。
- 用户 A/B 权限负例结果。
- 未运行项和原因。

## 数据库验收

第一阶段数据库验收必须包含：

- migration 文件存在，且与 `dev-docs/database-design.md` 一致。
- Supabase 测试项目执行 migration 成功。
- 用户 A 可以创建 household、area、location、item。
- 用户 B 无法读取用户 A 的 household、location、item。
- 用户 B 无法用用户 A 的 `household_id` 插入 item。
- 用户 B 无法更新或删除用户 A 的 item。
- 未登录请求不能读取用户数据。

## 用户验收

用户需要亲自确认：

- 产品第一版范围是否足够小。
- UI 是否适合普通家庭用户。
- 物品、位置、过期日模型是否符合真实使用习惯。
- 是否接受第一版不做共享、照片、扫码、原生 App。

## 停止条件

- 不能在没有 RLS 权限策略和负例验证时声明安全。
- 不能在没有 `.env.example` 和密钥边界时接入真实云服务。
- 不能在没有用户确认技术选型时 scaffold 代码。
- 不能把 mock 数据包装成真实 Supabase 功能。
- 不能把真实 Supabase secret、service role key 或用户数据提交到 Git。
