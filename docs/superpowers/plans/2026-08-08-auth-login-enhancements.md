# 登录页增强与密码重置实施计划（Web/PWA + Android 内测版）

> **For agentic workers:** 按本计划逐任务实施，每个任务先写失败测试（TDD）再实现，通过后提交，最后全量验证并回写真源。
> 设计真源：`docs/superpowers/specs/2026-08-08-auth-login-enhancements-design.md`。
> 状态：待用户最终确认设计后开始实施；部署验证需要用户提供 QQ 邮箱 SMTP 授权码（配置到服务器，不进仓库）。

## 背景・目的

- 用户反馈登录页缺少「忘记密码」「记住密码」，Android 缺少注册入口。
- 目标：Web 与 Android 补齐自助密码重置（邮件发重置链接，网页 `/reset-password?token=...` 设新密码）；Android 增加注册入口；「记住密码」= 记住邮箱（默认勾选，不保存密码）；登录态保持逻辑不变。
- 预期成果：用户忘记密码可自助恢复；Android 用户可直接注册；登录页体验补齐，安全边界（防枚举、一次性令牌、重置后全部会话作废）由服务端强制。

## 現状整理

- Web：`src/app/login/page.tsx` + `src/features/auth/AuthForm.tsx`，有登录/注册切换，无忘记密码、无记住邮箱。
- 服务端：`src/app/api/auth/{login,register,logout}/route.ts` 薄路由 → `createRouteAuthService()`（`src/app/api/auth/route-helpers.ts`）；`src/server/auth/auth-service.ts` + `postgres-auth-repository.ts`；bcrypt 密码哈希（`password-security.ts`），session token HMAC-SHA256 哈希入库（`session-security.ts`，`SESSION_SECRET`）。
- 数据库：`users`、`auth_sessions` 等（`dev-docs/sql/mainland_initial_schema.sql`）；无 `password_reset_tokens` 表。
- Android：`ui/login/LoginScreen.kt` 只有邮箱+密码+登录；`data/repository/AuthRepository.kt` 只有 login/logout；`core/session/SessionStore.kt` 保存 session cookie；`ui/AppRoot.kt` 持有登录状态并接线 LoginScreen；`data/remote/dto.kt` 已有 `AuthResponse`。
- 依赖：无 nodemailer；`.env.example` 无 SMTP 配置。
- 测试体系：Web 用 Vitest（`npm test` / `npm run lint` / `npm run build`）；Android 用 `gradle :app:testDebugUnitTest :app:assembleDebug`。

## 設計

### 文件构成

```text
新增：
dev-docs/sql/password_reset_self_hosted.sql
src/server/mail/smtp-mailer.ts
src/server/mail/smtp-mailer.test.ts
src/server/auth/password-reset-service.ts
src/server/auth/password-reset-service.test.ts
src/server/auth/forgot-password-rate-limiter.ts
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/reset-password/route.ts
src/app/api/auth/password-reset-routes.test.ts
src/app/forgot-password/page.tsx
src/app/reset-password/page.tsx
src/features/auth/ForgotPasswordForm.tsx
src/features/auth/ResetPasswordForm.tsx
src/features/auth/forgot-password-client.ts
src/features/auth/forgot-password-client.test.ts
src/features/auth/reset-password-client.ts
src/features/auth/reset-password-client.test.ts
src/features/auth/remembered-email.ts
src/features/auth/remembered-email.test.ts
android/app/src/main/java/com/homeinventory/app/core/session/RememberedEmailStore.kt
android/app/src/main/java/com/homeinventory/app/ui/login/ForgotPasswordDialog.kt

修改：
package.json / package-lock.json（nodemailer + @types/nodemailer）
.env.example（SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / EMAIL_FROM / RESET_BASE_URL）
src/server/auth/auth-service.ts（resetPassword、revokeAllSessionsForUser）
src/server/auth/postgres-auth-repository.ts（令牌与会话新方法）
src/app/api/auth/route-helpers.ts（错误映射：InvalidResetTokenError → 400、SMTP 未配置 → 501）
src/features/auth/AuthForm.tsx（忘记密码链接 + 记住邮箱复选框）
android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt（register / forgotPassword）
android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt（RegisterRequest / ForgotPasswordRequest）
android/app/src/main/java/com/homeinventory/app/data/repository/AuthRepository.kt（register / forgotPassword）
android/app/src/main/java/com/homeinventory/app/ui/login/LoginScreen.kt（注册模式 / 忘记密码 / 记住邮箱）
android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt（RememberedEmailStore 接线、注册与忘记密码回调）
android/app/src/test/java/com/homeinventory/app/data/repository/AuthRepositoryTest.kt
android/app/src/test/java/com/homeinventory/app/data/repository/TestApiStub.kt
dev-docs/acceptance.md（实施证据）
dev-docs/README.md（当前阶段同步）
```

### 仕様（摘要）

- 表：`password_reset_tokens`（user_id、token_hash 唯一、expires_at、used_at、created_at）；token 32 字节 base64url，只存 HMAC-SHA256 哈希（`SESSION_SECRET`），30 分钟过期、一次性、同用户单令牌。
- 接口：`POST /api/auth/forgot-password`（`{email}`，邮箱不存在也返回 `{ok:true}`，限频 5 次/小时/邮箱+IP）；`POST /api/auth/reset-password`（`{token,password}`，改密 + 标记令牌已用 + 作废该用户全部 auth_sessions）。
- 邮件：nodemailer + SMTP（QQ 465/SSL），标题「重置你的家庭物品密码」，链接 `${RESET_BASE_URL}/reset-password?token=...`。
- Web：`/forgot-password`、`/reset-password` 页面；AuthForm 增加忘记密码链接与记住邮箱（localStorage `home_inventory_remembered_email`）。
- Android：登录/注册切换 + 确认密码；忘记密码弹窗；记住邮箱复选框（EncryptedSharedPreferences，只存邮箱）；注册成功即登录进入 App。
- 详细设计见 spec 文件；权限边界全部在服务端校验。

## 実装ステップ

### Phase 1: 数据库 migration

#### Task 1: password_reset_tokens migration

**Files:** Create `dev-docs/sql/password_reset_self_hosted.sql`

- [ ] **Step 1: 创建 migration 文件**，内容按 spec「数据库」章节 SQL 草案。
- [ ] **Step 2: 校验 SQL 语法**（本机 PostgreSQL 运行中时）：`psql "postgres://postgres@localhost:5432/home_inventory_test" -f dev-docs/sql/password_reset_self_hosted.sql`
  Expected: `CREATE TABLE` / `CREATE INDEX` 输出，无报错；本机 PostgreSQL 未启动则跳过并标记「未验证」。
- [ ] **Step 3: 提交**：`git add dev-docs/sql/password_reset_self_hosted.sql && git commit -m "feat: password reset tokens migration"`

### Phase 2: 服务端邮件与密码重置服务

#### Task 2: nodemailer 依赖 + SMTP 邮件器

**Files:** Modify `package.json`；Create `src/server/mail/smtp-mailer.ts`、`src/server/mail/smtp-mailer.test.ts`；Modify `.env.example`

- [ ] **Step 1: 安装依赖**：`npm install nodemailer && npm install -D @types/nodemailer`
- [ ] **Step 2: `.env.example` 增加**：`SMTP_HOST=`、`SMTP_PORT=465`、`SMTP_SECURE=true`、`SMTP_USER=`、`SMTP_PASS=`、`EMAIL_FROM=`、`RESET_BASE_URL=https://homestorag.xyz`（注释：服务器端专用，禁止 NEXT_PUBLIC_ 前缀，禁止提交真实值）。
- [ ] **Step 3: 写失败测试** `smtp-mailer.test.ts`：注入 `sendMailImpl`（无真实网络）验证：① 未配置 SMTP_USER/SMTP_PASS 抛 `SmtpNotConfiguredError`；② 发送成功返回 `{ok:true}` 且邮件含正确 to/标题/重置链接；③ 上游抛错时返回发送失败错误。
- [ ] **Step 4: 运行确认失败**：`npm test -- src/server/mail/smtp-mailer.test.ts`（Expected: FAIL，模块不存在）。
- [ ] **Step 5: 实现** `smtp-mailer.ts`：`createSmtpMailer({ transporterFactory? })`；`sendPasswordResetEmail({ to, resetUrl })`；SMTP 配置从 `process.env` 读取（`SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/EMAIL_FROM`），`EMAIL_FROM` 默认 `SMTP_USER`；`RESET_BASE_URL` 默认 `https://homestorag.xyz`。
- [ ] **Step 6: 运行确认通过**：`npm test -- src/server/mail/smtp-mailer.test.ts`（Expected: PASS）。
- [ ] **Step 7: 提交**：`git add package.json package-lock.json src/server/mail dev-docs/../.env.example`（注意 .env.example 无真实值）`&& git commit -m "feat: smtp mailer for password reset"`

#### Task 3: 密码重置服务

**Files:** Create `src/server/auth/password-reset-service.ts`、`src/server/auth/password-reset-service.test.ts`、`src/server/auth/forgot-password-rate-limiter.ts`

- [ ] **Step 1: 写失败测试** `password-reset-service.test.ts`（注入 repository/mailer/hash/clock 依赖）：
  - requestPasswordReset：邮箱存在 → 生成令牌、旧令牌作废、邮件发送成功；邮箱不存在 → 仍返回成功且不发邮件不写库；邮件发送失败 → 抛错。
  - resetPassword：有效令牌改密成功并标记 used、作废该用户全部会话；无效/已用/过期令牌 → `InvalidResetTokenError`；密码 < 8 位 → 校验错误。
- [ ] **Step 2: 运行确认失败**：`npm test -- src/server/auth/password-reset-service.test.ts`。
- [ ] **Step 3: 实现**：
  - `forgot-password-rate-limiter.ts`：按 `normalizedEmail|ip` 的滑动窗口限频（5 次/小时），可注入 `now` 便于测试。
  - `password-reset-service.ts`：`requestPasswordReset(email)`、`resetPassword({token,password})`；令牌生成复用 `createSessionToken`，哈希复用 `hashSessionToken`（`SESSION_SECRET`）；密码校验复用 `MIN_PASSWORD_LENGTH`。
- [ ] **Step 4: 运行确认通过**：`npm test -- src/server/auth/password-reset-service.test.ts`。
- [ ] **Step 5: 提交**：`git add src/server/auth/password-reset-service.ts src/server/auth/password-reset-service.test.ts src/server/auth/forgot-password-rate-limiter.ts && git commit -m "feat: password reset service"`

#### Task 4: auth-service 与 repository 扩展

**Files:** Modify `src/server/auth/auth-service.ts`、`src/server/auth/postgres-auth-repository.ts`

- [ ] **Step 1: 扩展 AuthRepository 接口**：`createPasswordResetToken`、`findPasswordResetTokenByHash`（join users，返回 userId/email/status/expiresAt/usedAt）、`markPasswordResetTokenUsed`、`revokeUnusedPasswordResetTokensByUserId`、`revokeAllSessionsByUserId`、`updateUserPassword`。
- [ ] **Step 2: PostgreSQL 实现**：按 `mainland_initial_schema.sql` 的表结构与现有查询风格实现；`updateUserPassword` 更新 `users.password_hash`；`revokeAllSessionsByUserId` 对 `auth_sessions` 置 `revoked_at = now()`。
- [ ] **Step 3: auth-service 增加**：`resetPassword`（组合令牌校验 + 改密 + 标记 + 作废会话）；`revokeAllSessionsForUser` 暴露给重置流程使用。
- [ ] **Step 4: 更新既有单测/集成测试**：`postgres-auth-repository.integration.test.ts` 增加新方法用例（本机 PostgreSQL 可用时）；`auth-service` 相关测试覆盖 resetPassword 分支。
- [ ] **Step 5: 运行**：`npm test`（Expected: 全部通过，PostgreSQL 集成用例未配置时跳过）；`npm run lint`（exit 0）；`npm run build`（exit 0）。
- [ ] **Step 6: 提交**：`git add src/server/auth && git commit -m "feat: password reset repository and service wiring"`

### Phase 3: API 路由

#### Task 5: forgot-password 路由（含限频）

**Files:** Create `src/app/api/auth/forgot-password/route.ts`；Modify `src/app/api/auth/route-helpers.ts`；Create `src/app/api/auth/password-reset-routes.test.ts`

- [ ] **Step 1: 写失败测试**：`password-reset-routes.test.ts` 用注入的 service/mailer 验证：邮箱不存在也返回 200 `{ok:true}`；SMTP 未配置返回 501；发送失败返回 500；超限返回 429；非法邮箱返回 400。
- [ ] **Step 2: 实现路由**：`POST` 读取 `{email}` → 规范化 → 限频检查 → `passwordResetService.requestPasswordReset(email)` → 返回 `{ok:true}`。
- [ ] **Step 3: route-helpers 错误映射**：`SmtpNotConfiguredError` → 501；`SmtpSendFailedError` → 500；`RateLimitExceededError` → 429。
- [ ] **Step 4: 运行确认通过**：`npm test -- src/app/api/auth/password-reset-routes.test.ts`；`npm run lint`。
- [ ] **Step 5: 提交**：`git add src/app/api/auth && git commit -m "feat: forgot-password api route"`

#### Task 6: reset-password 路由

**Files:** Create `src/app/api/auth/reset-password/route.ts`（并入 `password-reset-routes.test.ts`）

- [ ] **Step 1: 补测试**：有效令牌改密返回 200；无效/已用/过期令牌返回 400「重置链接无效或已过期」；密码 < 8 位返回 400；成功后旧 session 访问返回 401（由 getCurrentUser 用例覆盖）。
- [ ] **Step 2: 实现路由**：`POST` 读取 `{token,password}` → `passwordResetService.resetPassword` → `{ok:true}`；`InvalidResetTokenError` → 400。
- [ ] **Step 3: 运行确认通过**：`npm test -- src/app/api/auth/password-reset-routes.test.ts`。
- [ ] **Step 4: 提交**：`git add src/app/api/auth && git commit -m "feat: reset-password api route"`

### Phase 4: Web 端

#### Task 7: 忘记密码页面

**Files:** Create `src/app/forgot-password/page.tsx`、`src/features/auth/ForgotPasswordForm.tsx`、`src/features/auth/forgot-password-client.ts`、`src/features/auth/forgot-password-client.test.ts`

- [ ] **Step 1: 客户端测试**：注入 fetcher 验证提交成功/失败消息映射。
- [ ] **Step 2: 实现客户端与表单**：邮箱校验（复用邮箱正则逻辑）；提交后统一显示「若邮箱已注册，重置链接已发送」；返回登录链接。
- [ ] **Step 3: 页面接线**：`/forgot-password` 布局与 `/login` 一致（返回首页 + 表单）。
- [ ] **Step 4: 验证**：`npm test -- src/features/auth/forgot-password-client.test.ts`；`npm run build` 包含新路由。
- [ ] **Step 5: 提交**：`git add src/app/forgot-password src/features/auth && git commit -m "feat(web): forgot password page"`

#### Task 8: 重置密码页面

**Files:** Create `src/app/reset-password/page.tsx`、`src/features/auth/ResetPasswordForm.tsx`、`src/features/auth/reset-password-client.ts`、`src/features/auth/reset-password-client.test.ts`

- [ ] **Step 1: 客户端测试**：注入 fetcher 验证成功跳转与错误消息。
- [ ] **Step 2: 实现**：从 `searchParams.token` 读令牌（缺失时显示「重置链接无效」）；新密码 + 确认密码（≥ 8 位、两次一致）；成功后 `router.push("/login?reset=1")`，登录页读取 `reset=1` 显示「密码已重置，请使用新密码登录」。
- [ ] **Step 3: 验证**：`npm test -- src/features/auth/reset-password-client.test.ts`；`npm run build`。
- [ ] **Step 4: 提交**：`git add src/app/reset-password src/features/auth && git commit -m "feat(web): reset password page"`

#### Task 9: AuthForm 忘记密码链接 + 记住邮箱

**Files:** Create `src/features/auth/remembered-email.ts`、`src/features/auth/remembered-email.test.ts`；Modify `src/features/auth/AuthForm.tsx`

- [ ] **Step 1: remembered-email 测试**：get/set/clear（localStorage 可注入）。
- [ ] **Step 2: 实现 helper**：key `home_inventory_remembered_email`；仅存邮箱，不存密码。
- [ ] **Step 3: AuthForm 改造**：登录模式「邮箱」下方加「忘记密码？」链接（`/forgot-password`）；表单底部加「记住邮箱」复选框（默认勾选）；挂载时读取并填充邮箱；提交成功后勾选则保存邮箱、未勾选则清除；切换登录/注册模式共享邮箱状态。
- [ ] **Step 4: 验证**：`npm test -- src/features/auth/remembered-email.test.ts`；`npm run lint`；`npm run build`。
- [ ] **Step 5: 提交**：`git add src/features/auth && git commit -m "feat(web): forgot password link and remember email"`

### Phase 5: Android 端

#### Task 10: Android API/DTO/Repository（register + forgotPassword）

**Files:** Modify `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`、`android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`、`android/app/src/main/java/com/homeinventory/app/data/repository/AuthRepository.kt`、`android/app/src/test/java/com/homeinventory/app/data/repository/AuthRepositoryTest.kt`、`android/app/src/test/java/com/homeinventory/app/data/repository/TestApiStub.kt`

- [ ] **Step 1: dto**：`RegisterRequest(email, password)`、`ForgotPasswordRequest(email)`。
- [ ] **Step 2: API**：`@POST("api/auth/register") suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>`；`@POST("api/auth/forgot-password") suspend fun forgotPassword(@Body request: ForgotPasswordRequest): Response<ApiEnvelope<Unit>>`。
- [ ] **Step 3: Repository**：`register(email, password)`（成功后保存 set-cookie，行为同 login）、`forgotPassword(email)`（返回成功，不区分邮箱是否存在）。
- [ ] **Step 4: 测试**：AuthRepositoryTest 增加 register 成功保存 cookie、register 失败返回错误消息、forgotPassword 成功/失败用例；TestApiStub 增加对应 stub。
- [ ] **Step 5: 验证**（`android` 目录）：`gradle :app:testDebugUnitTest --no-daemon --quiet`（Expected: 全通过）。
- [ ] **Step 6: 提交**：`git add android/app/src/main/java/com/homeinventory/app/core/network android/app/src/main/java/com/homeinventory/app/data android/app/src/test && git commit -m "feat(android): register and forgot password api"`

#### Task 11: LoginScreen 注册/忘记密码/记住邮箱 + AppRoot 接线

**Files:** Create `android/app/src/main/java/com/homeinventory/app/core/session/RememberedEmailStore.kt`、`android/app/src/main/java/com/homeinventory/app/ui/login/ForgotPasswordDialog.kt`；Modify `android/app/src/main/java/com/homeinventory/app/ui/login/LoginScreen.kt`、`android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`

- [ ] **Step 1: RememberedEmailStore**：接口（load/save/clear）+ `EncryptedSharedPreferences` 实现；App 类注入或 AppRoot 内创建。
- [ ] **Step 2: LoginScreen**：`mode: LoginMode`（sign-in/sign-up）切换；注册模式显示确认密码并前端校验（邮箱格式、密码 ≥ 8 位、两次一致）；「忘记密码？」文字按钮 → `ForgotPasswordDialog`；「记住邮箱」复选框默认勾选。
- [ ] **Step 3: AppRoot 接线**：启动读取 RememberedEmailStore 回填邮箱；登录/注册成功：勾选则保存邮箱、未勾选则清除；注册成功同样设置 `isLoggedIn = true`；forgotPassword 回调调用 repository 并显示统一提示。
- [ ] **Step 4: 测试**：RememberedEmailStore 单测（可用 Fake 实现验证逻辑）；既有 AuthRepositoryTest 保持通过。
- [ ] **Step 5: 验证**（`android` 目录）：`gradle :app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet`（Expected: BUILD SUCCESSFUL）。
- [ ] **Step 6: 提交**：`git add android/app/src/main/java/com/homeinventory/app && git commit -m "feat(android): login screen register, forgot password and remember email"`

### Phase 6: 全量验证与收口

#### Task 12: 全量验证

- [ ] **Step 1: Web**：`npm test`（全部通过）；`npm run lint`（exit 0）；`npm run build`（exit 0，路由包含 `/forgot-password`、`/reset-password`、`/api/auth/forgot-password`、`/api/auth/reset-password`）。
- [ ] **Step 2: Android**（`android` 目录）：`gradle :app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet`（BUILD SUCCESSFUL）。
- [ ] **Step 3: 记录结果**，未验证项（真实 SMTP、真实浏览器/真机流程）明确标记。

#### Task 13: 真源回写与部署注意

- [ ] **Step 1: 更新 `dev-docs/acceptance.md`**：追加「2026-08-08 登录页增强与密码重置实施证据」，记录 migration 路径、接口行为、单测/构建结果、真实 SMTP 与浏览器/真机待验证项。
- [ ] **Step 2: 更新 `dev-docs/README.md`**：当前阶段补充密码重置设计与实施计划路径；真源索引加入本 spec/plan。
- [ ] **Step 3: 提交**：`git add dev-docs && git commit -m "docs: auth login enhancements implementation evidence"`

## 並列実行戦略

- Phase 1 → Phase 2 → Phase 3 顺序执行（服务端是 Web/Android 共同依赖）。
- Phase 4（Web 端）与 Phase 5（Android 端）可并行（不同文件树，互不依赖）。
- Phase 6 收口在两者完成后执行。

## 検証方法

- 每个 Task 按 TDD 流程：先跑失败测试 → 实现 → 跑通过 → 提交。
- Web 全量：`npm test`、`npm run lint`、`npm run build` 均通过。
- Android 全量：`gradle :app:testDebugUnitTest :app:assembleDebug` 通过。
- 验收清单对照 spec「验收标准」：服务端单测覆盖防枚举、限频、一次性/过期令牌、重置后会话作废；Android 单测覆盖注册/忘记密码/记住邮箱。
- 真实环境（部署后）：发一封真实测试邮件；用测试账号走完整重置流程；记录证据到 `dev-docs/acceptance.md`。

## 将来の拡張

- 注册后邮箱验证（当前不在范围内）。
- 忘记密码限频持久化（多实例/多进程时改用数据库或 Redis）。
- 切换其他邮件服务商（163、阿里云企业邮箱）只改 SMTP 配置。
- 验证码邮件方案（当前已确认用链接）。

## 部署注意（实施后、上线前）

- 服务器执行 `dev-docs/sql/password_reset_self_hosted.sql`。
- `/etc/home-inventory-app/app.env` 增加 SMTP 配置（QQ 邮箱 + 授权码）与 `RESET_BASE_URL`；重启 `home-inventory-app.service`。
- 凭据不进仓库；`.env.example` 只保留占位。
- 上线后用测试账号走完整重置流程并记录证据。
