# Deployment Route Truth

## 决策状态

- 决策日期：2026-07-04。
- 用户确认：第一版先使用免费层部署。
- 发布目标：先满足用户自己在任意网络、任意设备登录使用；不是公开商业生产发布。
- 当前结论：前端部署到 Vercel 免费层，认证和数据库继续使用 Supabase 免费层。

## 推荐部署路线

```text
GitHub repository
  -> Vercel
  -> Next.js Web/PWA
  -> Supabase Auth + Supabase Postgres + RLS
```

- 前端托管：Vercel。
- 数据库：Supabase Postgres。
- 登录：Supabase Auth，邮箱 + 密码。
- 权限：Supabase RLS 继续作为用户数据隔离硬边界。
- 域名：第一步可先使用 Vercel 自动生成域名；自定义域名后续再评估。

## 为什么适合本项目

- 当前代码已经是 Next.js + TypeScript。
- 当前数据和认证已经围绕 Supabase 设计。
- 免费层足够验证“电脑关机后也能在线访问”的需求。
- 不需要用户维护 VPS、HTTPS、数据库进程、安全补丁和备份脚本。
- 符合第一版低成本、低运维、快速验证的产品阶段。

## 暂不选择的路线

- 暂不购买 VPS 自行部署：运维成本高，需要自己处理 HTTPS、Node 进程、数据库、备份、系统安全更新和宕机恢复。
- 暂不自建 PostgreSQL：第一版没有必要承担数据库运维。
- 暂不迁移 Firebase：当前 Supabase schema、RLS 和代码路径已经成型，切换会增加无关风险。
- 暂不做原生 App 发布：第一版仍然是 Web/PWA。

## 免费层边界

- 免费层用于个人使用、MVP 验证和小规模试用。
- 免费层不能承诺商业级 SLA、长期备份、稳定额度或大量用户访问。
- 如果开始给真实外部用户长期使用，必须重新评估付费层、备份、监控、隐私政策和恢复方案。
- Supabase 免费层的备份能力不能当成完整生产备份策略；重要数据上线前需要另行设计导出或升级方案。

## 环境变量和密钥

Vercel 只配置 public client 所需变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

禁止配置或提交：

- Supabase service role key。
- 数据库密码。
- 私钥。
- 真实用户数据导出文件。

`.env.local` 只用于本地开发，不能提交到 Git。

## Supabase Auth 配置

拿到 Vercel 域名后，必须在 Supabase Auth URL 配置中更新：

- Site URL：Vercel 生产域名。
- Redirect URLs：Vercel 生产域名、必要的 preview 域名、本地开发地址。

如果后续使用自定义域名，需要同步更新 Supabase Auth 回跳配置。

## 发布前检查清单

- `npm test` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- Git 工作区没有误提交 `.env.local`、密钥、日志或真实用户数据。
- Vercel 环境变量已配置。
- Supabase Auth Site URL 和 Redirect URLs 已配置。
- 生产域名访问 `/login` 和 `/app` 正常。
- 未登录访问 `/app` 会被要求登录。
- 登录后可以读取当前用户自己的数据。
- 用户 A/B 数据隔离仍然通过真实 Supabase 负例验证。

## 回滚方案

- 前端：使用 Vercel 上一个成功 deployment 回滚。
- 数据库：第一版不在部署时自动执行破坏性 migration。
- 配置：若登录回跳错误，优先恢复 Supabase Auth URL 配置到上一个可用值。

## 当前未验证项

- Vercel 项目尚未创建。
- GitHub 远程仓库状态尚未确认。
- Vercel 免费层构建和访问尚未验证。
- Supabase Auth 生产回跳地址尚未配置。
- 生产 URL 上的完整用户登录和 CRUD 验收尚未完成。
