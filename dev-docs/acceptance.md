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
| 家庭共享 | 设计已确认；自托管实现已上线 `homestorag.xyz`，线上 smoke 覆盖邀请/申请/批准/共同访问/移除；浏览器点击验收与 Android 联动待补 | 已上线（待浏览器验收） |
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

## 家庭成员共享验收路径

```text
房主登录 /app
  -> 打开家庭设置
  -> 生成邀请链接并复制
  -> 通过微信把链接发给家人
  -> 家人打开链接：看到家庭名称、Android 内测 App 下载入口和“申请加入”按钮
  -> 未注册用户先注册/登录，登录后回到链接页
  -> 点击“申请加入”，提交 pending 申请
  -> 房主在家庭设置看到申请并批准
  -> 成员可查看、新增、编辑、删除家庭区域/位置/物品
  -> 未批准前账号无法读取家庭数据
  -> 房主在成员列表移除成员
  -> 被移除成员立即无法访问，家庭数据仍保留
  -> 成员不能邀请/移除成员或修改角色
```

验收边界：

- 邀请是带 token 的分享链接，默认 30 天有效；第一版不发送真实邮件，不接入微信授权或微信开放平台，链接通过微信等外部渠道手动发送。
- 链接落地页包含 Android 内测 APK 下载入口，下载地址为部署配置项；APK 由服务器静态托管，每次构建后自动上传最新版并更新版本信息，落地页与 App 检查版本提示更新（安装需用户确认）。
- 权限由 RLS 兜底：未提交申请、申请被拒绝或被移除的账号不能读取家庭数据，不能只靠前端隐藏按钮。
- 一个账号可属于多个家庭；当前家庭切换器只切换前端操作上下文，不能越权读取其他家庭。
- 家庭共享先做 Web/PWA；Android 内测版提供房主邀请分享（生成链接 + 系统分享/复制），申请与审批以 Web 端为主。

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
- 本功能不涉及家庭共享（另立阶段，见 `dev-docs/stages/family-sharing.md`），也不改变照片、扫码、支付、原生 App 的不做范围。
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
- 本功能不涉及家庭共享（另立阶段，见 `dev-docs/stages/family-sharing.md`），也不改变照片、扫码、支付、原生 App 的不做范围。
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
- 本功能不涉及家庭共享（另立阶段，见 `dev-docs/stages/family-sharing.md`），也不改变照片、扫码、支付、原生 App 的不做范围。
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
- 2026-07-04 位置编辑与位置筛选开工记录：确认采用轻量弹窗方案；范围为位置重命名、修改所属区域、位置列表按区域筛选；不新增数据库字段、不修改 RLS、不加入照片/扫码/支付（家庭共享当时不在范围内，2026-08-06 起另立阶段）。
- 2026-07-04 位置编辑与位置筛选代码证据：新增 `updateInventoryLocation`，按 `id + household_id` 更新 `locations.name` 和 `locations.area_id`；新增 `filterInventoryLocations`，支持全部区域、指定区域和未分区筛选；`/app` 位置列表右侧新增“编辑”入口，点击后打开轻量弹窗，可修改名称和所属区域；位置列表上方新增“显示区域”筛选，筛选只影响位置列表，不影响右侧物品清单筛选。
- 2026-07-04 位置编辑与位置筛选测试证据：先运行针对 `updateInventoryLocation` 和 `filterInventoryLocations` 的失败测试，失败原因为新函数不存在；实现后运行 `npm test -- src/features/inventory/inventory-actions.test.ts src/features/inventory/dashboard-data.test.ts`，exit code 0，2 个测试文件 / 32 个测试通过。
- 2026-07-04 位置编辑与位置筛选本地验证证据：执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 45 个测试；执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。
- 2026-07-04 浏览器未登录验证证据：本地服务 `http://127.0.0.1:3000` 启动成功；打开 `http://127.0.0.1:3000/app`，页面标题为 `Home Inventory`，显示“请先登录”和“去登录”，无页面 console error。
- 2026-07-04 物品表单区域优先选择开工记录：范围为新增/编辑物品表单先选择区域，再选择该区域下的位置；未选区域时位置下拉不展示全部位置；切换区域时清空已选位置；选择“未分区”时只显示未分区位置；不新增数据库字段、不修改 RLS、不加入照片/扫码/支付（家庭共享当时不在范围内，2026-08-06 起另立阶段）。
- 2026-07-04 物品表单区域优先选择代码证据：`/app` 物品表单新增前端 `areaId` 状态和“区域”下拉；位置下拉改为由当前区域筛选后的 `itemFormLocations` 驱动；保存物品仍复用现有 `createInventoryItem` / `updateInventoryItem` 和 `items.location_id`；新增 `getLocationAreaFilterValue` 用于编辑已有物品时从当前位置推导区域或“未分区”。
- 2026-07-04 物品表单区域优先选择测试证据：先运行 `npm test -- src/features/inventory/dashboard-data.test.ts`，失败原因为 `getLocationAreaFilterValue is not a function`；实现后同一命令 exit code 0，1 个测试文件 / 18 个测试通过。
- 2026-07-04 物品表单区域优先选择本地验证证据：执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 48 个测试；执行 `npm run lint`，exit code 0；执行 `npm run build`，首次发现 `startEditItem` 缺少 ready 状态收窄并已补 guard，复跑 exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6，生成路由 `/`、`/_not-found`、`/app`、`/login`。
- 2026-07-04 移动端物品搜索置顶历史记录：上一轮曾把物品清单整体置顶，代码提交为 `3cccb55 fix: prioritize item search on mobile`；用户随后指出几百个物品会导致新增物品和管理区域难以到达，因此本轮调整为“搜索入口置顶、物品栏回到下方、搜索结果放入弹窗”。
- 2026-07-04 移动端搜索入口置顶开工记录：范围为移动端 `/app` 顶部新增“搜索物品”入口，点击后弹出搜索框、区域/位置筛选和匹配物品结果；物品栏保留在概览、区域管理、位置管理之后；桌面端保持左侧管理、右侧物品清单；不新增数据库字段、不修改 RLS、不改变照片/扫码/支付边界（家庭共享 2026-08-06 起另立阶段）。
- 2026-07-04 移动端搜索入口置顶代码证据：`src/features/inventory/AppDashboard.tsx` 新增移动端顶部“搜索物品”入口和移动端搜索弹窗；弹窗复用现有 `filters`、`filteredLocations`、`visibleItems`，包含名称/备注搜索、区域筛选、位置筛选和匹配物品结果；移动端物品栏恢复到概览、区域管理、位置管理之后；桌面端搜索/筛选仍保留在物品清单标题区。
- 2026-07-04 移动端搜索入口置顶本地验证证据：执行 `npm run lint`，exit code 0；执行 `npm run build`，exit code 0，Next.js 16.2.10 / Turbopack 编译成功、TypeScript 通过、静态生成 6/6；执行 `npm test`，exit code 0，Vitest 通过 7 个测试文件 / 48 个测试。
- 2026-07-04 移动端新增快捷入口开工记录：用户确认在移动端顶部除“搜索物品”外，再新增“新增物品”“新增位置”“新增区域”快捷入口；点击后打开对应轻量弹窗；页面下方原有新增物品、位置、区域区域继续保留；不新增数据库字段、不修改 RLS、不改变照片/扫码/支付边界（家庭共享 2026-08-06 起另立阶段）。
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

家庭成员共享数据库验收必须包含：

- `household_invitations` migration 与 `dev-docs/database-design.md` 一致。
- 未提交申请或被拒绝的账号无法读写共享家庭 areas/locations/items。
- 成员申请被批准后可读写家庭数据；批准前不能。
- member 不能邀请/移除成员，也不能修改角色。
- owner 移除成员后，该成员立即无法访问，家庭数据仍保留。
- 无效/过期/已作废 token 不能提交申请；非 owner 不能批准或拒绝申请。
- 同一家庭同一时间只能存在一个有效邀请链接；同一账号对同一家庭只能有一条 pending 申请。

## 用户验收

用户需要亲自确认：

- 产品第一版范围是否足够小。
- UI 是否适合普通家庭用户。
- 物品、位置、过期日模型是否符合真实使用习惯。
- 是否接受第一版边界：照片、扫码、原生 App 不做；家庭共享按 2026-08-06 设计纳入（微信链接邀请、自主申请、房主批准、成员共同编辑、owner 移除成员）。

## 当前剩余未验证项

- 真实浏览器中完整走一遍搜索、筛选和删除按钮点击确认；本轮已用浏览器验证自有认证下新增与编辑路径，并用 HTTP 会话补证删除路径。
- 移动端完整操作体验和截图证据。
- 位置编辑弹窗：重命名位置、修改所属区域、改为未分区、保存失败提示。
- 位置列表区域筛选：全部区域、指定区域、无匹配位置空状态。
- 真实登录后的浏览器验收：修改位置为未分区、按区域筛选位置列表、刷新后仍保存。
- 真实登录后的浏览器验收：新增/编辑物品时先选择区域，再确认位置下拉只显示该区域或未分区下的位置。
- 家庭共享：`household_invitations` / `household_join_requests` migration 与 RLS 尚未编写和执行。
- 家庭共享：链接生成/申请提交/批准/拒绝/移除成员的真实 Supabase 负例未验证。
- 家庭共享：当前家庭切换器 UI 未实现。
- 家庭共享：真实浏览器里房主生成链接、家人打开链接申请、房主批准、共同编辑、移除成员的验收陪跑未完成；链接落地页 App 下载入口与 APK 自动上传/版本更新机制未实现和验证。

## 停止条件

- 不能在没有 RLS 权限策略和负例验证时声明安全。
- 不能在没有 `.env.example` 和密钥边界时接入真实云服务。
- 不能在没有用户确认技术选型时 scaffold 代码。
- 不能把 mock 数据包装成真实 Supabase 功能。
- 不能把真实 Supabase secret、service role key 或用户数据提交到 Git。
- 家庭共享相关 RLS 负例未通过前，不能声明共享功能安全可用。

## 2026-08-06 家庭成员共享设计确认

- 用户确认将“家庭成员共享”纳入当前阶段范围，按建议默认方案先行 Web/PWA。
- 邀请方式：房主生成邀请链接（token，默认 30 天有效），通过微信等渠道发给对方；对方打开链接注册/登录后提交加入申请，房主批准后成为成员。第一版不发送真实邮件，不接入微信授权或微信开放平台。
- 链接落地页：展示家庭名称、“申请加入”按钮和 Android 内测版 App 下载入口；下载地址为部署配置项。
- 权限模型：owner 与 member 对家庭内区域、位置、物品拥有相同查看/新增/编辑/删除权限；仅 owner 可邀请成员、移除成员、更新和删除家庭。
- 数据归属：数据属于 household；成员被移除后立即失去访问权，家庭数据保留。
- 家庭形态：一个账号可属于多个家庭（默认家庭 + 被邀请加入的家庭），UI 提供“当前家庭”切换器；所有清单操作基于当前家庭。
- 边界：第一版不做真实邮件通知、房主转让、成员自助退出、多家庭数据合并；Android 内测版提供房主邀请分享（生成链接 + 系统分享/复制），申请与审批以 Web 端为主，服务端权限模型保持兼容。
- 真源落点：`dev-docs/project-brief.md`、`dev-docs/architecture.md`、`dev-docs/database-design.md`、`dev-docs/acceptance.md`、`dev-docs/stages/family-sharing.md`。
- 实施状态：设计已确认并写入真源；migration、代码、权限负例和浏览器验收均未开始，等待用户确认实施计划后启动。

## 2026-08-06 家庭成员共享实施证据

- migration 证据：`supabase/migrations/202608060001_family_sharing.sql` 已编写，包含 `household_invitations`、`household_join_requests`、部分唯一索引、六个 security definer 安全函数（查家庭/提交申请/批准/拒绝/成员列表/申请列表）和 RLS 策略，与 `dev-docs/database-design.md` 一致；尚未在真实 Supabase 项目执行。
- 数据层证据：`src/features/family/family-data.ts`（URL-safe token 生成、邀请 URL、30 天有效期、链接状态、token 校验）与 `src/features/family/family-actions.ts`（生成/作废链接、申请、批准/拒绝、移除成员、成员/申请/家庭列表）已实现。
- 落地页证据：新增 `/join/<token>` 页面，含登录/注册（Supabase 测试路线）、申请加入、Android 内测 APK 下载入口（`NEXT_PUBLIC_APK_DOWNLOAD_URL`）。
- UI 证据：`FamilySettings.tsx` 家庭设置面板（生成/复制/作废邀请链接、批准/拒绝申请、成员列表与移除）和当前家庭切换器已接入 `/app` 的 Supabase 测试路线；自托管路线的“设置”按钮提示该能力尚未上线。
- TDD 证据：先新增 `family-data.test.ts` / `family-actions.test.ts` 27 个测试，先看到模块缺失失败，再实现后转绿。
- 本地验证证据：`npm test` 通过 36 个测试文件 / 252 个测试（2 个 PostgreSQL 集成占位跳过）；`npm run lint` exit code 0；`npm run build` exit code 0，Next.js 16.2.10 构建成功，生成 `/join/[token]` 动态路由。
- 未完成（后续更新见“2026-08-06 家庭成员共享自托管上线证据”）：真实浏览器验收陪跑、APK 服务器托管与自动上传、Android 端联动。

## 2026-08-06 家庭成员共享自托管上线证据

- 用户确认实施路线改为自托管（`homestorag.xyz`），不以 Supabase 为实施目标（访问不便）。
- 数据库证据：`dev-docs/sql/family_sharing_self_hosted.sql` 已在服务器 `home_inventory_test` 执行成功（`household_invitations`、`household_join_requests`、部分唯一索引），并授予应用角色 `home_inventory_app` 全部权限。
- 部署证据：本地 `main` 通过 git bundle 传输到服务器（GitHub 推送因网络暂时不可用，待网络恢复后补推 `origin/main`）；旧目录备份为 `/opt/home-inventory-app.bak.family.20260806`；`npm ci` 与 `npm run build` 成功，构建路由包含全部 family 接口；`home-inventory-app.service` 重启后 `active`，`https://homestorag.xyz/login` 返回 200。
- 链接域名修复：Nginx 增加 `X-Forwarded-Host`，服务端用转发头生成公开域名；线上邀请链接为 `https://homestorag.xyz/join/<token>`。
- 线上 smoke 证据（13 步全通过）：注册临时用户 A/B → A 创建邀请链接（30 天有效）→ B 批准前读 A 家庭 dashboard 返回 404 → B 通过 `/api/join/<token>` 查询家庭信息 → B 提交申请 → A 看到 pending 申请（含邮箱）→ A 批准 → B 的 `/api/family/households` 出现 A 家庭（role=member）且可读 A 家庭 dashboard 200 → A 成员列表显示 B → A 移除 B → B 家庭列表不再包含 A 家庭、读 A 家庭 dashboard 404 → A 数据仍可读 200。
- 落地页证据：`/join/<token>` 未登录显示“加入家人的清单 / 去登录 / 注册”，已登录显示“申请加入”。
- 权限负例：未批准不可访问、批准后可读写、移除立即失效在线上 smoke 验证通过；member 不能管理成员/邀请、非 owner 不能批准由单元测试覆盖（`family-service.test.ts`、`family-handlers.test.ts`）。
- 本地验证：`npm test` 39 个测试文件 / 268 通过（2 个 PostgreSQL 集成占位跳过）；`npm run lint` 通过；`npm run build` 通过。
- 清理证据：冒烟测试账号（famsmoke-*/famurl-*）已从数据库删除（DELETE 5，剩余 0）。
- 未完成：真实浏览器点击验收、邀请链接落地页 APK 下载与服务器托管、Android 端联动、`origin/main` 补推、生产级备份/监控。

## 2026-08-06 Android 内测版邀请分享与 APK 托管证据

- 用户确认 Android App 内提供“邀请家人/分享”能力：房主在 App 内生成邀请链接，通过系统分享面板/复制发给家人。
- Android 代码证据：`HomeInventoryApi` 新增 `POST api/family/invitations`；`InventoryRepository.createInvitationLink()` 基于当前 household 生成链接（家庭未加载时返回明确错误，服务端拒绝时透传服务端消息）；`DashboardViewModel` 新增邀请状态与 `generateInvitationLink()`；顶栏新增“邀请”按钮，`InviteDialog` 支持复制链接与 Android 系统分享（`ACTION_SEND`）。
- TDD 证据：`InventoryRepositoryTest` 新增链接生成成功/家庭未加载/服务端拒绝 3 个用例；`DashboardViewModelTest` 新增成功与失败 2 个用例；`TestApiStub` 同步补充 `createInvitation`。
- 版本与构建证据：`versionCode=3`、`versionName=0.2.0`；`gradlew :app:testDebugUnitTest :app:assembleDebug` 构建成功，APK 19,800,557 字节。本环境 AGP 的 JdkImageTransform 无法启动 javac，因 `minSdk=26` 已自带 `java.time`，关闭 core library desugaring（`isCoreLibraryDesugaringEnabled=false`）后构建通过，已写入 `android/app/build.gradle.kts` 注释说明。
- APK 托管证据：`scripts/upload-apk.ps1` 自动构建并上传 APK 与 `version.json`；线上 `https://homestorag.xyz/apk/home-inventory-internal-latest.apk` 返回 HTTP 200，`/apk/version.json` 返回版本 0.2.0 / code 3 / 19,800,557 字节。
- 落地页证据：服务器 `app.env` 已配置 `NEXT_PUBLIC_APK_DOWNLOAD_URL`，Web 重建后 `/join/<token>` 未登录页显示“下载 Android App（内测版）”按钮（线上验证通过）。
- 线上验证后临时账号已清理（DELETE 1，剩余 0）。
- 未完成：Android 真机安装点击验收（App 内“邀请”→ 系统分享 → 家人申请 → App 内批准）、Android App 启动时版本检查更新提示。

## 2026-08-06 Android 内测版申请审批证据

- 用户确认 Android App 内完成房主审批：查看待处理加入申请，直接在 App 内批准或拒绝。
- Android 代码证据：`HomeInventoryApi` 新增 `GET api/family/join-requests`、`POST api/family/join-requests/{id}/approve|reject`；`InventoryRepository` 新增 `listJoinRequests()` / `approveJoinRequest()` / `rejectJoinRequest()`（家庭未加载时明确报错，服务端拒绝透传消息）；`DashboardViewModel` 新增 `JoinRequestsUiState` 与刷新/批准/拒绝动作；`InviteDialog` 增加“加入申请”区块，展示申请人邮箱与申请时间，提供批准/拒绝按钮（处理中禁用）。
- TDD 证据：`InventoryRepositoryTest` 新增申请列表成功/家庭未加载/批准被拒 3 个用例；`DashboardViewModelTest` 新增显示 pending/批准成功后移除/拒绝失败显示错误 3 个用例。
- 版本与托管证据：`versionCode=4`、`versionName=0.3.0`，`gradlew :app:testDebugUnitTest :app:assembleDebug` 构建成功（19,816,941 字节）；已通过 `scripts/upload-apk.ps1` 上传服务器，`/apk/version.json` 显示 0.3.0 / code 4，APK URL 返回 HTTP 200。
- 服务端审批接口在 App 端复用，之前线上 smoke 已验证批准后成员可读、移除后失效；App 真机点击验收待用户完成。

## 2026-08-06 Android 更新提醒证据

- 用户确认 App 内增加更新提醒：服务器 APK 版本比本地新时，提示用户更新。
- 代码证据：`HomeInventoryApi` 新增 `GET apk/version.json`（公共静态文件，无需登录态）；`InventoryRepository.checkForUpdate()` 解析版本信息；`DashboardViewModel` 新增 `UpdateCheckUiState` 与 `checkForUpdates()`，用服务器 `versionCode > 本地 BuildConfig.VERSION_CODE` 判断是否有新版，检查失败静默不打扰；`DashboardHost` 进入清单页时检查一次，有新版弹 `AlertDialog`（“立即更新”用系统浏览器打开 APK 地址，“稍后”关闭）。
- TDD 证据：`InventoryRepositoryTest` 新增版本获取成功/网络失败 2 个用例；`DashboardViewModelTest` 新增服务器更新时提示、版本一致不提示、检查失败静默 3 个用例。
- 版本与托管证据：`versionCode=5`、`versionName=0.4.0`，构建成功并通过 `scripts/upload-apk.ps1` 上传，`/apk/version.json` 显示 0.4.0 / code 5。装有 0.3.0 及更早版本的用户打开 App 会收到更新提示（服务器 code 5 > 本地 code）。
- 真机验收：需用户安装 0.4.0 后确认无自更新提示（本地=服务器），再装 0.3.0 或等下一次发版验证提示弹窗。

## 2026-08-04 Excel 批量备份与导入证据

- 用户确认规则：导入以 `所在区域 + 格子编号 + 名称` 判断同格同名物品；备注和有效期完全相同则自动跳过；备注或有效期不同则在弹窗中对比当前数据和 Excel 数据，由用户选择跳过、都保留或覆盖；全新物品自动导入并按需创建缺失区域和格子。
- 参考文件证据：已检查 `C:\Users\Administrator\Desktop\置物管理系统\Excel备份\物品清单_2026-08-03_17-02-39.xlsx`，工作表为 `物品清单`，表头为 `序号 / 名称 / 格子编号 / 所在区域 / 备注 / 有效期`，共 290 行物品；样例中存在 `2028-10` 这种只有年月的有效期，导入预检会自动按 `2028-10-01` 处理。
- 代码证据：新增/修复 `src/features/inventory/excel-backup.ts`，覆盖 Excel 备份生成、参考表头解析、日期解析、导入预检、完全重复跳过和差异冲突识别；新增 `src/app/api/inventory/import/handlers.ts` 并保持 `route.ts` 只导出 Next.js 允许的 HTTP 方法；更新 `src/features/inventory/inventory-service.ts`，新增 `previewImportForCurrentUser` 和 `commitImportForCurrentUser`；更新 `src/features/inventory/self-hosted-inventory-client.ts` 和 `src/features/inventory/AppDashboard.tsx`，接入预检弹窗和冲突选择。
- 权限边界证据：导入预检和提交均通过当前 session 解析用户，服务端从当前用户 dashboard 推导 household；客户端不提交也不信任 `householdId`；覆盖只更新已有物品的备注和有效期。
- TDD 证据：先新增失败测试 `src/features/inventory/excel-backup.test.ts`、`src/features/inventory/inventory-service.test.ts`、`src/app/api/inventory/import/route.test.ts`、`src/features/inventory/self-hosted-inventory-client.test.ts` 和 `src/features/inventory/AppDashboard.test.ts`，确认缺少预检、提交和 route handler 边界后再实现。
- 验证证据：`npm test -- src/features/inventory/excel-backup.test.ts src/features/inventory/inventory-service.test.ts src/features/inventory/self-hosted-inventory-client.test.ts src/app/api/inventory/import/route.test.ts src/features/inventory/AppDashboard.test.ts` 通过 5 个测试文件 / 55 个测试；临时清空 `TEST_DATABASE_URL` 后执行 `npm test` 通过 30 个测试文件 / 199 个测试，2 个 PostgreSQL 集成占位测试跳过；`npm run lint` 通过；`npm run build` 通过并生成 `/api/inventory/import` 动态路由。
- 当前环境限制：当前 shell 中 `TEST_DATABASE_URL` 和 `DATABASE_URL` 指向 `postgres://postgres@localhost:5432/home_inventory_test`，但 `pg_isready -h localhost -p 5432` 返回 `localhost:5432 - no response`，因此带真实 PostgreSQL 环境变量直接运行 `npm test` 时，PostgreSQL 集成测试会因本机数据库未启动而失败。
- 部署证据：本地提交 `c74b0c4 feat: add excel backup import` 已推送到 GitHub `origin/main`；服务器 `/opt/home-inventory-app` 已拉取到 `c74b0c4`，执行 `npm ci` 和 `npm run build` 成功，构建路由包含 `/api/inventory/import`，`home-inventory-app.service` 重启后为 `active`。
- 公网 smoke 证据：`curl -I https://homestorag.xyz/login` 返回 HTTP 200；`curl -I https://homestorag.xyz/app` 返回 HTTP 200；未登录 `POST https://homestorag.xyz/api/inventory/import?mode=preview` 返回 HTTP 401 和 `{"ok":false,"message":"Authentication required"}`。
- 2026-08-04 导入同名格子修复证据：用户导入时遇到 `duplicate key value violates unique constraint "locations_unique_name_per_household"`；根因是数据库约束要求同一 household 内 `locations.name` 唯一，而导入提交曾按 `所在区域 + 格子编号` 判断是否创建格子。已改为按格子编号复用已有位置，只有格子编号不存在时才创建新位置；新增测试覆盖 Excel 区域不同但格子编号已存在时复用旧位置。验证：`npm test -- src/features/inventory/excel-backup.test.ts src/features/inventory/inventory-service.test.ts src/app/api/inventory/import/route.test.ts` 通过 3 个文件 / 37 个测试，`npm run lint` 通过，`npm run build` 通过。

## 2026-08-04 Android 原生内测版设计确认

- 用户确认路线：先做 Android 原生内测 APK，后续再规划 iOS。
- 用户确认技术形态：Kotlin 原生 Android，不采用 React Native/Expo，不采用 WebView 套壳。
- 用户确认离线能力：第一阶段包含离线缓存和离线编辑。
- 用户确认冲突策略：服务器优先。离线编辑或删除已有数据时，如果服务器数据已变化，Android 不自动覆盖服务器。
- 用户补充离线新增要求：离线状态下新增物品后，网络恢复时应自动尽快同步到服务器。
- 用户确认账号边界：Android 复用现有邮箱 + 密码账号和后端权限，不单独创建移动端账号系统。
- 设计文档：`docs/superpowers/specs/2026-08-04-android-native-internal-test-design.md`。
- 后续实现验收必须至少覆盖：Android 内测 APK 可构建；现有账号可登录；在线 CRUD 可用；离线可查看最近清单；离线新增物品恢复联网后自动同步；离线编辑/删除冲突不覆盖服务器较新数据；Android API 权限负例验证用户 A/B 数据隔离；Android 不保存明文密码或后端/数据库密钥。
## 2026-08-04 Android 原生内测版本地实现证据

- 代码证据：新增 `android/` Kotlin 原生 Android 工程，包名为 `com.homeinventory.app.internal`，当前用于内测 debug APK；工程包含 Gradle wrapper、AGP/Kotlin/Compose 配置、Manifest、Compose 入口界面、登录 session 层、Retrofit API 客户端、Room 本地缓存实体/DAO、pending operations 队列和 `SyncEngine`。
- 后端移动同步 API 证据：新增 `/api/mobile/inventory/snapshot` 和 `/api/mobile/inventory/sync`，所有请求通过当前 `home_inventory_session` 解析用户；sync 请求不接受客户端提供的 `householdId`，服务端从当前用户推导 household 并执行权限边界。
- 离线新增同步证据：Android `InventoryRepository.createItemOffline` 会把新物品写入本地 `items`，并写入 `pending_operations`；`SyncEngine.syncPendingOperations` 会提交 pending operation，服务端返回 `applied` 后标记为 applied，返回 `conflict` 或 `failed` 后标记冲突；`syncWhenOnline` 会在网络状态恢复为在线时触发一次同步。
- 冲突策略证据：服务端 sync 层要求 update/delete 提交 `baseServerUpdatedAt`，并使用服务端版本检查；版本不匹配时返回 conflict，不覆盖服务端较新数据。
- 安全证据：Android 代码不保存明文密码，不包含数据库密码、Supabase service role key、私钥、真实云密钥或真实用户数据；当前默认 base URL 为模拟器访问本机开发服务的 `http://10.0.2.2:3000/`，不是生产密钥或云服务直连。
- Android 验证命令：`cd android && gradle :app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet` 通过，debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。
- 后端移动验证命令：清空本地数据库环境变量后执行 `npm test -- src/features/inventory/mobile-sync.test.ts src/features/inventory/inventory-service.test.ts src/app/api/mobile/inventory/sync/route.test.ts src/app/api/mobile/inventory/permissions.test.ts`，通过 4 个测试文件 / 46 个测试。
- 全量本地验证命令：清空本地数据库环境变量后执行 `npm test`，通过 34 个测试文件 / 225 个测试，2 个 PostgreSQL 集成占位测试跳过；`npm run lint` 通过；`npm run build` 通过，并在构建路由中列出 `/api/mobile/inventory/snapshot` 和 `/api/mobile/inventory/sync`。
- 当前未完成/未验证：尚未在真机或模拟器中完成安装点击验收；Android UI 当前是内测库存界面骨架，新增按钮先写入界面状态，尚未完整接到 Room repository；真实邮箱密码登录 UI、在线 CRUD UI、快照下拉刷新、真实网络恢复监听实现和端到端同步点击流仍需后续阶段完成。

## 2026-08-05 Android 登录后加载真实清单修复与线上部署证据

- 用户反馈：阿里云服务器已上线，Android 内测 APK 登录成功后显示的不是自己的物品清单。
- 根因证据：`android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryViewModel.kt` 初始状态硬编码了示例条目 `Offline item draft / Saved locally and ready to sync / pending_create`；`AppRoot` 登录成功后直接渲染该状态，从未调用 `/api/mobile/inventory/snapshot`；且服务器当时部署的 main 分支没有移动端路由，实测 `GET https://homestorag.xyz/api/mobile/inventory/snapshot` 返回 404。移动端 API 只存在于 worktree 分支 `codex/android-native-internal-test`，未合并、未部署。
- 代码证据（Android）：`InventoryViewModel` 新增构造依赖 `loadSnapshot`、`refreshFromServer()` 与 `loadFromServer()`，登录成功后自动拉取快照，映射位置名并渲染真实清单；移除硬编码示例条目；失败时展示服务端错误消息，空清单展示空状态。`InventoryRepository` 新增 `loadSnapshot()`，正确解析成功体与 `errorBody()` 错误消息。`InventoryScreen` 将“Add 假数据”按钮替换为“刷新”，支持加载中/错误/空状态。`AppRoot` 组装 Room 单例、API 与仓库，登录成功即触发 `refreshFromServer()`。`AppDatabase` 新增 `getInstance()` 单例。
- 代码证据（Web）：`/api/mobile/inventory/snapshot` 与 `/api/mobile/inventory/sync` 从 worktree 分支合并回 `main`（提交 `6a2af52`），服务端仍通过当前 session 解析用户并拒绝未登录请求。
- TDD 证据：先新增 `InventoryViewModelTest.kt`（初始无示例条目、成功加载含位置名、空清单、失败提示、refresh 触发）与 `InventoryRepositoryTest.kt`（快照成功、错误响应消息、网络异常），先看到因功能缺失导致的编译失败，再实现后转绿。
- Android 验证：`gradle :app:testDebugUnitTest --no-daemon` 全部通过；`gradle :app:assembleDebug --no-daemon` 成功生成 debug APK。
- Web 验证：PostgreSQL 集成测试（`--no-file-parallelism`）2 个文件通过；清空 `TEST_DATABASE_URL`/`DATABASE_URL` 后 `npm test` 通过 34 个测试文件 / 225 个测试，2 个占位跳过；`npm run lint` 通过；`npm run build` 通过并生成 `/api/mobile/inventory/snapshot` 与 `/api/mobile/inventory/sync` 路由。
- 部署证据：服务器 `/opt/home-inventory-app` 以可回滚方式切换：克隆最新 main（`6a2af52`）到新目录，`npm ci` 与 `npm run build` 成功，备份旧目录为 `/opt/home-inventory-app.bak.20260805_171226`，新目录改名为 `/opt/home-inventory-app` 并重启 `home-inventory-app.service`，状态 `active`。本次同时修复了服务器 `deploy` 用户无独立 HOME 导致 npm 无法写日志的问题（创建 `/home/deploy`）。
- 线上验证证据：未登录 `GET https://homestorag.xyz/api/mobile/inventory/snapshot` 返回 401 `{"ok":false,"message":"Authentication required"}`（原 404）；`POST /api/mobile/inventory/sync` 返回 401；`/login` 返回 200。
- 端到端 smoke 证据：通过公网 API 注册临时用户 → 空清单 snapshot 返回默认 household 与空数组 → 创建区域/位置/物品成功 → 登录后 snapshot 返回该用户自己的 1 个区域、1 个位置、1 个物品，字段与 Android DTO 一致（`area_id`、`expire_date`、`location_id`、`updatedAt`）。冒烟用户及其关联数据已从 `home_inventory_test` 数据库级联删除，剩余 smoke 用户数为 0。
- 剩余未验证：Android 真机安装新 APK 后的点击验收（需要用户重新安装/构建 debug APK）；Android 离线缓存与冲突同步的完整点击流仍按设计文档后续推进。

## 2026-08-05 Android 界面对齐移动网页端与离线同步实现证据

- 用户需求：账号自动保存/自动登录；Android 界面与移动网页端一致（区域/位置/物品增删改、搜索、筛选、排序、过期提醒、Excel 导入导出）；离线能力一起实现。设计文档：`docs/superpowers/specs/2026-08-05-android-dashboard-alignment-design.md`；实施计划：`docs/superpowers/plans/2026-08-05-android-dashboard-alignment.md`。
- 会话层证据：新增 `CookieHeaderParser`（解析 `home_inventory_session`）与 `EncryptedSessionStore`（EncryptedSharedPreferences 持久化 session cookie，不存密码）；`HomeInventoryApplication` 提供 session/database 单例；`AppRoot` 启动时根据已存 cookie 自动进入清单页，退出时清除并回登录页。
- 数据层证据：Room v2 建齐 `areas` / `locations` / `items` / `pending_operations` / `sync_state` 五张表；`InventoryRepository` 统一入口：快照落库、在线 CRUD（先调 API 成功再写 Room）、离线新增/编辑/删除（写 Room + 入待同步队列）；`SyncEngine` 在网络恢复后按队列提交，成功用服务端 id/updatedAt 替换本地，冲突保留并提示；`AndroidConnectivityObserver` 监听网络恢复自动同步。
- UI 层证据：`DashboardScreen` 复刻移动网页端布局（顶部「家中清单 + 备份/导入/退出」、搜索栏、区域条、位置条、物品列表 + 排序、悬浮「新增」按钮）；物品行点击编辑（弹窗含删除）；新增物品/位置/区域弹窗；主题色与 Web token 对齐（`#4E6F5D` 主色、`#F7F5EF` 背景等）。
- Excel 层证据：`ExcelBackupGenerator` 用 Apache POI 生成 `物品清单_YYYY-MM-DD_HH-mm-ss.xlsx`（表头 `序号/名称/格子编号/所在区域/备注/有效期`），导出写入系统下载目录；导入走系统文件选择器 → multipart 上传 `/api/inventory/import?mode=preview` 预检 → 冲突行选择（跳过/都保留/覆盖）→ commit 提交 → 汇总提示（新增/覆盖/保留重复/跳过/失败行）。
- 验证证据：`gradle :app:testDebugUnitTest --no-daemon` 通过 9 个测试文件 / 26 个测试（会话、仓库、同步、校验、ViewModel、Excel、导入契约）；`gradle :app:assembleDebug --no-daemon` 成功，debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`；服务端契约回归 `npm test` 通过 34 个文件 / 225 个测试，`npm run lint` 通过。
- 剩余未验证：Android 真机安装后的完整点击验收（自动登录、在线增删改、搜索/筛选/排序/过期、导出/导入、断网离线编辑、恢复自动同步、冲突提示、退出清理）；这些需要在真机按验收清单执行后写回证据。服务器无需变更（复用现有 API）。

## 2026-08-07 拍照识别物品设计确认

- 用户确认将「拍照识别物品」纳入 Android 内测版阶段范围（原真源「第一版不做照片上传、AI 图片识别」相应调整，仍不做高清原图与扫码识别）。
- 已确认决策：拍物品正面照识别名称自动填表 + 可选拍有效期照片识别过期日；只保存 160–200px 缩略图（约 5–15KB），原图识别后即弃；AI 服务用火山引擎豆包视觉（API key 仅存服务器）；识别链路为 Android 本地压缩（约 1280px、200–400KB）→ 服务器生成缩略图暂存并调豆包 → 返回名称/日期与缩略图 id → 保存物品时关联；第一版缩略图存服务器本地磁盘并预留 OSS 抽象；Android 先行，Web/PWA 后续。
- 成本评估：单次识别约 0.005–0.02 元；缩略图方案下 10 万张约 1GB，存储与流量成本可忽略，第一版不接 OSS。
- 设计文档：`docs/superpowers/specs/2026-08-07-photo-recognition-design.md`；已同步更新 `dev-docs/project-brief.md`、`dev-docs/architecture.md`、`dev-docs/database-design.md`、`dev-docs/technical-selection.md`。
- 验收前置：识别接口 TDD（mock 豆包）、用户 A/B 缩略图与 photoKey 权限负例、孤儿清理、频率限制；Android 端压缩上传与失败兜底；真机验收清单见设计文档。
- 未验证/未实施：数据库 migration（`items.photo_key` + `pending_photos`）尚未编写执行；识别接口与 Android 端尚未实现；豆包账号与 API key 尚未开通；隐私政策关于照片发送至火山引擎的条款待公开推广前补齐。

## 2026-08-07 拍照识别实施证据

- 分支与计划：隔离 worktree 分支 `codex/photo-recognition`；实施计划 `docs/superpowers/plans/2026-08-07-photo-recognition.md`，设计 `docs/superpowers/specs/2026-08-07-photo-recognition-design.md`。
- 数据库 migration：`dev-docs/sql/photo_recognition_self_hosted.sql`（`items.photo_key` 列 + 唯一部分索引 + `pending_photos` 表 + 索引 + grants）。本机 PostgreSQL 未启动，SQL 语法验证标记「未验证」，需在服务器部署时执行。
- 服务器端实现：本地照片存储（`src/server/photos/photo-store.ts`，安全 key 校验）；缩略图生成（`thumbnail.ts`，jpeg-js 缩到 200px）；豆包视觉客户端（`doubao-vision.ts`，火山方舟 OpenAI 兼容接口，API key 只存服务器环境变量）；每账号 10 次/分钟限频（`rate-limiter.ts`）；PostgreSQL 照片仓库（`photo-repository.ts`）；识别服务（`recognition-service.ts`：name 模式暂存缩略图并识别名称，expiry 模式只读日期不存图，photoKey 仅创建人可关联，24 小时孤儿清理）；识别路由 `POST /api/recognition`（401/400/429/501 映射 + 惰性清理）；物品创建携带 `photoKey` 关联（`items/handlers.ts`）；图片读取 `GET /api/inventory/items/[itemId]/photo`（登录 + 家庭权限）；删除物品清理照片文件（`items/[itemId]/handlers.ts`）；dashboard/移动快照透传 `photo_key`。
- TDD 证据：新增 `photo-store.test.ts`(3)、`thumbnail.test.ts`(3)、`doubao-vision.test.ts`(5)、`rate-limiter.test.ts`(3)、`recognition-service.test.ts`(6，含用户 B 不能关联用户 A 的 photoKey 等权限负例与清理)、`recognition/route.test.ts`(4)、`items/photo-attach.test.ts`(3)；`dashboard-data.test.ts` 补充 `photoKey` 期望。全量 `npm test` 46 文件 / 295 通过 / 2 个 PostgreSQL 集成占位跳过（本机数据库未启动）；`npm run lint` 通过；`npm run build` 通过，路由表含 `/api/recognition` 与 `/api/inventory/items/[itemId]/photo`。
- Android 实现：FileProvider + `res/xml/file_paths.xml`；版本 0.5.0 / code 6；DTO 扩展（`RecognitionResponseDto`、`ItemCreateRequest.photoKey`、`RemoteItemDto.photoKey`）；API 接口 `recognize`/`itemPhoto`；`ImageCompressor`（本地压缩到约 1280px JPEG）；`InventoryRepository` 新增 `recognizeItemPhoto`/`loadItemPhoto`、`createItemOnline` 携带 photoKey；Room v3 + `MIGRATION_2_3`（`items.photoKey`）；`ItemFormDialog` 新增「拍照识别名称」「拍摄有效期」入口（拍照/相册来源选择，识别结果回填名称/过期日/缩略图 id，失败提示手动兜底）；`ItemList` 物品行显示缩略图；`DashboardViewModel` 委托 `recognizeItemPhoto`/`itemPhoto`。
- Android TDD 证据：`InventoryRepositoryTest` 新增识别成功/服务端拒绝 2 例；`DashboardViewModelTest` 新增委托成功/失败 2 例；`gradle :app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet` 通过（49 个单测），debug APK 19,911,801 字节。
- 未验证/待办：豆包账号与 API key 未开通（缺 key 时识别接口返回 501，App 手动输入兜底）；migration 未在真实 PostgreSQL 执行；服务器未部署（需执行 migration，`app.env` 增加 `DOUBAO_API_KEY`/`DOUBAO_VISION_MODEL`/`DOUBAO_VISION_BASE_URL`/`PHOTO_STORAGE_DIR`，`data/photos` 纳入备份）；Android 真机拍照识别点击验收未做；隐私政策「拍照识别会把照片发送给火山引擎处理」条款待公开推广前补齐。

## 2026-08-07 拍照识别部署上线证据

- 代码部署：分支 `codex/photo-recognition` 已合并进 main 并推送 GitHub（`d493059..e1aee64`）；服务器 `/opt/home-inventory-app` 为全新克隆 + `npm ci` + `npm run build`，`git log --oneline -1` = `e1aee64`，systemd 服务运行正常。
- 数据库：`dev-docs/sql/photo_recognition_self_hosted.sql` 已在 `home_inventory_test` 执行；重跑输出显示 `photo_key` 列、`items_photo_key_unique` 索引、`pending_photos` 表与索引均 already exists（此前已执行），`GRANT` 正常。
- 环境变量：`/etc/home-inventory-app/app.env` 已追加 `DOUBAO_API_KEY`/`DOUBAO_VISION_MODEL`/`DOUBAO_VISION_BASE_URL`/`PHOTO_STORAGE_DIR`；`data/photos` 目录已创建并归属 `deploy`；服务已重启。
- Nginx：`client_max_body_size` 从 1m 调整为 8m（识别图片最大 4MB），`nginx -t` 通过并 reload。
- 路由上线验证：未登录 `POST https://homestorag.xyz/api/recognition` 与 `GET https://homestorag.xyz/api/inventory/items/test/photo` 均返回 401 `{"ok":false,"message":"Authentication required"}`（旧版本无此路由）。
- APK 托管：`scripts/upload-apk.ps1` 构建并上传 0.5.0（code 6，19,850,305 字节）；`https://homestorag.xyz/apk/version.json` 返回 0.5.0/code 6；APK 下载返回 200。
- 部署中发现的问题与修复：全新克隆后 `public/` 目录不存在（git 不跟踪空目录），上传脚本创建的 `public/apk` 在服务启动之后才出现，Next.js 启动后未服务该目录，`/apk/*` 一度 404；重启 `home-inventory-app.service` 后 `/apk/version.json` 与 APK 均返回 200。教训：APK 上传后若 `/apk/*` 404，需重启服务（或部署时先创建 `public/apk` 再启动）。
- 识别接口 501 事故与修复：真机拍照秒弹「识别失败」，服务器端 curl 复现返回 501 `DOUBAO_API_KEY is required`。根因：`/etc/home-inventory-app/app.env` 中 `DOUBAO_API_KEY` 行在 nano 粘贴时被拆坏——第 7 行残留值仅 4 字符且含特殊字符（systemd 实际加载为空值），完整 Key（`ark-…-a072`，46 字符）被粘贴到无 `=` 的独立行。修复：备份 app.env 后用完整 Key 重建该行、删除孤立行、重启服务，systemd 加载长度变为 46；curl 端到端复测识别接口返回 200（纯色测试图 `recognized:false` 属预期），临时调试用户与测试缩略图已清理。教训：粘贴 API Key 后应检查文件中无孤立行，且可用 `tr '\0' '\n' < /proc/<pid>/environ | grep DOUBAO` 核对服务实际加载值。
- 新增按钮失效 bug 与修复：用户反馈悬浮「新增」按钮点击无反应且能穿透点到下方物品。根因：`FloatingAddButton` 自 8806302（Android 界面对齐）起就未把 `onClick` 挂到任何可点击修饰符上（Column 缺少 `.clickable`），按钮纯视觉、触摸穿透，属存量 bug 而非拍照识别引入。修复：给 Column 增加 `.clickable(onClick = onClick)`；版本升至 0.5.1 / code 7 并上传服务器（version.json 返回 0.5.1/code 7，APK 200）；Android 单测全通过。真机需安装 0.5.1 验证新增弹窗与识别。
- 识别 413 事故与修复：0.5.1 真机拍照仍「识别失败」。Nginx 访问日志显示设备请求（okhttp/4.12.0，约 1.3–1.6MB）被 413 拒绝（`client intended to send too large body`）。根因：`/etc/nginx/sites-enabled/home-inventory-app` 是普通文件而非软链接（8 月 6 日的旧副本），此前对 `sites-available/home-inventory-app` 的 `client_max_body_size 1m→8m` 修改从未被 Nginx 加载；`nginx -T` 中生效值始终是 1m。修复：备份旧文件到 `/etc/nginx/backups/`，将 sites-enabled 改为指向 sites-available 的软链接，`nginx -t` + reload 后生效配置为 8m；用 2MB 随机文件实测上传返回应用层 400「仅支持 JPEG」而非 413，证明上限已解除。教训：Ubuntu Nginx 标准布局中 sites-enabled 应为软链接；修改配置后应以 `nginx -T` 核对生效值，而不仅是 `nginx -t`。
- 识别 499 超时事故与修复：Nginx 放行后设备请求返回 499（客户端在响应前断开），App 提示「无法连接服务器」。根因：相机路径漏了本地压缩（`cameraFile.readBytes()` 直接传原图，约 1.6MB），服务器纯 JS（jpeg-js）解码大图 + 豆包识别耗时逼近/超过 OkHttp 默认 10s 读超时，客户端主动断开。实测 600KB 图片全链路约 5.8s。修复（0.5.2 / code 8）：相机拍照也走 `ImageCompressor.compressToJpeg`（1280px、约 200–400KB）再上传，并把 OkHttp 超时调为 connect 20s / read 60s / write 60s。APK 已上传，version.json 返回 0.5.2/code 8；Android 单测通过。教训：上传前压缩是硬要求（设计真源 `docs/superpowers/specs/2026-08-07-photo-recognition-design.md`），两条取图路径都要走压缩，不能只压缩相册。
- 0.5.2 误传旧 APK 事故与修复：首次上传「0.5.2」时误用 `upload-apk.ps1 -SkipBuild`，而当时只跑了 `testDebugUnitTest`（不产出新 APK），上传的是 0.5.1 的构建产物，version.json 却声称 0.5.2/code 8；用户点更新下载到的实际是 0.5.1，装完仍是旧行为。修复：完整执行 `upload-apk.ps1` 重新构建并上传，用 `aapt dump badging` 确认本地 APK 为 versionCode 8 / versionName 0.5.2，并比对服务器 APK SHA-256 与本地一致；给 `scripts/upload-apk.ps1` 增加防护——`-SkipBuild` 时若 APK 最后修改时间早于 `build.gradle.kts` 则直接报错，防止再次误传旧产物。教训：上传前必须核对 APK 内版本（aapt），不能只信 version.json。
- 未验证/待办：豆包真实识别未验证（需 App 0.5.0 真机拍照验收；若识别报模型不存在需核对 `DOUBAO_VISION_MODEL` 与已开通模型 ID）；`data/photos` 备份策略待纳入备份范围；隐私政策「照片发送至火山引擎」条款待公开推广前补齐。

## 2026-08-07 0.5.3 应用图标与照片功能证据

- 应用图标：用户提供豆包生成的 3D 黏土风图标（薄荷绿渐变圆角方块 + 白色立体房子/叠放收纳盒/抽屉/放大镜，无水印版本）。处理：无需裁剪（绿色方块铺满画布，仅圆角处留白），从 2048px 源图用 LANCZOS 生成 `mipmap-{mdpi..xxxhdpi}/ic_launcher.png` 与 `ic_launcher_round.png`；`AndroidManifest.xml` 配置 `android:icon`/`android:roundIcon`，应用名改为「家庭物品」。192px 图标经 Kimi 检查元素可辨、无水印。
- 照片功能（本地清晰图 + 缩略图管理）：
  - 存储决策：服务器只存 200px 缩略图（几 KB，不变）；1280px 压缩清晰图保存在手机本地 `filesDir/photos/<photoKey>.jpg`（`LocalPhotoStore`），放大查看本地优先、缺失时回退服务器缩略图。
  - 服务器：识别接口新增 `mode=photo`（只生成缩略图并暂存，不调豆包，省识别费用）；物品更新接口（`PATCH /api/inventory/items/[itemId]`）支持 `photoKey`，关联后返回 `photo_key`。
  - Android：拍照/相册压缩后本地保存清晰图；列表缩略图可点击弹出 `PhotoPreviewDialog` 放大查看（点击任意处关闭）；编辑弹窗显示当前照片并可「添加/更换照片」（无图物品可补图，换图时删除旧本地文件）；`updateItemOnline` 携带 `photoKey` 关联。
  - 测试：服务器 `recognition-service.test.ts` 新增 photo 模式（存缩略图、不调豆包）、`recognition/route.test.ts` 新增 `mode=photo` 返回 thumbnailId、`photo-attach.test.ts` 新增 PATCH 关联；Android `InventoryRepositoryTest` 新增 `uploadThumbnailOnly` 成功用例。全量 `npm test` 1086 通过 / 8 跳过，`npx eslint src` 通过，`npm run build` 通过；Android 单测 + `assembleDebug` 通过。
  - 版本：0.5.3 / code 9，APK 20,032,951 字节，`aapt dump badging` 确认 `application-label:'家庭物品'`；已上传服务器，version.json 返回 0.5.3/code 9，服务器 APK SHA-256 与本地一致。
  - 待办：服务器新代码（`mode=photo` + PATCH photoKey）部署上线；真机验收（点缩略图放大、编辑看图、无图加图、换图）；换设备/重装后放大查看回退为服务器模糊缩略图（符合既定存储决策）。

## 2026-08-07 0.5.4 识别详情与弹窗布局修复证据

- 用户反馈：新增物品识别后照片预览把保存按钮挤出屏幕（弹窗内容过高）；识别名称太短；希望自动补备注。
- 布局修复：不采用滚动方案（用户明确不需要），改为把照片预览从独立行移到标题行右侧（44dp 小缩略图）、弹窗间距 14dp→10dp、按钮文案缩短（识别名称/识别日期/添加照片），弹窗高度明显降低，保存按钮回到可视区。
- 识别详情：豆包提示词改为「第一行返回详细中文名称（尽量含品牌/规格，如 蒙牛纯牛奶250ml），第二行返回一句简短备注（如 常温保存）」，服务端解析两行并新增 `note` 字段；Android `RecognitionDraft`/DTO 增加 `note`，备注为空时自动填入识别备注。
- 测试：`doubao-vision.test.ts` 新增两行解析/无备注用例并改 `recognizeItemDetails`；`recognition-service.test.ts` 断言 note；Android `InventoryRepositoryTest`/`TestApiStub` 补 note 断言。全量 `npm test` 1087 通过 / 8 跳过，lint/build 通过；Android 单测 + 打包通过。
- 版本：0.5.4 / code 10 已上传（version.json 确认），服务器识别代码已同步重建并重启；线上 smoke：`mode=name` 返回 `{"name":"蒙牛纯牛奶250m","note":null,...}`（纯文字测试图无备注属预期）。
- 备注：服务器本次通过 scp 直接同步两个识别文件重建（GitHub 推送当时网络中断，提交 `dddae7b` 待网络恢复后补推，服务器 git 工作区有 2 个文件未提交，需在下次正式部署时通过克隆对齐）。

## 2026-08-07 0.5.5 草稿箱功能证据

- 需求：识别较慢，支持「拍照 → 存入草稿箱 → 继续识别下一个 → 草稿列表 → 编辑或直接保存」的批量录入流程；识别完成自动更新草稿名称/备注。
- 已确认设计：草稿只存手机本地（换设备不带走）；存入草稿箱不等待识别（后台识别完成自动更新名称/备注）；主界面顶部「草稿」按钮 + 数量角标；草稿条目支持 编辑 / 直接保存 / 删除。
- 实现：新增 Room `drafts` 表（`DraftEntity`/`DraftDao`，DB 版本 4 + `MIGRATION_3_4`）；`DraftRepository` 实现 `DraftGateway`（本地照片 `draft_<id>.jpg` + 识别后补存 `photoKey` 文件、后台 `recognize(mode=name)` 更新草稿名称/备注/状态）；`DashboardViewModel` 增加 `draftsState`、`saveToDraft`（空名称时后台识别）、`confirmSaveDraft`（调 `createItemOnline` 建档后删草稿）、`deleteDraft`、`readDraftPhoto`；`ItemFormDialog` 保存按钮旁加「存入草稿箱」按钮（仅新增模式，记录最近照片字节）；`TopBar` 加「草稿」角标按钮；新增 `DraftsDialog` 列表（缩略图/识别中…/备注/编辑/保存/删除）；`DashboardHost` 接线草稿编辑（编辑草稿 → 表单 → 保存即建档）。
- 测试：`DashboardViewModelTest` 新增 3 例（存草稿触发后台识别、确认保存建档并删草稿、草稿列表状态）。Android 单测 + `assembleDebug` 通过。
- 版本：0.5.5 / code 11，APK 20,082,103 字节，`aapt` 确认 `application-label:'家庭物品'`；已上传服务器，version.json 返回 0.5.5/code 11，服务器 APK SHA-256 与本地一致。服务器无需变更（建档复用 POST items + photoKey 关联）。
- 待办：真机验收草稿流程（新增 → 拍照识别 → 存入草稿箱 → 连续录入 → 草稿列表自动更新名称/备注 → 编辑或直接保存）；确认保存后草稿删除且物品出现在清单。

## 2026-08-07 0.5.6 新增区域/格子、批量导入、无图拍照按钮证据

- 新增区域/格子：添加物品弹窗的「所属区域」下拉顶部加「＋ 新增区域」、「位置」下拉顶部加「＋ 新增格子」（需先选区域），直接打开对应的新增弹窗，保存后清单实时更新（Room flow 驱动）。
- 批量导入：添加物品弹窗按钮排改为 FlowRow（可换行），「批量导入」放在「识别名称」右侧；通过系统多选照片（PickMultipleVisualMedia），每张压缩后自动识别（mode=name）并直接建到当前选中的格子（名称识别失败回退「未识别物品」，备注自动带入），按钮显示「导入中 x/y」进度，完成后自动关闭面板。
- 无图物品拍照按钮：物品列表里没有缩略图的物品，原来只显示名称首字的小方块，改为带文字「拍照」的明显按钮（品牌绿文字、统一圆角），点击直接打开相册选图 → 压缩 → 上传生成缩略图（mode=photo）→ 关联该物品并保存本地清晰图，列表立即出现缩略图。
- 测试：Android 单测全通过（含既有草稿/识别用例），`assembleDebug` 通过。
- 版本：0.5.6 / code 12，已上传服务器，version.json 返回 0.5.6/code 12，服务器 APK SHA-256 与本地一致。服务器无需变更。
- 待办：真机验收（下拉新增区域/格子、批量导入多图、无图物品点「拍照」补图）；推送 GitHub（网络不稳定时提交在本地）。

## 2026-08-07 0.5.7 批量导入支持草稿箱证据

- 需求：批量导入也可以先存入草稿箱，而不是直接建档。
- 实现：点「批量导入」（需先选格子）先弹出「批量导入方式」选择（直接保存到清单 / 存入草稿箱）；选草稿箱后每张照片压缩 → 创建草稿（预填当前区域/位置、识别中状态）→ 后台识别完成自动更新名称/备注；进度仍显示「导入中 x/y」，完成后关闭面板，草稿角标更新。
- 测试：`DashboardViewModelTest` 新增 `batchImportToDraftsCreatesDraftsAndRecognizes`（2 张照片建 2 条草稿并触发识别、区域/位置预填）。Android 单测 + `assembleDebug` 通过。
- 版本：0.5.7 / code 13，已上传服务器，version.json 返回 0.5.7/code 13，APK SHA-256 与本地一致。服务器无需变更。
- 待办：真机验收批量导入的两种方式。

## 2026-08-07 0.5.8 识别中可存草稿证据

- 需求：拍照识别过程中（名称尚未识别出来）即可存入草稿箱，不等识别完成。
- 实现：新增物品弹窗「存入草稿箱」按钮在识别进行中不再禁用（仅 `isSaving` 时禁用）；识别中存草稿时草稿以「识别中」状态保存，弹窗关闭后由 ViewModel 后台继续识别并自动更新名称/备注（原有草稿后台更新机制）。
- 测试：Android 单测全通过，`assembleDebug` 通过。
- 版本：0.5.8 / code 14，已上传服务器，version.json 返回 0.5.8/code 14，APK SHA-256 与本地一致。服务器无需变更。
- 待办：真机验收（拍照识别中途直接存草稿，草稿稍后自动补名称/备注）。

## 2026-08-07 0.5.9 / 0.5.10 草稿箱闪退修复证据

- 现象：保存草稿后点击「草稿」直接闪退，无崩溃弹窗，单张照片也会触发。
- 根因：识别中直接存草稿时草稿 `photoKey` 为空字符串 `""`（识别未完成，缩略图 id 未生成）；打开草稿箱渲染缩略图时 `LocalPhotoStore.read("")` 把照片目录当文件读取，旧实现 `file.readBytes()` 读目录抛异常，组合阶段未捕获 → 闪退。
- 修复（0.5.9）：`LocalPhotoStore.read` 改为按目标尺寸采样解码（`inSampleSize`）+ `decodeFile`（不再整体读入 byte[]）+ OOM/异常兜底返回 null；列表/表单预览按 256px 解码、大图预览按 1600px 解码。
- 修复（0.5.10）：空 `photoKey` 规范化（空串→null），草稿创建/识别更新时不再落空串；`DashboardHost` 存草稿时同样归一化。
- 测试：Android 单测全通过，`assembleDebug` 通过。
- 版本：0.5.9 / code 15 与 0.5.10 / code 16 均已上传，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（识别中存草稿 → 打开草稿箱不再闪退；草稿缩略图正常显示）。

## 2026-08-07 0.5.11 草稿后台自动识别修复证据

- 现象：草稿箱能打开了，但识别中的草稿长时间停在「识别中」，疑似保存到草稿后识别停止。
- 修复方向（按用户要求：不是打开草稿箱时重试，而是保存后自动在后台识别，打开前应已完成）：
  - 保存草稿/批量导入草稿后立即在 ViewModel 后台协程识别该草稿（不依赖草稿列表状态，直接识别刚创建的草稿 id）。
  - 识别调用加 35 秒超时兜底，超时/失败一律把草稿标记为完成（不再永久卡在「识别中」），并记录 Log.w 便于排查。
  - 并发去重：同一草稿不会重复识别。
  - App 启动时自动补识别遗留的「识别中」草稿（跨重启场景）。
- 测试：Android 单测全通过（fake 识别后标记 Ready，覆盖启动补识别不重复处理），`assembleDebug` 通过。
- 版本：0.5.11 / code 17，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（识别中存草稿 → 不打开草稿箱，稍后打开时草稿应已识别完成；批量导入草稿同理）。

## 2026-08-07 0.5.12 默认区域格子、批量导入去弹窗、前台补识别证据

- 新增物品默认值：记忆最近一次使用的区域/格子（保存物品、存草稿、确认草稿时记录），下次「新增物品」自动预选（若位置已不存在则回退为空）；「＋ 新增格子」打开的位置弹窗默认带当前选中的区域（原有逻辑核对生效）。
- 批量导入：去掉「直接保存/存入草稿箱」选择弹窗，点「批量导入」直接进入系统多选照片，默认全部存入草稿箱（每张建草稿并后台识别）。
- 锁屏/后台识别中断修复：App 回到前台（ON_RESUME）自动补识别「识别中」或「已完成但名称为空且无缩略图」的草稿；App 启动时同样自动补识别；识别带 35 秒超时兜底。修复「锁屏后重开一直是未命名物品」。
- 测试：Android 单测新增 `resumePendingRecognitionsRetriesBlankNameDrafts`（前台恢复会重试空名称草稿），全量通过；`assembleDebug` 通过（仅 LocalLifecycleOwner 弃用警告，无碍）。
- 版本：0.5.12 / code 18，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（记忆区域/格子默认值、批量导入直进选图、锁屏后重开草稿自动补识别）。

## 2026-08-07 0.5.13 长按管理区域/位置、未分配筛选证据

- 长按管理：区域条、位置条支持长按（combinedClickable）打开编辑弹窗——区域可重命名/改颜色/删除；位置可重命名/重新分配区域（弹窗内区域下拉）/删除。删除区域时其位置与物品按数据库外键规则处理（位置归未分区、物品保留）；删除位置时物品变为未分配。
- 未分配筛选：物品列表标题「物品」旁新增「未分配」按钮（激活时显示「未分配 ✓」），点击筛选出所有未选择位置（含未选区域）的物品；不选区域/位置直接保存的物品照常出现在清单和「未分配」列表；切换未分配会清空区域/位置筛选，选择区域/位置也会自动退出未分配。
- 测试：`DashboardViewModelTest` 新增 `unassignedFilterShowsOnlyLocationlessItems`，全量通过；`assembleDebug` 通过（LocalLifecycleOwner 弃用警告无碍）。
- 版本：0.5.13 / code 19，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（长按区域/位置改名删除重分配、未分配筛选、不选位置直接保存）。

## 2026-08-07 0.5.14 默认区域/位置预选修复证据

- 用户反馈：选了区域后从位置条点「新增位置」未默认带区域；选了区域/位置后再点「新增物品」弹窗未预选。
- 修复：① 位置条「新增位置」打开弹窗时默认带入当前选中的区域（`state.filters.areaId`）；②「新增物品」弹窗初始值优先取当前选中的区域/位置筛选（验证存在后），其次取最近一次使用的区域/位置，都不再要求重复选择；③ 添加物品弹窗内「＋新增格子」原有传入当前区域逻辑不变。
- 测试：Android 单测全通过；`assembleDebug` 通过（仅弃用警告）。
- 版本：0.5.14 / code 20，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收两处默认预选。

## 2026-08-08 0.5.15 草稿确认保留大图、双指缩放、草稿大图预览证据

- 大图丢失根因：批量导入 → 草稿 → 确认保存时，草稿清理把 `photoKey` 对应的本地清晰图文件也删除了（它已归属保存的物品），导致物品只剩服务器缩略图、放大是模糊图。
- 修复：新增 `DraftGateway.deleteAfterConfirm`（确认保存后只删草稿行和 `draft_<id>.jpg`，保留 photoKey 本地大图）；用户手动删除草稿仍走完整清理。
- 双指缩放：`PhotoPreviewDialog` 重写为通用加载器（`title` + `loadBitmap`），支持双指缩放（1–5 倍）+ 拖动平移，右上角「关闭」按钮，点空白处也可关闭；只有服务器缩略图时同样可放大查看。
- 草稿大图：草稿箱列表缩略图可点击，打开同一预览（本地大图优先，`readPhotoLarge` 按 1600px 解码）。
- 测试：Android 单测全通过（fake 补齐新接口），`assembleDebug` 通过。
- 版本：0.5.15 / code 21，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（批量导入确认保存后放大是清晰大图、双指缩放、草稿箱点缩略图看大图）。

## 2026-08-08 0.5.16 缩略图强制放大 4 倍证据

- 需求：即使只有服务器缩略图（无本地大图），预览也要支持强制放大；用户确认 2 倍不够，要求直接放大 4 倍。
- 实现：`PhotoPreviewDialog` 双击放大/还原改为 4 倍（`scale = 4f`），捏合缩放上限提高到 6 倍，单指可拖动平移；对缩略图与大图同样生效。
- 测试：Android 单测全通过；`assembleDebug` 通过。
- 版本：0.5.16 / code 22，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收双击放大 4 倍。

## 2026-08-08 0.5.17 物品「拍照」按钮直接调起相机证据

- 需求：物品列表左侧「拍照」按钮从选相册改为直接启动系统相机。
- 实现：`DashboardHost` 用 `ActivityResultContracts.TakePicture()` + FileProvider 相机缓存文件（`cacheDir/camera/item_<ts>.jpg`）直接调起相机；拍照成功后压缩（1280px）→ 上传生成缩略图（mode=photo）→ 关联物品并保存本地清晰图；取消/失败静默处理（文件清理）。
- 测试：Android 单测全通过；`assembleDebug` 通过（仅弃用警告）。
- 版本：0.5.17 / code 23，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（无图物品点「拍照」直接进相机，拍完自动补图）。

## 2026-08-08 真源同步记录

- 用户指出近期功能迭代未及时回写真源，要求补写。
- 本次同步：`dev-docs/project-brief.md` 更新照片存储决策（服务器只存缩略图、清晰图存手机本地）并新增「2026-08-08 拍照识别后续增强决策」（草稿箱、批量导入、未分配筛选、长按管理、拍照直启相机、预览缩放、默认预选）；`dev-docs/architecture.md` 新增「2026-08-08 草稿箱与照片增强架构」；`docs/superpowers/specs/2026-08-07-photo-recognition-design.md` 追加「设计变更记录（2026-08-08）」。
- 后续流程约束：范围/高风险变更先更新真源并经用户确认再实施；小迭代至少保留 acceptance 证据；本会话内因用户逐条即时指定而直接实施的增量，一律在本日完成真源回写。

## 2026-08-08 帮助/邀请使用/成员权限设计确认

- 用户确认三项建议：① App 内新增「帮助」入口展示与 `dev-docs/user-manual.md` 同步的说明书；② 邀请弹窗新增「邀请使用 App」分享内测版下载链接，对方注册为独立用户（不做来源追踪）；③ 家庭成员权限分级 `owner` / `member` / `readonly`（只读成员仅可查看含照片，服务端强制），房主可移除成员，Android 端补成员管理界面。
- 真源已更新：`project-brief.md`（2026-08-08 决策）、`architecture.md`（2026-08-08 架构）、`database-design.md`（`household_members.role` 增 `readonly` + 负例）、`README.md`（索引 user-manual.md）、`user-manual.md`（新增）。
- 状态：设计确认、真源已写；代码实现已完成并通过测试与部署验证（见下方「2026-08-08 0.5.19 帮助/邀请使用/成员权限部署证据」）。

## 2026-08-08 0.5.18 列表实时刷新修复证据

- 现象：新增格子/物品/照片后需杀进程重启才显示。
- 根因：数据层已是主流方案（Room Flow → ViewModel StateFlow → Compose `collectAsState` 自动重组），新增物品/格子本应实时出现；但物品行缩略图用 `produceState` 缓存时只以 `item.id` 为 key，加/换照片后 key 不变导致缩略图不重载（照片不刷新）；且 `onRefresh` 在 `DashboardScreen` 中声明后从未被使用，手动刷新入口实际不存在。
- 修复：① 缩略图 `produceState` 改为以 `(item.id, item.photoKey)` 为 key，照片变化立即重载；② 主界面加 Material3 下拉刷新（`PullToRefreshBox`），下拉即 `syncPendingOperations + refreshSnapshot` 并显示刷新指示；③ 物品/格子沿用 Room Flow 自动刷新。
- 测试：Android 单测全通过；`assembleDebug` 通过。
- 版本：0.5.18 / code 24，已上传服务器，version.json 与 APK SHA-256 验证一致。服务器无需变更。
- 待办：真机验收（新增物品/格子实时出现、加照片立即显示缩略图、下拉刷新）。

## 2026-08-08 0.5.19 帮助/邀请使用/成员权限部署证据

- 服务端：`household_members.role` 新增 `readonly`（migration `dev-docs/sql/member_roles_self_hosted.sql`）；`family-service` 新增 `setMemberRoleForCurrentUser`（仅 owner、不能改自己、仅 member/readonly）；`inventory-service` 全部写操作（区域/位置/物品 CRUD、导入、识别入口）经 `assertCanWrite` 对 readonly 抛 403；dashboard 返回成员 role。
- Android：`HelpDialog` 帮助入口（内容与 `dev-docs/user-manual.md` 同步）；`InviteDialog` 增加成员管理（移除成员、切换只读⇄全部权限）与「邀请使用 App」分享下载链接；DTO/API/Repository/ViewModel/TestApiStub 补齐。
- 说明书真源：`dev-docs/user-manual.md` 第五、九章已同步为已实现状态（成员权限分级、邀请使用 App），README 索引同步。
- 本地验证：`npm test` 165 文件 / 1091 测试通过；`npx eslint src` 通过；`npm run build` 通过；Android `assembleDebug` 通过（0.5.19 / code 25，20,131,263 字节）。
- 部署：commit ee5cf3f bundle → 服务器 `/opt/home-inventory-app-new` 全新 `npm ci` + `npm run build` → 备份切换（`.bak.20260808_133437`）→ 保留 `public/apk`（0.5.19 APK + version.json）与 `data/photos`（64 张缩略图）→ 执行 migration（`household_members_role_check` 重建为 owner/member/readonly）→ systemd 重启 active，`/login` 200。
- 线上 smoke（真实 API + 测试环境库，测试账号已清理残留 0）：注册房主/成员 → 邀请 → 申请 → 批准 → 成员 role=member 可读；PATCH 改 readonly 后成员列表显示 readonly、只读成员仍可读；readonly 写区域返回 403；member/owner 均不能自改角色（403）；PATCH 改回 member 成功；房主移除成员后该成员访问家庭返回 404；约束定义确认包含 `readonly`。
- 公开资源：`https://homestorag.xyz/apk/version.json` 显示 0.5.19 / code 25 / 20,131,263 字节；`/login` HTTPS 200。
- 待办：真机验收（帮助入口、成员管理界面、邀请使用 App 分享、只读成员在 App 内被禁止编辑）。

## 2026-08-08 0.5.20 设置只读权限报 uuid 空串修复证据

- 现象：App 内给成员设置只读权限时报错 `invalid input syntax for type uuid: ""`。
- 根因：Android `updateMemberRole` 请求体只有 `role`、`removeMember` 无 body，而服务端 `PATCH/DELETE api/family/members/{userId}` 要求 body 携带 `householdId`；缺失时服务端把空字符串传给 PostgreSQL uuid 列直接抛 500。同类风险也存在于 `listMembers`/`listJoinRequests`/`listInvitations`（query 参数缺失）。
- 修复：① Android `UpdateMemberRoleRequest` 增加 `householdId`，新增 `RemoveMemberRequest(householdId)`，仓库层与列表接口一致先取 `currentHouseholdId`、未加载时明确报错，再随请求发送；② 服务端家庭成员相关 5 个接口增加 `householdId` 必填校验，缺失返回 400「缺少家庭 ID」，不再把空串传给数据库。
- 测试：Android 新增 4 个单测（改角色/移除成员携带当前 householdId、家庭未加载时报错）全通过；服务端新增 3 个 handler 测试（PATCH/DELETE/GET 缺 householdId 返回 400）全通过；`npm test` 165 文件 / 1094 测试通过，eslint、build 通过。
- 版本：0.5.20 / code 26，APK 20,131,259 字节已上传，version.json 同步。
- 部署：commit c857417 bundle → 服务器全新 `npm ci` + `npm run build` → 备份切换（`.bak.20260808_144228`）→ 保留 `public/apk` 与 `data/photos` → systemd 重启 active，`/login` 200。
- 线上 smoke：复跑完整成员流程（邀请/加入/批准/改 readonly/readonly 写 403/改回 member/移除成员）全部通过；新增断言 PATCH 与 DELETE 缺 householdId 均返回 400；测试账号清理后残留 0。
- 待办：真机验收设置只读权限与移除成员不再报错。

## 2026-08-08 登录页增强与密码重置验收标准（待实施）

- 背景：用户反馈登录页缺少「忘记密码」「记住密码」，Android 缺少注册入口；2026-08-08 对话确认接邮箱发送重置链接、邮件发链接网页重置、记住密码=记住邮箱、Android 增加注册入口。设计见 `docs/superpowers/specs/2026-08-08-auth-login-enhancements-design.md`，实施计划见 `docs/superpowers/plans/2026-08-08-auth-login-enhancements.md`。
- 服务端验收：`POST /api/auth/forgot-password` 邮箱存在/不存在均返回成功（防枚举）、SMTP 未配置返回 501、发送失败返回 500、限频超限返回 429；`POST /api/auth/reset-password` 有效令牌改密成功、无效/已用/过期令牌返回 400 统一提示、密码 < 8 位返回 400、重置后该用户全部 session 失效（旧 session 返回 401）。
- Web 验收：`/forgot-password` 统一提示；`/reset-password` 有效令牌可改密并跳登录；AuthForm 忘记密码链接与记住邮箱（默认勾选）行为正确。
- Android 验收：登录页注册入口（确认密码、注册成功即登录）；忘记密码弹窗统一提示；记住邮箱复选框（默认勾选，只存邮箱）。
- 真实环境验收（需用户提供 QQ 邮箱 SMTP 授权码，配置到服务器 `app.env`）：发送一封真实测试邮件；测试账号完整走「忘记密码 → 邮件链接 → 设置新密码 → 旧密码失败、新密码成功 → 其他设备 session 失效」。
- 状态：2026-08-08 设计已确认，开始实施；未验证项不得包装成已完成。

## 2026-08-08 登录页增强与密码重置实施证据（本地验证完成，部署待进行）

- 设计确认：用户 2026-08-08 确认技术设计（令牌哈希入库、30 分钟过期、一次性、重置后作废全部会话；QQ SMTP + 授权码；邮件发重置链接；记住密码=记住邮箱；Android 增加注册入口）。
- 服务端实现：`dev-docs/sql/password_reset_self_hosted.sql`（`password_reset_tokens` 表）；`src/server/mail/smtp-mailer.ts`（nodemailer + SMTP，凭据只存服务器 `app.env`）；`src/server/auth/password-reset-service.ts`（requestPasswordReset/resetPassword）；`src/server/auth/forgot-password-rate-limiter.ts`（5 次/小时/邮箱+IP）；`POST /api/auth/forgot-password` 与 `POST /api/auth/reset-password` 路由；`auth-service`/`postgres-auth-repository` 扩展。
- Web 实现：`/forgot-password`、`/reset-password` 页面；AuthForm 忘记密码链接 + 记住邮箱（localStorage，默认勾选）；登录页 `reset=1` 成功提示。
- Android 实现（0.5.21 / code 27）：登录页注册模式（邮箱/密码/确认密码）、忘记密码弹窗、记住邮箱（EncryptedSharedPreferences）；`AuthRepository.register/forgotPassword`；HomeInventoryApi/DTO 扩展。
- 本地验证：`npm test` 172 文件 / 1128 测试通过（9 跳过）；`npx eslint src` exit 0；`npm run build` exit 0（产物含 `/forgot-password`、`/reset-password`、`/api/auth/forgot-password`、`/api/auth/reset-password`）；Android `testDebugUnitTest` 65 测试全过 + `assembleDebug` 通过（APK 20,147,647 字节）；真实 PostgreSQL 集成测试：认证 register/login/logout + 密码重置令牌生命周期 2 用例通过（本机 PG + `home_inventory_test`，migration SQL 已在真实库执行验证）。
- 环境备注：`npm run lint`（裸 eslint）与 `npm test` 会扫描 `.worktrees/` 旧分支导致噪声/失败；项目实际校验以 `npx eslint src` 与排除 `.worktrees` 的 vitest 为准。`dev-docs/sql/mainland_initial_schema.sql` 缺少 `items.photo_key` 等后续列，本地 inventory 集成测试存在既有漂移（与本次功能无关，待单独补齐）。本地 PostgreSQL 已按 runbook 启动（Scoop persist 数据目录）。
- 待办（部署后）：服务器执行 migration、`app.env` 配置 SMTP（QQ 邮箱 + 授权码，凭据不入仓库）、重启服务；发一封真实测试邮件；用测试账号走完整「忘记密码 → 邮件链接 → 设置新密码 → 旧密码失败、新密码成功 → 其他设备 session 失效」；浏览器/真机验收。

## 2026-08-08 登录页增强与密码重置部署证据（真实邮件待用户确认）

- 部署：commit `ffaa641`（含服务端/Web/Android 实施与本地验证证据）推送到 origin main；服务器全新 clone → `npm ci` → `npm run build`（期间修复无 `DATABASE_URL` 环境下构建失败问题：密码重置服务由模块加载期创建改为请求期创建）→ 备份切换（`/opt/home-inventory-app.bak.20260808_164452`）→ 保留 `public/apk` 与 `data/photos` → systemd 重启 active。
- Migration：服务器执行 `dev-docs/sql/password_reset_self_hosted.sql`，`password_reset_tokens` 表创建成功（含唯一约束、索引与授权）。
- SMTP：`/etc/home-inventory-app/app.env` 新增 `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM`/`RESET_BASE_URL`（QQ 邮箱 + 授权码，只存服务器，不进仓库）；文件属主 `root:deploy` 640。
- 线上 smoke：`/login`、`/forgot-password`、`/reset-password` 均 200；`POST /api/auth/register`（736259416@qq.com）返回 409（账号已存在）；`POST /api/auth/forgot-password` 返回 200 `{ok:true}`；数据库确认该邮箱存在 1 条未使用、30 分钟有效的重置令牌；journal 无 SMTP 错误。
- 闭环验收（2026-08-08 16:49 用户完成重置）：真实邮件已发送至 736259416@qq.com → 用户打开链接设置新密码 → 数据库确认令牌 `used_at` 已写入（密码哈希已更新）、该账号 11 个旧会话全部作废（`active_sessions = 0`），重置后所有设备强制登出生效。新密码登录由用户确认；浏览器/真机点击验收待补。

## 2026-08-08 Android 0.5.21 内测版发布与工作区清理证据

- 发布：`scripts/upload-apk.ps1` 构建并上传 0.5.21 / code 27 APK（20,147,647 字节）到服务器 `/opt/home-inventory-app/public/apk/`；`https://homestorag.xyz/apk/version.json` 与 APK 均公开 200，version.json 显示 v0.5.21/code 27/size 20,147,647。
- 修复：version.json 原由 PowerShell 5.1 `Set-Content -Encoding UTF8` 写入带 BOM，会破坏 Android Gson 解析；已改写脚本为 UTF-8 无 BOM（`[System.IO.File]::WriteAllText`）并去除线上文件 BOM。注意 `next start` 启动时扫描 `public/`，上传 APK 后需重启服务才能对外提供。
- 工作区清理：移除 `.worktrees/`（android-native-internal-test、family-sharing 两个注册工作树 + photo-recognition 503MB 无 git 遗留目录）；family-sharing 未提交改动（desugaring 配置，已合入 main）已 stash 保留在分支 `codex/family-sharing` 上；`.worktrees/` 目录本身已删除（gitignore 条目保留）。清理后 `npm test` 恢复为 53 文件 / 340 测试通过（3 跳过）、`npm run lint` exit 0（此前 `.worktrees` 旧分支测试/文件导致 172 文件与 2103 lint 错误噪声）。

## 2026-08-08 Android 0.5.22 未登录更新提示修复证据

- 现象：未登录用户（停在登录页）收不到更新提示。
- 根因：更新检查与提示弹窗只存在于 `DashboardHost`（登录后清单页）的 `LaunchedEffect` 中。
- 修复：更新检查移至 `AppRoot` 启动时执行（`LaunchedEffect(isLoggedIn)` 在应用启动与登录状态变化时触发，未登录也会检查）；更新弹窗提升到 `AppRoot` 层级，登录页与清单页均显示；`DashboardHost` 移除重复的检查与弹窗（避免双弹窗）。
- 验证：Android 单测 65 个全过（含 `checkForUpdates` 三个既有用例：新版本提示/版本相同静默/检查失败静默），`assembleDebug` 通过；0.5.22 / code 28（20,164,031 字节）已上传并重启服务，`https://homestorag.xyz/apk/version.json` 显示 v0.5.22/code 28。
- 待办：真机验收未登录启动时弹出更新提示。

## 2026-08-10 Android 共享成员读取主账户内容修复证据

- 现象：被邀请加入家庭的共享成员登录 Android 后，清单为空，看不到房主（主账户）家庭里的区域/位置/物品。
- 根因：Android `InventoryRepository.refreshSnapshot()` 调用 `api.snapshot()` 时没有携带 `householdId`，`HomeInventoryApi.snapshot()` 也没有该参数；服务端 snapshot 路由在未传 `householdId` 时只返回当前用户第一个默认家庭，因此共享成员始终读到自己的空默认家庭。Web 端已有家庭切换器，但 Android 端缺失。
- 修复：`HomeInventoryApi.snapshot()` 增加 `@Query("householdId")`；`InventoryRepository` 增加 `loadHouseholds()`/`switchHousehold()`/`selectedHouseholdId()`，snapshot 携带用户选择的家庭并用 `sync_state` 记住上次选择；`DashboardViewModel` 暴露家庭列表/当前家庭状态；顶部家庭名称可点击打开切换弹窗；启动/登录时先加载家庭列表再刷新 snapshot；服务端 snapshot 路由保持对 `householdId` 的 membership 校验。
- 测试：Android 新增 7 个相关单测（snapshot 携带所选家庭、加载家庭列表、切换家庭、切换后邀请使用所选家庭、ViewModel 家庭状态与失败提示、恢复仓库所选家庭）；`testDebugUnitTest` 全通过；`assembleDebug` 通过。服务端新增 snapshot 路由转发 `householdId` 测试；`npx vitest run`（排除 2 个需本机 PostgreSQL 的集成文件）51 文件 / 339 测试通过；`npx eslint src` 通过；`npm run build` 通过（构建时因本机代理无法访问 Google Fonts，清空代理环境变量后成功）。
- 真源同步：`dev-docs/project-brief.md`、`dev-docs/architecture.md`、`dev-docs/stages/family-sharing.md`、`dev-docs/user-manual.md` 已更新 Android 当前家庭切换/查看共享家庭清单。
- 发布：`scripts/upload-apk.ps1` 构建并上传 0.5.23 / code 29 APK（20,164,031 字节）到服务器 `/opt/home-inventory-app/public/apk/`；systemd 重启后服务 active；`https://homestorag.xyz/apk/version.json` 显示 v0.5.23/code 29/size 20,164,031，APK URL 返回 200。
- 待办：真机验收家庭成员切换到共享家庭后能看到房主清单；Android 写接口与离线同步跨家庭的 `householdId` 支持仍属下一轮范围，本轮不声明共享家庭写入已完整支持。

## 2026-08-11 区域/位置照片验收证据

状态：本地实现、数据库 migration 与自动化验证完成；真机/线上部署验收待进行。

- 实现：`dev-docs/sql/area_location_photos_self_hosted.sql`（`areas.photo_key`、`locations.photo_key` + 唯一索引）；`src/server/photos/area-location-photo-service.ts` 与 `photo-route-helpers.ts`（上传/读取/删除/清理）；`PUT/GET/DELETE /api/inventory/areas/[areaId]/photo` 与 `locations/[locationId]/photo`；Dashboard/快照透传 `photoKey`；Web 物品行 `A1`/区域小按钮与无照片提示；Android Room/API/Repository、物品行小按钮、照片查看、长按弹窗照片区。
- Web 验证：`npx vitest run --exclude <2 个 PostgreSQL 集成文件>` 53 个文件 / 348 个测试通过；`npx eslint src` exit 0；`npm run build` exit 0，构建产物包含新增两个照片路由。
- Android 验证：`gradle :app:testDebugUnitTest --no-daemon` 通过；`gradle :app:assembleDebug --no-daemon` 通过。
- 数据库验证：`dev-docs/sql/area_location_photos_self_hosted.sql` 已在 `home_inventory_test` 执行成功，`areas.photo_key`、`locations.photo_key` 及两个唯一索引已确认；新增 `src/server/photos/photo-repository.integration.test.ts`，真实 PostgreSQL 集成测试通过。
- 待办：真机拍照/相册、替换/删除、readonly 只读、用户 A/B 越权、替换和删除后的文件清理；线上部署与页面验收。

- 每个区域、每个位置各有一张主照片，可上传、替换、删除。
- 长按区域/位置可拍照或从相册选择；有照片时可查看、替换、删除。
- 物品行中位置名（如 `A1`）和区域名显示为小按钮，点击分别查看位置照片、区域照片。
- 无照片时点击按钮提示“拍照或从相册选择”，完成后自动保存。
- 服务器保存约 1280px、100–300KB 清晰图；Web 与 Android 均可查看。
- Android 本地缓存照片，查看本地优先、缺失联网；Web 浏览器缓存生效。
- 照片拍摄、替换、删除必须联网；断网时明确提示，不做离线队列。
- readonly 成员可查看照片，但上传/替换/删除被服务端拒绝（403）。
- 用户 A/B 越权读取或写入照片返回 403/404。
- 替换照片和删除区域/位置后，旧照片文件被清理。
- 未登录访问照片接口返回 401。
