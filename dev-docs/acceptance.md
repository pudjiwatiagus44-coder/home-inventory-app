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
