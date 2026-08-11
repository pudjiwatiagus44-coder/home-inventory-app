# Home Inventory App

云端家庭物品管理应用。当前处于 MVP 基础搭建阶段。

## 技术路线

- Next.js
- TypeScript
- 阿里云自托管
- 自有 PostgreSQL
- 自有邮箱密码认证与服务端权限校验
- PWA first
- Android 内测 APK

## 本地启动

```powershell
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`，按自托管 PostgreSQL、session、SMTP 等占位配置本地环境。

不要把数据库密码、SMTP 授权码、session secret、AI key 或其他 secret 写入公开变量或提交到仓库。

## 真源文档

内部开发真源在 `dev-docs/`。实现前先阅读：

- `dev-docs/project-brief.md`
- `dev-docs/technical-selection.md`
- `dev-docs/architecture.md`
- `dev-docs/database-design.md`
- `dev-docs/acceptance.md`

Supabase 历史资料已归档到 `dev-docs/archive/`，默认开发、搜索和调试都不要进入归档目录。
