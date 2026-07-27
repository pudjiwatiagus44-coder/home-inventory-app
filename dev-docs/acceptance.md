# Acceptance Truth

## 2026-07-27 HTTPS 与域名上线证据

- 背景：用户确认已持有阿里云轻量应用服务器，SSL 证书和 Nginx 配置已在上一阶段完成；本轮继续开放 443 端口、同步最新代码、验证 HTTPS 域名访问、补齐 ICP 备案号展示，并把所有处理结果写回真源文档。
- SSL 证书证据：服务器 `/etc/letsencrypt/live/homestorag.xyz/` 存在由 Let's Encrypt 颁发的证书；`openssl x509` 显示证书域名 `DNS:homestorag.xyz, DNS:www.homestorag.xyz`，有效期 `Not Before: Jul 27 08:15:19 2026 GMT`，`Not After: Oct 25 08:15:18 2026 GMT`。
- Nginx 配置证据：当前生效配置 `/etc/nginx/sites-available/home-inventory-app` 监听 `443 ssl`，使用 `/etc/letsencrypt/live/homestorag.xyz/fullchain.pem` 和 `privkey.pem`，并包含 Certbot 提供的 SSL 选项；HTTP（80） server 块通过 Certbot 规则将 `homestorag.xyz` 和 `www.homestorag.xyz` 301 重定向到 HTTPS；历史 HTTP 配置已备份为 `/etc/nginx/sites-available/home-inventory-app.bak.20260727_171323`。
- 防火墙证据：服务器 `ufw` 已重新加载，状态显示 `OpenSSH`、`80/tcp`、`443/tcp` 均 ALLOW；`443/tcp` 规则为本轮新增。
- 安全组证据：用户已确认阿里云控制台安全组开放 `80/tcp`、`443/tcp` 用于 Web 访问，`22/tcp` 用于 SSH；`3000/tcp` 和 `5432/tcp` 不对公网开放。
- 域名解析证据：`nslookup` 显示 `homestorag.xyz` 和 `www.homestorag.xyz` 均解析到 `120.24.93.226`；权威 nameserver 为 `dns21.hichina.com` / `dns22.hichina.com`。
- HTTPS 访问验证：`curl --resolve homestorag.xyz:443:120.24.93.226 https://homestorag.xyz/login` 返回 `HTTP:200`；`curl --resolve www.homestorag.xyz:443:120.24.93.226 https://www.homestorag.xyz/login` 返回 `HTTP:200`；`curl -k https://120.24.93.226/login` 返回 `HTTP:200`（IP 直接访问因证书域名不匹配会触发浏览器警告，但 TLS 连接本身可用）。
- ICP 备案号展示证据：`src/app/layout.tsx` 已在页面底部渲染 `粤ICP备2026094933号` 链接，指向 `https://beian.miit.gov.cn/`；本地 `npm run build` 通过，布局变更已随本轮提交 `844fc64` 推送至 GitHub。
- 代码同步证据：本地提交 `844fc64` 已推送至 `origin main`；服务器通过 `git clone` 拉取最新代码到 `/opt/home-inventory-app-new`，执行 `npm ci` 和 `npm run build` 后，将 `/opt/home-inventory-app` 备份为 `/opt/home-inventory-app.bak.20260727_174049`，新构建目录重命名为 `/opt/home-inventory-app` 并重启 `home-inventory-app.service`。
- 服务状态证据：部署完成后 `systemctl status home-inventory-app` 显示 `active (running)`，主进程为 `npm start` -> `next-server (v16.2.10)`，监听 `127.0.0.1:3000`；Nginx 反向代理后域名 HTTPS 访问返回 `HTTP 200`。
- 本地验证证据：`npm run lint` 退出码 0；`npm run build` 退出码 0，Next.js 16.2.10 / webpack 编译成功，生成 `/`、`/_not-found`、`/app`、`/login` 及库存 API 动态路由；`npm test` 通过 28 个测试文件 / 184 个测试，4 个 PostgreSQL 集成测试因本地未启动 PostgreSQL 被跳过。
- 真源同步证据：`dev-docs/deployment-route.md` 新增 `HTTPS 与域名接入状态` 章节并更新 `当前未验证项`；`dev-docs/aliyun-test-env-deployment-checklist.md` 更新 Nginx、端口、访问方式、验证状态；`dev-docs/acceptance.md` 新增本证据段。
- 公安联网备案证据：用户确认已完成公安联网备案，已在真源文档 `dev-docs/deployment-route.md` 和 `dev-docs/aliyun-test-env-deployment-checklist.md` 中记录。
- 剩余未验证：Supabase 到中国大陆正式版的数据迁移尚未设计；正式生产级备份恢复、监控、日志、账号安全策略、邮箱验证、密码重置、隐私政策和用户协议仍需补齐；浏览器完整登录和 CRUD 点击验收在 HTTPS 域名上尚未完成。

## 2026-07-07 Expiration date UX and soon-expiring fix evidence

- User feedback: Alibaba Cloud test site showed expiration values like `2026-07-31T16:00:00.000Z`, date entry still felt like manual typing, and soon-expiring items did not appear in the soon-expiring panel.
- Root cause evidence: PostgreSQL date values can arrive in JSON as ISO timestamp strings such as `2026-07-30T16:00:00.000Z`; the old dashboard rendered that raw value and passed it into `getExpirationStatus`, which produced `normal` instead of `soon`.
- Code evidence: updated `src/features/inventory/dashboard-data.ts` to normalize incoming expiration values to local `YYYY-MM-DD` before display and expiration grouping; updated `src/features/inventory/AppDashboard.tsx` so date inputs call native `showPicker()` on click/focus when the browser supports it.
- TDD evidence: added failing tests in `src/features/inventory/dashboard-data.test.ts` for ISO timestamp display normalization, PostgreSQL UTC serialization date offsets, and soon classification; targeted tests first failed with raw ISO display / wrong local day / `normal`, then passed after implementation.
- Validation evidence: `npm test -- src/features/inventory/dashboard-data.test.ts` passed 21 tests; `npm test` passed 28 files / 173 tests with 2 skipped; `npm run lint` passed; `npm run build` passed.
- Deployment evidence: rebuilt and restarted Alibaba Cloud test service; `home-inventory-app.service` returned `active`.
- Public smoke evidence: created a test item through public API with `expireDate=2026-07-31`; API returned stored value `2026-07-30T16:00:00.000Z`, and the deployed frontend normalization rule maps it to `2026-07-31`, 24 days from 2026-07-07, status `soon`.
- Browser evidence: Playwright opened `http://120.24.93.226/login`, registered a temporary user, created area/location/item through the UI, confirmed the expiration input is `type=date` with `showPicker`, confirmed the API still returns `2026-07-30T16:00:00.000Z`, and confirmed the page displays `2026-07-31` with the item in `即将过期物品`.
- Cleanup evidence: deleted `expire-smoke-%@example.com` and `browser-%@example.com` test users; remaining smoke users count is 0.
- Remaining unverified: manual click feel on the user's actual browser/device, because Playwright headless cannot display the operating-system date picker overlay.

## 2026-07-07 Alibaba Cloud test environment deployment evidence

- Server evidence: Alibaba Cloud Lightweight Application Server `Ubuntu-fjwh` in `华南1（深圳）`, public IP `120.24.93.226`, private IP `172.17.13.25`, Ubuntu upgraded from 24.04.2 to 24.04.4 LTS after `apt-get update && apt-get upgrade -y` and reboot.
- SSH evidence: `serverkey` is bound to the instance; Windows private key ACL was fixed to `Administrator:(R)` after OpenSSH rejected inherited `CodexSandboxUsers` read access; SSH login as `root@120.24.93.226` succeeded.
- Runtime evidence: installed Node.js `v24.18.0`, npm `11.16.0`, Git `2.43.0`, Nginx `1.24.0`, PostgreSQL `16.14`; Nginx and PostgreSQL are enabled and active.
- Network evidence: UFW is active with inbound `22/tcp` and `80/tcp`; PostgreSQL listens only on `127.0.0.1:5432`; Nginx listens on public `80`.
- Database evidence: created PostgreSQL role `home_inventory_app`, database `home_inventory_test`, and applied `dev-docs/sql/mainland_initial_schema.sql`; tables present: `users`, `auth_sessions`, `profiles`, `households`, `household_members`, `areas`, `locations`, `items`.
- Deployment evidence: code deployed to `/opt/home-inventory-app`, build ran as `deploy`, and `home-inventory-app.service` is enabled and active under systemd.
- Nginx evidence: Nginx reverse proxy now serves Next.js on `http://120.24.93.226/`; public checks for `/login` and `/app` returned HTTP 200 with `X-Powered-By: Next.js`.
- Cookie fix evidence: added `AUTH_COOKIE_SECURE=false` for the current IP + HTTP test environment only; test `src/app/api/auth/route-helpers.test.ts` first failed because production cookies stayed `Secure`, then passed after adding the explicit test override.
- Public API smoke evidence: `POST /api/auth/register` returned 200 and set `home_inventory_session`; follow-up `GET /api/inventory/dashboard` returned 200 with default household and empty arrays; create area/location/item API smoke returned ok with dashboard counts `areas=1`, `locations=1`, `items=1`.
- Cleanup evidence: deleted `deploy-smoke-%@example.com` test users; remaining smoke users count is 0.
- Backup evidence: `pg_dump --format=custom` generated `/var/backups/home-inventory-app/home_inventory_test_20260707_211902.dump`.
- Local validation evidence after cookie fix: `npm test` passed 28 files / 170 tests with 2 skipped; `npm run lint` exit code 0; `npm run build` exit code 0.
- Safety evidence: real database password, `SESSION_SECRET`, private key contents, full public key, and `.env.local` were not written to repository documents; server env values are stored in `/etc/home-inventory-app/app.env` with `root:deploy 640`.
- Remaining unverified: browser click-through on a real mobile/desktop browser at `http://120.24.93.226`, HTTPS/domain/ICP flow, email verification, password reset, and production-grade backup restore drill.

## 2026-07-07 Browser self-hosted auth and inventory CRUD evidence

- Code evidence: added `src/features/auth/self-hosted-auth-client.ts` and `src/features/auth/self-hosted-auth-client.test.ts`; updated `src/features/auth/AuthForm.tsx` to call `/api/auth/login` and `/api/auth/register` instead of Supabase browser auth.
- Dev-server evidence: updated `npm run dev` to `next dev --webpack` because Next.js 16.2.10 Turbopack on Windows repeatedly failed to create a `pg` junction under `.next/dev/node_modules`, causing `/api/auth/register` to return 500.
- Browser auth evidence: with local PostgreSQL on `localhost:5432`, Playwright registered a new self-hosted user through `/login`, received the `home_inventory_session` cookie, and reached `/app`.
- Browser dashboard evidence: `/app` called `GET /api/inventory/dashboard` and rendered the empty PostgreSQL-backed dashboard for the new self-hosted user.
- Browser CRUD evidence: created area `厨房`, location `冰箱`, and item `牛奶`; API responses for `POST /api/inventory/areas`, `POST /api/inventory/locations`, `POST /api/inventory/items`, and follow-up dashboard refreshes all returned 200.
- Persistence evidence: after browser reload, the created `厨房` / `冰箱` / `牛奶` data remained visible from PostgreSQL-backed dashboard data.
- Logout evidence: browser login for the same self-hosted user returned 200, dashboard showed the created item, `POST /api/auth/logout` returned 200, the session cookie was cleared, and direct `/app` access after logout rendered the unauthenticated state.
- Tooling evidence: added `@playwright/test` as a dev dependency to make local browser verification reproducible.
- Safety evidence: this used the local disposable `home_inventory_test` database only; no production database, real cloud service, real user data, database password, service role key, private key, or session secret was committed.
- Remaining unverified: browser-level update/delete flows for existing area/location/item records, and Alibaba Cloud test-environment deployment.

## 2026-07-07 Local PostgreSQL installation and real integration evidence

- Local runtime evidence: installed PostgreSQL locally through Scoop as `postgresql` 18.4-2 after the EDB installer path left an incomplete PostgreSQL directory.
- Database evidence: started the local PostgreSQL server on `localhost:5432` and created disposable test database `home_inventory_test`.
- Script evidence: updated `npm run test:postgres` to use `--no-file-parallelism` because PostgreSQL integration test files reset the same disposable `public` schema.
- Real PostgreSQL integration evidence: with local process/user `TEST_DATABASE_URL`, `DATABASE_URL`, and `SESSION_SECRET`, `npm run test:postgres` passed 2 files / 2 real database tests with 2 skip-placeholder tests.
- Inventory permission evidence: the real PostgreSQL inventory integration registers users A/B, creates A's area/location/item, verifies B's dashboard is empty, and rejects B writes against A's area/location/item ids.
- Full local validation evidence after PostgreSQL install: `npm test` passed 26 files / 164 tests with 2 skipped placeholder cases; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack and generated all auth and inventory API routes.
- Safety evidence: no production database, real cloud service, real user data, database password, service role key, private key, or session secret was committed.
- Remaining unverified: browser-level self-hosted auth/inventory flow against the local PostgreSQL runtime, and future server deployment on Alibaba Cloud test environment.

## 2026-07-07 Self-hosted `/app` inventory loop and PostgreSQL test preparation evidence

- Code evidence: added `src/app/api/inventory/dashboard/handlers.ts`, `src/app/api/inventory/dashboard/route.ts`, `src/app/api/inventory/dashboard/route.test.ts`, `src/features/inventory/self-hosted-inventory-client.ts`, and `src/features/inventory/self-hosted-inventory-client.test.ts`.
- `/app` evidence: self-hosted users now load dashboard data through `GET /api/inventory/dashboard`; self-hosted inventory create/update/delete operations call the self-hosted API routes; Supabase temporary write path remains for the existing Supabase mode.
- Auth evidence: self-hosted sign-out calls `POST /api/auth/logout`.
- PostgreSQL preparation evidence: added `src/features/inventory/postgres-inventory.integration.test.ts`; updated `npm run test:postgres` to include auth and inventory integration suites.
- Runbook evidence: added `dev-docs/local-postgres-test-runbook.md` with local test database safety rules, env var placeholders, schema source, and verification commands.
- Local machine condition evidence: current shell has no `TEST_DATABASE_URL`, `DATABASE_URL`, or `SESSION_SECRET`; `psql`, `pg_isready`, and `docker` are not available on `PATH`.
- Runtime PostgreSQL evidence: `npm run test:postgres` passed 2 files with 2 real-database tests skipped because `TEST_DATABASE_URL` is not configured.
- Safety evidence: no real PostgreSQL connection was opened, no real database URL/session secret/service role key/database password/private key was added, and no real user data was migrated.
- TDD evidence: dashboard/client tests first failed on missing modules, then passed after implementation; self-hosted dashboard state test first failed on the old pending state, then passed after implementation.
- Full local validation evidence after truth-doc update: `npm test` passed 26 files / 164 tests with 2 skipped real-database integration cases; `npm run test:postgres` passed 2 files with 2 real-database cases skipped; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/inventory/dashboard` is now listed as a dynamic route alongside the inventory write routes.
- Secret scan evidence: matches were limited to local runbook placeholders, test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, database password, or session secret was found.
- Remaining blocked: actual local/test PostgreSQL browser flow and real PostgreSQL API A/B negative execution require a reachable test PostgreSQL database and local-only environment variables.

## 2026-07-07 Self-hosted inventory API A/B negative route test evidence

- Code evidence: added `src/app/api/inventory/inventory-routes-permissions.test.ts` and route handler modules under `src/app/api/inventory/**/handlers.ts`.
- Route structure evidence: Next.js route files now stay as thin HTTP exports, while injectable handler factories are used for unit tests without connecting to PostgreSQL.
- API A/B negative evidence: tests model user B calling route handlers with user A ids and verify HTTP 403 for cross-user area/location/item update, delete, create-under-foreign-parent, and move-under-foreign-parent attempts.
- Contract evidence: area creation route ignores a caller-provided `householdId` and forwards only current `userId`, `name`, and `color` to the service.
- Permission boundary evidence: API routes map service-level ownership errors to 403; actual ownership checks remain in `createInventoryService` before repository writes.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: `npm test -- src/app/api/inventory/inventory-routes-permissions.test.ts` first failed because `./areas/handlers` did not exist; after implementation it passed 1 file / 11 tests.
- Targeted validation evidence: `npm test -- src/app/api/inventory/route-helpers.test.ts src/app/api/inventory/inventory-routes-permissions.test.ts src/features/inventory/inventory-service-permissions.test.ts` passed 3 files / 25 tests.
- Local build evidence before truth-doc update: `npm run lint` exit code 0; `npm run build` exit code 0 using webpack, with all inventory API routes still listed as dynamic routes.
- Remaining unverified: actual local/test PostgreSQL runtime write flow, browser flows using self-hosted auth, and real PostgreSQL test-database API A/B negative checks.

## 2026-07-07 Self-hosted inventory write API skeleton evidence

- Code evidence: added `src/app/api/inventory/route-helpers.ts`, `src/app/api/inventory/route-helpers.test.ts`, and route files under `src/app/api/inventory/areas`, `src/app/api/inventory/locations`, and `src/app/api/inventory/items`.
- API contract evidence: the route skeleton covers create/update/delete for areas, locations, and items under self-hosted auth.
- Auth boundary evidence: route helper resolves the current user from the self-hosted session cookie and returns 401 when no session is present.
- Permission boundary evidence: API routes do not accept `householdId`; they call inventory service methods that resolve the current user's household and reject cross-household area/location/item ids before repository writes.
- Error evidence: missing PostgreSQL inventory configuration maps to 501; service-level ownership errors map to 403; missing current-user household maps to 404; validation errors map to 400.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: `npm test -- src/app/api/inventory/route-helpers.test.ts` first failed because `./route-helpers` did not exist; after implementation it passed 1 file / 4 tests.
- Full local test evidence: `npm test` passed 22 files / 147 tests with 1 skipped real-database integration flow.
- Preliminary local build evidence before truth-doc update: `npm run lint` exit code 0; `npm run build` exit code 0 using webpack, with `/api/inventory/areas`, `/api/inventory/areas/[areaId]`, `/api/inventory/locations`, `/api/inventory/locations/[locationId]`, `/api/inventory/items`, and `/api/inventory/items/[itemId]` listed as dynamic routes.
- Remaining unverified: actual local/test PostgreSQL runtime write flow, browser flows using self-hosted auth, and API-level A/B negative checks against a real PostgreSQL test database.

## 2026-07-07 PostgreSQL inventory service permission negative test skeleton evidence

- Code evidence: added `src/features/inventory/inventory-service-permissions.test.ts`.
- Permission boundary evidence: the dedicated test file models user B's dashboard and attempts to write with user A's area/location/item ids.
- Covered negative cases: create location under another user's area; update/delete another user's area; update/delete another user's location; move a current-user location into another user's area; create item in another user's location; update/delete another user's item; move a current-user item into another user's location.
- Repository-call evidence: each negative case verifies that the write repository method is not called after the ownership check rejects the request.
- Behavior boundary evidence: this was a test-organization step and did not change production behavior, repository SQL, real database configuration, Supabase adapter behavior, or frontend behavior.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- Validation evidence: `npm test -- src/features/inventory/inventory-service-permissions.test.ts` passed 1 file / 10 tests.
- Full local validation evidence: `npm test` passed 21 files / 143 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime A/B negative flow, browser flows using self-hosted auth, and API/server-action level A/B negative checks.

## 2026-07-07 PostgreSQL inventory A/B negative skeleton: create-location area ownership evidence

- Code evidence: updated `src/features/inventory/inventory-service.ts` and `src/features/inventory/inventory-service.test.ts`.
- Permission boundary evidence: `createLocationForCurrentUser({ userId, name, areaId })` rejects a provided `areaId` when that area is not present in the current user's dashboard/household.
- A/B negative evidence: this covers user B attempting to create a location under user A's area id.
- Repository boundary evidence: PostgreSQL SQL did not change in this step; the foreign `areaId` is rejected before the repository is called.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted test first failed because `createLocationForCurrentUser` accepted a foreign `areaId` and called the repository; after implementation, `src/features/inventory/inventory-service.test.ts` passed 1 file / 25 tests.
- Full local validation evidence: `npm test` passed 20 files / 133 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime A/B negative flow, browser location creation with self-hosted auth, and full PostgreSQL A/B negative suite across area/location/item create/update/delete.

## 2026-07-07 PostgreSQL inventory create-area write skeleton evidence

- Code evidence: updated `src/features/inventory/inventory-service.ts`, `src/features/inventory/inventory-service.test.ts`, `src/features/inventory/inventory-repository.ts`, and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `createAreaForCurrentUser({ userId, name, color })` resolves the current user's household through the repository; callers do not provide `householdId`.
- Repository evidence: PostgreSQL `createArea` validates input, uses parameterized SQL, inserts into `areas (household_id, name, color)`, and returns `id, name, color`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because PostgreSQL `createArea` still threw the not-connected placeholder and `createAreaForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 38 tests.
- Full local validation evidence: `npm test` passed 20 files / 132 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime area creation, browser area creation flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory update/delete-area write skeleton evidence

- Code evidence: updated `src/features/inventory/inventory-service.ts`, `src/features/inventory/inventory-service.test.ts`, `src/features/inventory/inventory-repository.ts`, and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `updateAreaForCurrentUser({ userId, areaId, name, color })` and `deleteAreaForCurrentUser({ userId, areaId })` resolve the current user's household through the repository; callers do not provide `householdId`.
- Permission boundary evidence: area update/delete rejects a provided `areaId` when that area is not present in the current user's dashboard/household.
- Repository evidence: PostgreSQL `updateArea` validates input, uses parameterized SQL, updates `areas`, scopes the mutation with `where id = $1 and household_id = $2`, and returns `id, name, color`.
- Repository evidence: PostgreSQL `deleteArea` uses parameterized SQL, deletes from `areas`, and scopes the mutation with `where id = $1 and household_id = $2`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because PostgreSQL `updateArea` and `deleteArea` still threw the not-connected placeholder and `updateAreaForCurrentUser` / `deleteAreaForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 34 tests.
- Full local validation evidence: `npm test` passed 20 files / 128 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime area update/delete, browser area update/delete flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory update/delete-location write skeleton evidence

- Code evidence: updated `src/features/inventory/inventory-actions.ts`, `src/features/inventory/inventory-service.ts`, `src/features/inventory/inventory-service.test.ts`, `src/features/inventory/inventory-repository.ts`, and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `updateLocationForCurrentUser({ userId, locationId, name, areaId })` and `deleteLocationForCurrentUser({ userId, locationId })` resolve the current user's household through the repository; callers do not provide `householdId`.
- Permission boundary evidence: location update/delete rejects a provided `locationId` when that location is not present in the current user's dashboard/household.
- Permission boundary evidence: location update rejects a provided `areaId` when that area is not present in the current user's dashboard/household.
- Repository evidence: PostgreSQL `updateLocation` validates input, uses parameterized SQL, updates `locations`, scopes the mutation with `where id = $1 and household_id = $2`, and returns `id, name`.
- Repository evidence: PostgreSQL `deleteLocation` uses parameterized SQL, deletes from `locations`, and scopes the mutation with `where id = $1 and household_id = $2`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype, with `deleteLocation` added to the adapter contract.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because `updateLocationForCurrentUser` and `deleteLocationForCurrentUser` did not exist, PostgreSQL `updateLocation` still threw the not-connected placeholder, and `deleteLocation` was missing from the repository contract; after implementation, targeted tests passed 2 files / 28 tests.
- Full local validation evidence: `npm test` passed 20 files / 122 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime location update/delete, browser location update/delete flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory delete-item write skeleton evidence

- Code evidence: updated `src/features/inventory/inventory-service.ts`, `src/features/inventory/inventory-service.test.ts`, `src/features/inventory/inventory-repository.ts`, and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `deleteItemForCurrentUser({ userId, itemId })` resolves the current user's household through the repository; callers do not provide `householdId`.
- Permission boundary evidence: item deletion rejects a provided `itemId` when that item is not present in the current user's dashboard/household.
- Repository evidence: PostgreSQL `deleteItem` uses parameterized SQL, deletes from `items`, and scopes the mutation with `where id = $1 and household_id = $2`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because PostgreSQL `deleteItem` still threw the not-connected placeholder and `deleteItemForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 20 tests.
- Full local validation evidence: `npm test` passed 20 files / 114 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime item deletion, browser delete-item flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory update-item write skeleton evidence

- Code evidence: updated `src/features/inventory/inventory-service.ts`, `src/features/inventory/inventory-service.test.ts`, `src/features/inventory/inventory-repository.ts`, and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `updateItemForCurrentUser({ userId, itemId, name, note, expireDate, locationId })` resolves the current user's household through the repository; callers do not provide `householdId`.
- Permission boundary evidence: item update rejects a provided `itemId` when that item is not present in the current user's dashboard/household.
- Permission boundary evidence: item update rejects a provided `locationId` when that location is not present in the current user's dashboard/household.
- Repository evidence: PostgreSQL `updateItem` validates input, uses parameterized SQL, updates `items`, scopes the mutation with `where id = $1 and household_id = $2`, and returns `id, name, note, expire_date, location_id`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because PostgreSQL `updateItem` still threw the not-connected placeholder and `updateItemForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 17 tests.
- Full local validation evidence: `npm test` passed 20 files / 111 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime item update, browser update-item flow using self-hosted auth, PostgreSQL delete item path, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory create-item write skeleton evidence

- Code evidence: updated `src/features/inventory/inventory-service.ts`, `src/features/inventory/inventory-service.test.ts`, `src/features/inventory/inventory-repository.ts`, and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `createItemForCurrentUser({ userId, name, note, expireDate, locationId })` resolves the current user's household through the repository; callers do not provide `householdId`.
- Permission boundary evidence: item creation rejects a provided `locationId` when that location is not present in the current user's dashboard/household.
- Repository evidence: PostgreSQL `createItem` validates input, uses parameterized SQL, inserts into `items (household_id, location_id, name, note, expire_date, created_by)`, and returns `id, name, note, expire_date, location_id`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because PostgreSQL `createItem` still threw the not-connected placeholder and `createItemForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 13 tests.
- Full local validation evidence: `npm test` passed 20 files / 107 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime item creation, browser create-item flow using self-hosted auth, PostgreSQL update/delete item paths, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory create-location write skeleton evidence

- Code evidence: added `src/features/inventory/inventory-service.ts` and `src/features/inventory/inventory-service.test.ts`; updated `src/features/inventory/inventory-repository.ts` and `src/features/inventory/inventory-repository.test.ts`.
- Service boundary evidence: `createLocationForCurrentUser({ userId, name, areaId })` resolves the current user's household through the repository; callers do not provide `householdId`.
- Permission boundary evidence: location creation does not trust a frontend-provided household id.
- Repository evidence: PostgreSQL `createLocation` validates input, uses parameterized SQL, inserts into `locations (household_id, area_id, name)`, and returns `id, name`.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- Safety evidence: no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because `inventory-service` did not exist and PostgreSQL `createLocation` still threw the not-connected placeholder; after implementation, targeted tests passed 2 files / 9 tests.
- Full local validation evidence: `npm test` passed 20 files / 103 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime location creation, browser create-location flow using self-hosted auth, and PostgreSQL update/delete/item write paths.

## 2026-07-07 PostgreSQL inventory dashboard read repository evidence

- Code evidence: updated `src/features/inventory/inventory-repository.ts` and `src/features/inventory/inventory-repository.test.ts`.
- Behavior evidence: added `getDashboardForUser(userId)` for PostgreSQL dashboard reads.
- Permission boundary evidence: the PostgreSQL read path first resolves the user's household through `household_members` joined to `households`, then scopes `areas`, `locations`, and `items` by that household id.
- Safety evidence: SQL calls are parameterized; no real PostgreSQL connection is opened by unit tests; no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- Compatibility evidence: the Supabase adapter remains intact for the current temporary prototype.
- TDD evidence: targeted tests first failed because `getDashboardForUser` did not exist; after implementation, `npm test -- src/features/inventory/inventory-repository.test.ts` passed 1 file / 5 tests.
- Full local validation evidence: `npm test` passed 19 files / 99 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- UI boundary: this read repository is not wired into `/app` as an editable dashboard yet, because PostgreSQL write CRUD is not connected and the UI would otherwise mix self-hosted reads with Supabase writes.
- Remaining unverified: actual local/test PostgreSQL runtime inventory reads, browser display of PostgreSQL-backed inventory data, and PostgreSQL inventory write CRUD.

## 2026-07-07 `/app` self-hosted session recognition evidence

- Code evidence: added `src/app/app/app-auth.ts`, `src/app/app/app-auth.test.ts`, `src/features/inventory/app-dashboard-state.ts`, and `src/features/inventory/app-dashboard-state.test.ts`.
- Page evidence: updated `src/app/app/page.tsx` to resolve a self-hosted current user from `home_inventory_session` before rendering `/app`.
- UI boundary evidence: updated `src/features/inventory/AppDashboard.tsx` to show an honest pending state when self-hosted auth is recognized but PostgreSQL inventory CRUD is not connected.
- Compatibility evidence: when there is no self-hosted cookie, or PostgreSQL auth is not configured, `/app` continues to use the existing temporary Supabase browser path.
- Safety evidence: no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because `app-auth` and `app-dashboard-state` did not exist; after implementation, targeted tests passed 4 files / 27 tests.
- Full local validation evidence: `npm test` passed 19 files / 97 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/app` is now a dynamic route because it reads server cookies before rendering.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- Remaining unverified: browser refresh with a real self-hosted PostgreSQL session, PostgreSQL inventory CRUD, and `/app` showing real PostgreSQL-backed inventory data.

## 2026-07-07 server-side current-user session lookup evidence

- Code evidence: updated `src/server/auth/auth-service.ts`, `src/server/auth/postgres-auth-repository.ts`, and `src/app/api/auth/route-helpers.ts`.
- Behavior evidence: auth service can resolve the current user from a session token hash, reject missing/expired/revoked sessions, and reject disabled users.
- Repository evidence: PostgreSQL auth repository can load a session by token hash through `auth_sessions` joined to `users`.
- Route-helper evidence: `getCurrentUserFromRequest` reads the `home_inventory_session` cookie and returns `null` without database initialization when the cookie is missing.
- Safety evidence: no real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, service role key, database password, or real user data was added.
- TDD evidence: targeted tests first failed because `getCurrentUser`, `findSessionByHash`, and `getCurrentUserFromRequest` did not exist; after implementation, targeted tests passed 3 files / 20 tests.
- Full local validation evidence: `npm test` passed 17 files / 92 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack and generated `/api/auth/login`, `/api/auth/logout`, and `/api/auth/register`.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime session lookup, browser refresh persistence, `/app` protection using the new self-owned auth session, and PostgreSQL A/B permission negative tests.

## 2026-07-06 gated PostgreSQL integration verification evidence

- Code evidence: added `src/server/db/postgres-integration-config.ts`, `src/server/db/postgres-integration-config.test.ts`, and `src/server/auth/postgres-auth-repository.integration.test.ts`.
- Script evidence: added `npm run test:postgres` for the PostgreSQL auth integration verification entrypoint.
- Env boundary evidence: added empty `.env.example` placeholder `TEST_DATABASE_URL`; real values must stay outside Git.
- Safety evidence: integration verification is skipped unless `TEST_DATABASE_URL` is configured, and configured database names must look like test databases.
- Intended real-database coverage when enabled: reset disposable test schema, execute `dev-docs/sql/mainland_initial_schema.sql`, run register/login/logout through `createAuthService` and `createPostgresAuthRepository`, and verify user/profile/household/membership/session records.
- Validation evidence: `npm test -- src/server/db/postgres-integration-config.test.ts` passed 1 file / 4 tests; `npm run test:postgres` passed 1 file with 1 skipped real-database flow because `TEST_DATABASE_URL` is not configured.
- Full local validation evidence: `npm test` passed 17 files / 85 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack and generated `/api/auth/login`, `/api/auth/logout`, and `/api/auth/register`.
- Remaining unverified: actual local/test PostgreSQL runtime connection, schema execution against a real database, browser registration/login/logout flow, session cookie lookup for current user, and PostgreSQL A/B permission negative tests.

## 2026-07-06 auth API skeleton evidence

- Code evidence: added `src/server/auth/auth-service.ts`, `src/server/auth/postgres-auth-repository.ts`, `src/app/api/auth/route-helpers.ts`, `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`.
- Repository evidence: `src/features/inventory/inventory-repository.ts` now includes a PostgreSQL adapter draft that keeps the current Supabase adapter intact.
- Boundary evidence: PostgreSQL auth and inventory repositories intentionally do not open a database connection and throw explicit not-connected errors.
- API evidence: Next.js build lists `/api/auth/login`, `/api/auth/logout`, and `/api/auth/register` as dynamic server routes.
- Validation evidence: targeted auth/repository tests passed 3 files / 9 tests; full `npm test` passed 13 files / 70 tests; `npm run lint` exit code 0; `npm run build` exit code 0.
- Remaining unverified: real PostgreSQL registration/login/logout persistence, real session lookup from cookie, PostgreSQL A/B permission negative tests, and browser end-to-end auth flow.

## 2026-07-06 PostgreSQL auth repository implementation evidence

- Code evidence: `src/server/auth/postgres-auth-repository.ts` now implements auth repository behavior against an injected PostgreSQL-style query client.
- Behavior evidence: covered `findUserByEmail`, transactional `createUserWithDefaultHousehold`, `createSession`, and `revokeSessionByHash`.
- Safety evidence: no-argument repository creation still returns explicit not-connected behavior; current API routes do not silently connect to an unspecified database.
- Transaction evidence: user bootstrap test verifies `begin`, `commit`, and `rollback` behavior.
- Validation evidence: targeted repository test first failed with 5 expected failures, then passed 1 file / 6 tests after implementation; full `npm test` passed 13 files / 75 tests; `npm run lint` exit code 0; `npm run build` exit code 0.
- Remaining unverified: running the SQL against an actual local/test PostgreSQL database, wiring route handlers to a real PostgreSQL client, session cookie lookup for current user, and PostgreSQL A/B permission negative tests.

## 2026-07-06 PostgreSQL client factory and route wiring evidence

- Code evidence: added `src/server/db/postgres.ts` and `src/server/db/postgres.test.ts`.
- API wiring evidence: `src/app/api/auth/route-helpers.ts` now creates the auth service through a PostgreSQL query client derived from server-only `DATABASE_URL`.
- Dependency evidence: added `pg` and `@types/pg`.
- Build evidence: `package.json` build script now uses `next build --webpack`; this avoids a verified Next.js 16.2.10 Turbopack Windows junction failure with `pg`.
- Boundary evidence: route helpers return 501 when `DATABASE_URL` is missing, and no real PostgreSQL connection string was added.
- Validation evidence: targeted route/db/auth tests passed 4 files / 16 tests; full `npm test` passed 15 files / 80 tests; `npm run lint` exit code 0; `npm run build` exit code 0.
- Remaining unverified: actual local/test PostgreSQL runtime connection, schema execution against a real database, browser registration/login/logout flow, session cookie lookup for current user, and PostgreSQL A/B permission negative tests.

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
| 部署路线 | `dev-docs/deployment-route.md` 已确认；阿里云测试环境已部署 | 阿里云测试 URL 已完成公网 API smoke；完整浏览器点击验收未完成 |
| 中国大陆正式版路线 | `dev-docs/deployment-route.md` 和 `dev-docs/stages/mainland-production-route.md` 已记录 | 已确认目标；测试环境已跑通，正式 HTTPS/备案/生产验收未完成 |
| UI | 截图、响应式、空/加载/错误状态 | 基础浏览器证据已记录；完整移动端操作体验未验证 |
| Git | `.gitignore`、私有资料、checkpoint | 已有 checkpoint；本次文档收口由本轮 Git 提交记录 |

## 部署验收路径

```text
创建或确认 GitHub 仓库
  -> 在 Vercel 导入 Next.js 项目
  -> 配置 Supabase public 环境变量
  -> 配置 Supabase Auth Site URL 和 Redirect URLs
  -> Vercel 构建成功
  -> 打开生产 URL
  -> 未登录访问 /app 被要求登录
  -> 登录后进入 /app
  -> 新增/搜索/编辑/删除一条测试物品
  -> 刷新页面确认数据仍存在
  -> 用另一个用户确认不能读取或修改该用户数据
```

部署验收边界：

- 第一版只使用免费层，不承诺商业生产 SLA。
- 不购买 VPS，不自建数据库，不改变技术路线。
- 不提交 `.env.local`、service role key、数据库密码或真实用户数据。
- 未完成生产 URL 登录、CRUD 和用户 A/B 权限负例前，不能声明线上版本安全可用。

## 中国大陆正式版验收路径

```text
确认云平台和备案主体
  -> 购买或绑定可备案域名
  -> 购买中国大陆云资源
  -> 完成 ICP 备案
  -> 部署国内 PostgreSQL
  -> 部署 Next.js 应用和自有认证/权限层
  -> 配置 HTTPS、环境变量、日志和备份
  -> 完成公安联网备案
  -> 使用中国大陆网络打开正式域名
  -> 注册/登录/新增/搜索/编辑/删除物品
  -> 用户 A/B 权限负例通过
```

中国大陆正式版验收边界：

- 未完成 ICP 备案前，不把中国大陆域名当正式生产地址。
- 未完成自有认证和权限负例前，不迁移真实用户。
- 未完成数据库备份和恢复方案前，不承诺长期保存用户数据。
- 未完成中国大陆网络访问测试前，不宣称适合中国大陆用户稳定使用。

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

## 移动端搜索入口置顶验收路径

```text
用手机或移动端视口打开 /app
  -> 登录后进入家庭物品管理页
  -> 确认首屏顶部有“搜索物品”“新增物品”“新增位置”“新增区域”入口
  -> 点击“搜索物品”
  -> 确认弹窗中出现搜索框、区域筛选、位置筛选和匹配物品结果
  -> 分别点击“新增物品”“新增位置”“新增区域”
  -> 确认弹窗中出现对应新增表单
  -> 关闭弹窗
  -> 确认正常页面中概览、区域管理、位置管理仍在物品栏之前
  -> 继续向下滚动
  -> 确认物品栏、新增物品和物品列表仍可使用
  -> 切换到桌面端视口
  -> 确认桌面端仍为左侧管理、右侧物品清单
```

验收边界：

- 本功能不新增数据库字段。
- 本功能不修改 RLS。
- 本功能不改变家庭共享、照片、扫码、支付、原生 App 的不做范围。
- 本功能只调整移动端搜索/新增快捷入口和弹窗，不改变搜索、筛选、新增物品、新增位置、新增区域的数据逻辑。

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
- 2026-07-04 移动端物品搜索置顶历史记录：上一轮曾把物品清单整体置顶，代码提交为 `3cccb55 fix: prioritize item search on mobile`；用户随后指出几百个物品会导致新增物品和管理区域难以到达，因此本轮调整为“搜索入口置顶、物品栏回到下方、搜索结果放入弹窗”。
- 2026-07-04 移动端搜索入口置顶开工记录：范围为移动端 `/app` 顶部新增“搜索物品”入口，点击后弹出搜索框、区域/位置筛选和匹配物品结果；物品栏保留在概览、区域管理、位置管理之后；桌面端保持左侧管理、右侧物品清单；不新增数据库字段、不修改 RLS、不改变家庭共享/照片/扫码/支付边界。
- 2026-07-04 移动端搜索入口置顶代码证据：`src/features/inventory/AppDashboard.tsx` 新增移动端顶部“搜索物品”入口和移动端搜索弹窗；弹窗复用现有 `filters`、`filteredLocations`、`visibleItems`，包含名称/备注搜索、区域筛选、位置筛选和匹配物品结果；移动端物品栏恢复到概览、区域管理、位置管理之后；桌面端搜索/筛选仍保留在物品清单标题区。
- 2026-07-04 移动端搜索入口置顶本地验证证据：执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6；执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 48 个测试。
- 2026-07-04 移动端新增快捷入口开工记录：用户确认在移动端顶部除“搜索物品”外，再新增“新增物品”“新增位置”“新增区域”快捷入口；点击后打开对应轻量弹窗；页面下方原有新增物品、位置、区域区域继续保留；不新增数据库字段、不修改 RLS、不改变家庭共享/照片/扫码/支付边界。
- 2026-07-04 移动端新增快捷入口代码证据：`src/features/inventory/AppDashboard.tsx` 将移动端顶部扩展为“搜索物品 / 新增物品 / 新增位置 / 新增区域”四个入口；新增 `mobileQuickPanel` 状态统一管理搜索与新增弹窗；新增物品、位置、区域弹窗复用现有表单状态和 `createInventoryItem`、`createInventoryLocation`、`createInventoryArea` 保存路径，保存成功后关闭弹窗，保存失败时保留错误提示；页面下方原有表单仍保留。
- 2026-07-04 移动端新增快捷入口本地验证证据：执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6；执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 48 个测试。
- 2026-07-04 移动端新增快捷入口用户验收证据：用户在真实移动端访问局域网地址后反馈“验收通过了”。本次用户验收覆盖移动端顶部“搜索物品 / 新增物品 / 新增位置 / 新增区域”入口、对应弹窗可打开、搜索/新增高频路径位置符合预期。
- 2026-07-06 国内正式版认证与数据库迁移准备证据：新增 `dev-docs/stages/mainland-auth-db-migration.md`、`dev-docs/mainland-database-design.md`、`dev-docs/sql/mainland_initial_schema.sql`；补充 `.env.example` 的服务端专用 `DATABASE_URL` 和 `SESSION_SECRET` 占位符；新增 `src/server/auth/session-security.ts` 和测试，覆盖 URL-safe session token、HMAC token hash、session 过期/撤销判断；新增 `src/features/inventory/inventory-repository.ts` 和测试，先保留 Supabase adapter 并为后续 PostgreSQL adapter 留出边界；`AppDashboard` 写入类 CRUD 调用已改为通过 repository，未删除 Supabase，未连接真实 PostgreSQL，未接入真实云密钥。
- 2026-07-06 本地验证证据：执行 `npm test`，exit code 0，Vitest 通过 9 个测试文件 / 55 个测试；执行 `npm run lint`，exit code 0，ESLint 无报错；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 构建成功，生成 `/`、`/_not-found`、`/app`、`/login`。
- 2026-07-06 用户确认国内正式版认证与测试环境决策：密码哈希算法使用 bcrypt；session 默认有效期 30 天；测试阶段先不做邮箱验证和密码重置；阿里云测试环境可以先使用服务器 IP 访问。正式公开前仍必须补齐邮箱验证和密码重置，且未备案通过前不把正式域名解析到公开网站。
- 2026-07-06 认证与权限本地雏形证据：新增依赖 `bcryptjs`；新增 `src/server/auth/password-security.ts` 和测试，覆盖 bcrypt cost、密码哈希、密码验证、短密码拒绝；补充 `src/server/auth/session-security.ts` 的 30 天默认 session 有效期；新增 `src/server/auth/authorization.ts` 和测试，覆盖用户必须属于 household、资源必须属于当前 household。当前未接入真实注册/登录/退出流程，未连接真实 PostgreSQL。
- 2026-07-06 认证与权限本地雏形验证证据：执行 `npm test`，exit code 0，Vitest 通过 11 个测试文件 / 63 个测试；执行 `npm run lint`，exit code 0，ESLint 无报错；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 构建成功，生成 `/`、`/_not-found`、`/app`、`/login`；密钥扫描未命中非空 `DATABASE_URL`、非空 `SESSION_SECRET` 或 `service_role`。
- 2026-07-07 自有 PostgreSQL 浏览器与 API 删除补证：本地浏览器流程已通过自有认证进入 `/app`，创建并编辑区域、位置和物品，服务端日志显示 `POST /api/auth/register`、`POST /api/inventory/areas`、`POST /api/inventory/locations`、`POST /api/inventory/items`、`PATCH /api/inventory/areas/:areaId`、`PATCH /api/inventory/locations/:locationId`、`PATCH /api/inventory/items/:itemId` 均返回 200。发现位置列表缺少删除入口后，补充 `src/features/inventory/AppDashboard.tsx` 的位置删除按钮和 `handleDeleteLocation`，并修复 `src/app/api/inventory/route-helpers.ts` 对无 body `DELETE` 请求的解析。HTTP 会话验证创建 area/location/item 后依次删除 item/location/area，最终 `GET /api/inventory/dashboard` 返回 `areasAfterDelete=0`、`locationsAfterDelete=0`、`itemsAfterDelete=0`。
- 2026-07-07 自有 PostgreSQL 删除补证验证命令：新增 `src/features/inventory/AppDashboard.test.ts` 覆盖位置列表删除入口；新增 `src/app/api/inventory/route-helpers.test.ts` 空 body `DELETE` 回归测试。执行 `npm test`，exit code 0，Vitest 通过 28 个测试文件 / 169 个测试，2 个跳过；执行 `npm run test:postgres`，exit code 0，2 个 PostgreSQL 集成测试文件通过，2 个真实数据库测试通过，2 个占位跳过；执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / webpack 编译、TypeScript、静态生成均通过，生成库存 API 动态路由。

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

- 真实浏览器中完整走一遍搜索、筛选和删除按钮点击确认；本轮已用浏览器验证自有认证下新增与编辑路径，并用 HTTP 会话补证删除路径。
- 移动端完整操作体验和截图证据。
- 位置编辑弹窗：重命名位置、修改所属区域、改为未分区、保存失败提示。
- 位置列表区域筛选：全部区域、指定区域、无匹配位置空状态。
- 真实登录后的浏览器验收：修改位置为未分区、按区域筛选位置列表、刷新后仍保存。
- 真实登录后的浏览器验收：新增/编辑物品时先选择区域，再确认位置下拉只显示该区域或未分区下的位置。

## 停止条件

- 不能在没有 RLS 权限策略和负例验证时声明安全。
- 不能在没有 `.env.example` 和密钥边界时接入真实云服务。
- 不能在没有用户确认技术选型时 scaffold 代码。
- 不能把 mock 数据包装成真实 Supabase 功能。
- 不能把真实 Supabase secret、service role key 或用户数据提交到 Git。
