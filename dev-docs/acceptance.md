# Acceptance Truth

## 验收门槛

| 门槛 | 需要的证据 | 状态 |
| --- | --- | --- |
| 项目边界 | `dev-docs/project-brief.md` 已确认 | 已确认初版 |
| 技术路线 | `Next.js + TypeScript + Supabase + PWA` 已由用户确认 | 已确认 |
| 架构 owner | `dev-docs/architecture.md` owner map 完成 | 已确认初版 |
| 启动基线 | `npm install`、`npm run lint`、`npm run build`、`npm run dev` 已验证 | 已验证 |
| 第一闭环 | 用户注册到管理物品的完整流程跑通 | 代码闭环已完成；仍需用户验收陪跑 |
| 数据影响 | 数据创建、更新、删除证据 | 已有代码、用户反馈和 RLS 负例证据；仍需完整浏览器陪跑 |
| 权限安全 | RLS 设计、migration、真实 Supabase 用户 A/B 负例 | 已验证，13 项通过 / 0 项失败 |
| 第三方 | Supabase 官方文档和 sandbox/API 证据 | 部分确认 |
| UI | 截图、响应式、空/加载/错误状态 | 基础浏览器证据已记录；完整移动端操作体验未验证 |
| Git | `.gitignore`、私有资料、checkpoint | 已有 checkpoint；本次文档收口由本轮 Git 提交记录 |

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

## 位置编辑与位置筛选验收路径

```text
登录进入 /app
  -> 创建或确认至少两个区域
  -> 创建或确认多个位置分别属于不同区域
  -> 在位置列表点击某个位置右侧“编辑”
  -> 在弹窗中修改位置名称并保存
  -> 再次打开编辑弹窗，把该位置改到另一个区域或改为未分区
  -> 在位置列表上方选择某个区域
  -> 确认只显示该区域下的位置
  -> 选择“全部区域”
  -> 确认恢复显示全部位置
```

验收边界：

- 本功能不新增数据库字段。
- 本功能不修改 RLS。
- 本功能不改变家庭共享、照片、扫码、支付、原生 App 的不做范围。
- 位置编辑必须按当前用户 household 更新，不能只靠前端隐藏按钮。
- 位置列表筛选只影响位置列表，不影响右侧物品清单的搜索/筛选状态。

## 物品表单区域优先选择验收路径

```text
登录进入 /app
  -> 创建或确认至少两个区域
  -> 创建或确认多个位置分别属于不同区域
  -> 在新增物品表单先选择某个区域
  -> 确认右侧位置下拉只显示该区域下的位置
  -> 切换到另一个区域
  -> 确认位置选择被清空，且位置下拉只显示新区域下的位置
  -> 选择“未分区”
  -> 确认位置下拉只显示未分区位置
  -> 新增一个带区域下位置的物品并保存
  -> 点击该物品“编辑”
  -> 确认表单自动显示该物品所属区域和位置
```

验收边界：

- 本功能不新增数据库字段。
- 本功能不修改 RLS。
- 本功能不改变家庭共享、照片、扫码、支付、原生 App 的不做范围。
- 物品仍通过现有 `items.location_id` 关联位置，并通过位置间接归入区域。
- 区域选择只用于限制物品表单中的位置下拉，不新增 `items.area_id`。

## 移动端物品搜索置顶验收路径

```text
用手机或移动端视口打开 /app
  -> 登录后进入家庭物品管理页
  -> 确认首屏优先看到“物品清单”
  -> 确认搜索框、区域筛选和位置筛选在概览/区域/位置管理之前出现
  -> 向下滚动
  -> 确认概览、区域管理和位置管理仍可使用
  -> 切换到桌面端视口
  -> 确认桌面端仍为左侧管理、右侧物品清单
```

验收边界：

- 本功能不新增数据库字段。
- 本功能不修改 RLS。
- 本功能不改变家庭共享、照片、扫码、支付、原生 App 的不做范围。
- 本功能只调整移动端布局优先级，不改变搜索、筛选和新增物品的数据逻辑。

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
- 历史未验证项：当时真实登录后新增位置、新增物品、刷新后仍存在、用户 A/B 权限负例尚未验证；后续已由新增物品反馈和 2026-07-04 A/B 权限负例补证。
- RLS 报错排查：截图显示新增 `locations` 时触发 `new row violates row-level security policy for table "locations"`；已新增修复 migration `supabase/migrations/202607030001_repair_default_household_rls.sql`，用于幂等修复默认 household、owner membership、默认区域、locations RLS、items RLS 和 `items_set_created_by` trigger。后续又补充了二次 RLS 修复 migration。
- RLS 报错继续排查：截图显示新增 `items` 时触发 `new row violates row-level security policy for table "items"`；前端新增物品 payload 已显式传 `created_by = 当前登录用户 id`，同时 repair migration 已补齐 items insert policy 和 created_by trigger。
- RLS 二次修复：新增 `supabase/migrations/202607030002_reset_inventory_rls_policies.sql`，用于清理真实 Supabase 项目里可能残留的 inventory 表旧策略，并重新创建 `areas`、`locations`、`items` 的 member-only RLS。后续用户反馈执行二次修复后新增物品成功。
- 用户侧验收：执行 RLS 二次修复后，用户反馈“新增茶叶成功了”。说明当前登录用户新增 item 的真实 Supabase 写入路径已跑通。仍未验证用户 A/B 权限负例。
- 2026-07-03 区域/位置/物品管理闭环代码证据：新增区域 CRUD、位置归属区域、物品编辑/删除、按区域/位置筛选、搜索和基础过期状态；`npm test` 通过 7 个测试文件 / 39 个测试，`npm run lint` 通过，`npm run build` 通过。
- 2026-07-03 `/app` 未登录浏览器验证：本地服务 `http://127.0.0.1:3000` 可访问；打开 `http://127.0.0.1:3000/app`，页面标题为 `Home Inventory`，显示“请先登录”和“去登录”，无页面 console error。
- 2026-07-04 Supabase RLS 用户 A/B 权限负例验证：使用 public Supabase client 和两个真实登录 session（A=`73***@qq.com`，B=`lu***@outlook.com`）执行。A 可创建自己的 area/location/item；B 可创建自己的 area；B 查询 A 的 household/area/location/item 均返回 `rows=0`；B 向 A household 插入 area 返回 `new row violates row-level security policy for table "areas"`；B 向 A household 插入 item 返回 `new row violates row-level security policy for table "items"`；B 更新/删除 A item 均返回 `rows=0`；未登录 anon 读取 A item 返回 `rows=0`；A item 在 B 更新/删除尝试后仍保持原 note。结果：13 项通过 / 0 项失败。临时 area/location/item 测试记录已清理，测试账号仍保留在 Supabase Auth。
- 新增区域代码证据：已接入 `areas` 创建能力，新增位置时可选择所属区域，物品展示可显示区域/位置关系；`npm test` 通过 7 个测试文件 / 30 个测试，`npm run lint` 和 `npm run build` 通过。
- 历史未验证项：当时真实登录后新增区域、带区域新增位置、区域/位置关系刷新后仍存在尚未补完整浏览器证据；该项仍保留在“当前剩余未验证项”的用户验收陪跑中。
- 2026-07-04 过期物品展示区代码证据：`/app` 物品清单上方新增“即将过期物品”和“已过期物品”两个展示区域；即将过期沿用 30 天内到期规则，两个区域按过期日从近到远显示最多 5 个重点物品，并显示总数。`npm test` 通过 7 个测试文件 / 40 个测试，`npm run lint` 通过，`npm run build` 通过。
- 2026-07-04 最终本地验证证据：在 `C:\Users\Administrator\Desktop\home-inventory-app` 执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 40 个测试；执行 `npm run lint`，exit code 0，ESLint 无报错输出；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。构建日志显示读取 `.env.local`，该文件仅用于本地环境变量，不应提交到 Git。
- 2026-07-04 Git checkpoint 证据：上一轮验证提交 `4d69808 checkpoint: inventory mvp validation` 用于记录 inventory MVP 验证状态；本次文档收口由本轮 Git 提交记录。
- 2026-07-04 文档收口状态：`dev-docs/stages/mvp-first-loop.md`、`dev-docs/database-design.md`、`dev-docs/acceptance.md` 已对齐第一阶段当前状态：功能代码和 RLS 负例已有证据，仍需补完整浏览器用户验收陪跑和移动端操作体验。
- 2026-07-04 文档收口后本地验证证据：在 `C:\Users\Administrator\Desktop\home-inventory-app` 执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 40 个测试；执行 `npm run lint`，exit code 0，ESLint 无报错输出；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。构建日志显示读取 `.env.local`，该文件仅用于本地环境变量，不应提交到 Git。
- 2026-07-04 位置编辑与位置筛选开工记录：确认采用轻量弹窗方案；范围为位置重命名、修改所属区域、位置列表按区域筛选；不新增数据库字段、不修改 RLS、不加入家庭共享/照片/扫码/支付。
- 2026-07-04 位置编辑与位置筛选代码证据：新增 `updateInventoryLocation`，按 `id + household_id` 更新 `locations.name` 和 `locations.area_id`；新增 `filterInventoryLocations`，支持全部区域、指定区域和未分区筛选；`/app` 位置列表右侧新增“编辑”入口，点击后打开轻量弹窗，可修改名称和所属区域；位置列表上方新增“显示区域”筛选，筛选只影响位置列表，不影响右侧物品清单筛选。
- 2026-07-04 位置编辑与位置筛选测试证据：先运行针对 `updateInventoryLocation` 和 `filterInventoryLocations` 的失败测试，失败原因为新函数不存在；实现后运行 `npm test -- src/features/inventory/inventory-actions.test.ts src/features/inventory/dashboard-data.test.ts`，exit code 0，2 个测试文件 / 32 个测试通过。
- 2026-07-04 位置编辑与位置筛选本地验证证据：执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 45 个测试；执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。
- 2026-07-04 浏览器未登录验证证据：本地服务 `http://127.0.0.1:3000` 启动成功；打开 `http://127.0.0.1:3000/app`，页面标题为 `Home Inventory`，显示“请先登录”和“去登录”，无页面 console error。
- 2026-07-04 物品表单区域优先选择开工记录：范围为新增/编辑物品表单先选择区域，再选择该区域下的位置；未选区域时位置下拉不展示全部位置；切换区域时清空已选位置；选择“未分区”时只显示未分区位置；不新增数据库字段、不修改 RLS、不加入家庭共享/照片/扫码/支付。
- 2026-07-04 物品表单区域优先选择代码证据：`/app` 物品表单新增前端 `areaId` 状态和“区域”下拉；位置下拉改为由当前区域筛选后的 `itemFormLocations` 驱动；保存物品仍复用现有 `createInventoryItem` / `updateInventoryItem` 和 `items.location_id`；新增 `getLocationAreaFilterValue` 用于编辑已有物品时从当前位置推导区域或“未分区”。
- 2026-07-04 物品表单区域优先选择测试证据：先运行 `npm test -- src/features/inventory/dashboard-data.test.ts`，失败原因为 `getLocationAreaFilterValue is not a function`；实现后同一命令 exit code 0，1 个测试文件 / 18 个测试通过。
- 2026-07-04 物品表单区域优先选择本地验证证据：执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 48 个测试；执行 `npm run lint`，exit code 0；执行 `npm run build`，首次发现 `startEditItem` 缺少 ready 状态收窄并已补 guard，复跑 exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。
- 2026-07-04 移动端物品搜索置顶开工记录：用户反馈手机端搜索物品是最高频入口，不应被概览、区域和位置管理压到下方；范围为移动端 `/app` 主布局顺序调整，桌面端保持左侧管理、右侧物品清单；不新增数据库字段、不修改 RLS、不改变家庭共享/照片/扫码/支付边界。
- 2026-07-04 移动端物品搜索置顶代码证据：`src/features/inventory/AppDashboard.tsx` 主布局保留同一 DOM 结构，仅为侧栏增加 `order-2 xl:order-1`，为物品清单增加 `order-1 xl:order-2`；手机端优先显示物品清单和搜索/筛选入口，`xl` 桌面端恢复原有左右栏顺序。
- 2026-07-04 移动端物品搜索置顶本地验证证据：执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6；执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 48 个测试；确认本地开发服务监听 `0.0.0.0:3000`，手机仍可通过局域网地址访问。

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

## 当前剩余未验证项

- 真实浏览器中完整走一遍新增区域、带区域新增位置、新增物品、搜索、筛选、编辑、删除。
- 移动端完整操作体验和截图证据。
- 位置编辑弹窗：重命名位置、修改所属区域、改为未分区、保存失败提示。
- 位置列表区域筛选：全部区域、指定区域、无匹配位置空状态。
- 真实登录后的浏览器验收：打开编辑位置弹窗、保存位置名称、修改所属区域、按区域筛选位置列表、刷新后仍保存。
- 真实登录后的浏览器验收：新增/编辑物品时先选择区域，再确认位置下拉只显示该区域或未分区下的位置。
- 真实手机端验收：登录后确认 `/app` 首屏优先看到物品清单、搜索框、区域筛选和位置筛选。

## 停止条件

- 不能在没有 RLS 权限策略和负例验证时声明安全。
- 不能在没有 `.env.example` 和密钥边界时接入真实云服务。
- 不能在没有用户确认技术选型时 scaffold 代码。
- 不能把 mock 数据包装成真实 Supabase 功能。
- 不能把真实 Supabase secret、service role key 或用户数据提交到 Git。
