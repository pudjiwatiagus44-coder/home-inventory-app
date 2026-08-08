# 登录页增强与密码重置设计（Web/PWA + Android 内测版）

> 状态：2026-08-08 用户已确认（含技术设计），开始实施。
> 真源同步：`dev-docs/project-brief.md`、`dev-docs/technical-selection.md`、`dev-docs/architecture.md`、`dev-docs/database-design.md`、`dev-docs/acceptance.md`。

## 背景与目标

用户反馈：登录页缺少「忘记密码」和「记住密码」；Android 登录页没有注册入口。目标：

- Web 与 Android 补齐自助密码重置：忘记密码 → 邮件重置链接 → 网页设置新密码。
- Android 登录页补齐注册入口（复用现有邮箱 + 密码注册接口，注册成功即登录进入 App）。
- 「记住密码」实现为「记住邮箱」：登录页复选框默认勾选，下次打开自动填充邮箱，不保存密码。
- 现有登录态保持逻辑不变（App 重启不要求重新登录；Web session cookie 逻辑不变）。

## 已确认决策（2026-08-08 对话确认）

1. 忘记密码：接邮箱发送重置链接。服务器配置 SMTP（QQ 邮箱 `smtp.qq.com` + 授权码），凭据只存服务器 `app.env`，不进仓库。
2. 送达方式：邮件发送重置链接，用户在网页 `/reset-password?token=...` 设置新密码；一套实现覆盖 App 与 Web 用户。
3. 记住密码 = 记住邮箱：登录页复选框默认勾选；勾选 = 下次打开自动填邮箱；不勾选 = 不保存邮箱；登录态保持逻辑不变。
4. Android 登录页新增「注册」入口：切换为注册表单（邮箱/密码/确认密码），走现有注册接口。
5. 边界：邮件仅用于密码重置（家庭共享邀请仍不发邮件、走微信渠道）；不发送营销邮件；第一版不做注册邮箱验证邮件。

## 现状核实（2026-08-08 代码）

- Web：`src/app/login/page.tsx` + `src/features/auth/AuthForm.tsx`，有登录/注册切换，无忘记密码、无记住邮箱。
- 服务端：`POST /api/auth/login|register|logout`（`src/app/api/auth/*`），自有认证（`users` + `auth_sessions`），bcrypt 密码哈希，session token 以 HMAC-SHA256 哈希入库；无 `password_reset_tokens` 表。
- Android：`ui/login/LoginScreen.kt` 只有邮箱 + 密码 + 登录按钮；`data/repository/AuthRepository.kt` 只有 login/logout；`core/session/SessionStore.kt` 保存 session cookie（登录态保持）。
- 依赖：当前无 nodemailer；`.env.example` 无 SMTP 配置项。

## 服务端设计

### 数据库（自托管路线）

`dev-docs/sql/password_reset_self_hosted.sql`：

```sql
create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint password_reset_tokens_token_hash_unique unique (token_hash),
  constraint password_reset_tokens_token_hash_not_blank check (char_length(token_hash) > 0),
  constraint password_reset_tokens_expires_after_created check (expires_at > created_at)
);

create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens(user_id);
create index if not exists password_reset_tokens_expires_at_idx on password_reset_tokens(expires_at);

grant all privileges on password_reset_tokens to home_inventory_app;
```

安全规则：

- token 为 32 字节 `base64url` 随机串（复用 `createSessionToken` 的生成方式）。
- 数据库只存 HMAC-SHA256 哈希（复用 `hashSessionToken`，密钥 `SESSION_SECRET`）；不落明文。
- 30 分钟过期（`expires_at`）；一次性使用（`used_at` 非空即失效）。
- 同一用户同一时间只保留一个未使用令牌：生成新令牌前把该用户未使用的旧令牌标记为 `used_at = now()`。

### 配置项

`.env.example` 增加占位，服务器 `/etc/home-inventory-app/app.env` 配置真实值：

```text
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<发信 QQ 邮箱>
SMTP_PASS=<SMTP 授权码>
EMAIL_FROM=<发信邮箱，默认取 SMTP_USER>
RESET_BASE_URL=https://homestorag.xyz
```

### 服务层（`src/server/auth/password-reset-service.ts`）

- `requestPasswordReset(email)`：
  - 规范化邮箱、查用户；**邮箱不存在也返回成功**（防账号枚举）。
  - 存在则：作废该用户未使用的旧令牌 → 生成新令牌 → 哈希入库 → 经 SMTP 发送重置链接邮件。
  - SMTP 未配置 → 抛配置错误（API 映射 501）；发送失败 → 抛发送错误（API 映射 500），便于运维发现故障。
- `resetPassword({ token, password })`：
  - 校验密码 ≥ 8 位（复用 `MIN_PASSWORD_LENGTH`）。
  - 按哈希查令牌（join users）：无效/已用/过期 → 抛 `InvalidResetTokenError`，统一提示「重置链接无效或已过期」。
  - 更新 `users.password_hash`（bcrypt 重哈希）→ 标记令牌 `used_at` → 作废该用户全部 `auth_sessions`（`revoked_at = now()`）。
- 限频：`POST /api/auth/forgot-password` 按规范化邮箱 + IP 滑动窗口限 5 次/小时（自托管单实例内存实现即可），超限返回 429。

### API

| 接口 | 方法/路径 | 请求 | 成功响应 | 失败 |
| --- | --- | --- | --- | --- |
| 发送重置链接 | `POST /api/auth/forgot-password` | `{ email }` | `200 { ok: true }`（邮箱不存在也相同） | 429 限频；501 SMTP 未配置；500 发送失败 |
| 完成重置 | `POST /api/auth/reset-password` | `{ token, password }` | `200 { ok: true }` | 400 无效/已用/过期令牌或密码不合法；501 数据库未配置 |

### 邮件内容

- 标题：`重置你的家庭物品密码`
- 正文：说明在 30 分钟内打开链接设置新密码；链接 = `${RESET_BASE_URL}/reset-password?token=${token}`；不含明文密码和其他用户信息。

## Web 端设计

- 新增 `/forgot-password` 页面（`src/app/forgot-password/page.tsx` + `src/features/auth/ForgotPasswordForm.tsx`）：输入邮箱 → 提交 → 统一提示「若邮箱已注册，重置链接已发送」。
- 新增 `/reset-password` 页面（`src/app/reset-password/page.tsx` + `src/features/auth/ResetPasswordForm.tsx`）：从 `searchParams.token` 读令牌，输入新密码（≥ 8 位）+ 确认密码 → 提交 → 成功后跳转 `/login` 并提示「密码已重置，请使用新密码登录」。
- `AuthForm.tsx` 登录模式增加「忘记密码？」链接（指向 `/forgot-password`）；增加「记住邮箱」复选框（默认勾选）。
- 记住邮箱：`src/features/auth/remembered-email.ts`，localStorage key `home_inventory_remembered_email`；勾选保存邮箱、取消清除；加载时自动填充邮箱；登录/注册模式共用。
- 客户端封装：`src/features/auth/forgot-password-client.ts`、`src/features/auth/reset-password-client.ts`（支持注入 fetcher 以便单测）。

## Android 端设计

- `core/network/HomeInventoryApi.kt`：新增 `POST api/auth/register`（`RegisterRequest`）、`POST api/auth/forgot-password`（`ForgotPasswordRequest`）；注册响应复用 `AuthResponse`，忘记密码响应用 `ApiEnvelope<Unit>`。
- `data/repository/AuthRepository.kt`：新增 `register(email, password)`（成功后保存 session cookie，行为同 login）、`forgotPassword(email)`（成功即返回，不区分邮箱是否存在）。
- `ui/login/LoginScreen.kt`：
  - 登录 / 注册模式切换；注册模式显示「确认密码」字段，前端校验两次一致、密码 ≥ 8 位，提交走注册接口，成功即进入 App。
  - 「忘记密码？」文字按钮 → `ForgotPasswordDialog`（输入邮箱 → 提交 → 统一提示）。
  - 「记住邮箱」复选框（默认勾选）→ `RememberedEmailStore`。
- 新增 `core/session/RememberedEmailStore.kt`：接口 + `EncryptedSharedPreferences` 实现（只存邮箱，不存密码）；`ui/AppRoot.kt` 接线：启动时读取邮箱回填，登录/注册成功与勾选状态变化时保存/清除。
- 登录态保持逻辑不变（`SessionStore` 不动）。

## 安全边界

- 令牌不落明文：数据库只存 HMAC-SHA256 哈希；即使库泄露也不能直接使用令牌。
- 一次性 + 30 分钟过期 + 同用户单令牌：减少泄露窗口和重放风险。
- 重置后作废该用户全部会话：保证「重置后所有设备强制登出」。
- 防枚举：邮箱不存在也返回成功 + 限频 5 次/小时。
- SMTP 凭据只存服务器环境变量；`.env.example` 只放占位；禁止提交真实授权码。
- 密码强度沿用现有规则（≥ 8 位）；新密码用 bcrypt(12) 重哈希。
- 权限边界在服务端：注册/重置接口本身校验输入；前端按钮显隐不构成权限边界。

## 验收标准

服务端单测：

- forgot-password：邮箱存在/不存在均返回成功；SMTP 未配置返回 501；发送失败返回 500；限频超限返回 429。
- reset-password：有效令牌改密成功；无效/已用/过期令牌返回 400 统一提示；密码 < 8 位返回 400；重置后该用户全部 session 失效（旧 session 访问返回 401）。

Web：

- `/forgot-password` 提交后统一提示；`/reset-password` 有效令牌可改密，成功后跳登录；AuthForm 记住邮箱勾选/取消行为正确。

Android 单测：

- AuthRepository：register 成功保存 cookie；forgotPassword 成功返回；RememberedEmailStore 保存/清除/回填正确。

部署后真实验收（需用户提供 QQ 邮箱 SMTP 授权码）：

- 发送一封真实测试邮件到用户邮箱；用测试账号走完整「忘记密码 → 邮件链接 → 设置新密码 → 旧密码登录失败、新密码登录成功 → 重置前其他设备 session 失效」流程。

## 未决事项

1. 部署验证需要：QQ 邮箱地址 + SMTP 授权码（配置到服务器 `app.env`，不进仓库）。
2. 服务器 SMTP 配置完成后需重启服务生效。
