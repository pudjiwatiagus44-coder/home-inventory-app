# Mainland Auth and Database Migration Stage

## 2026-07-07 Self-hosted location delete UI and empty-body DELETE fix

- Added a desktop location-list delete action in `src/features/inventory/AppDashboard.tsx`.
- Added `handleDeleteLocation(locationId)` and wired it to the existing self-hosted/Supabase inventory write client boundary.
- Added self-hosted `deleteLocation` forwarding in the dashboard write client so browser users can reach `DELETE /api/inventory/locations/:locationId`.
- Fixed `runInventoryMutation` in `src/app/api/inventory/route-helpers.ts` so empty-body `DELETE` requests are parsed as `{}` instead of failing with `Unexpected end of JSON input`.
- Added regression coverage:
  - `src/features/inventory/AppDashboard.test.ts` verifies the visible location delete action is present.
  - `src/app/api/inventory/route-helpers.test.ts` verifies empty-body `DELETE` mutations receive an empty object.
- Browser evidence before the delete fix: self-hosted local PostgreSQL flow registered a test account, created area/location/item, edited area, edited location, and edited item successfully. Dev-server logs showed 200 responses for register, create, and update API routes.
- HTTP session deletion evidence after the fix: registered a disposable test account, created `HTTP区域-B` / `HTTP位置-B` / `HTTP物品-B`, deleted item, location, and area through API routes, then `GET /api/inventory/dashboard` returned `areasAfterDelete=0`, `locationsAfterDelete=0`, and `itemsAfterDelete=0`.
- Validation evidence: `npm test` passed 28 files / 169 tests with 2 skipped placeholder cases; `npm run test:postgres` passed 2 files with 2 real database tests and 2 skipped placeholder cases; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Safety boundary: this step used only the local disposable PostgreSQL test database and localhost dev server. It did not connect to a production database, did not add real cloud credentials, did not commit database URLs/session secrets/passwords, did not remove the Supabase temporary adapter, and did not migrate real users.
- Remaining unverified: browser-plugin confirmation handling for delete buttons was unstable, so delete was proven through HTTP session/API/database evidence rather than an end-to-end browser click confirmation. Mobile delete/search/filter flows still need separate visual/user acceptance.

## 2026-07-07 Self-hosted `/app` inventory loop and local PostgreSQL preparation

- Connected self-hosted `/app` inventory reads to `GET /api/inventory/dashboard`.
- Added dashboard API route files:
  - `src/app/api/inventory/dashboard/handlers.ts`
  - `src/app/api/inventory/dashboard/route.ts`
  - `src/app/api/inventory/dashboard/route.test.ts`
- Added browser API client for self-hosted inventory:
  - `src/features/inventory/self-hosted-inventory-client.ts`
  - `src/features/inventory/self-hosted-inventory-client.test.ts`
- Updated `/app` state so self-hosted users enter the normal loading path instead of the previous honest pending page.
- Updated `/app` write operations so self-hosted users call self-hosted inventory API routes while the existing Supabase temporary adapter remains available for the Supabase path.
- Updated self-hosted sign-out to call `POST /api/auth/logout`.
- Added PostgreSQL inventory integration test:
  - `src/features/inventory/postgres-inventory.integration.test.ts`
- Updated `npm run test:postgres` so it runs both auth and inventory PostgreSQL integration suites.
- Added local PostgreSQL runbook:
  - `dev-docs/local-postgres-test-runbook.md`
- Local machine PostgreSQL condition check: `TEST_DATABASE_URL`, `DATABASE_URL`, and `SESSION_SECRET` are not set in the current shell; `psql`, `pg_isready`, and `docker` were not found on `PATH`.
- Runtime PostgreSQL attempt evidence: `npm run test:postgres` passed 2 files with 2 real-database tests skipped because `TEST_DATABASE_URL` is not configured.
- Safety boundary: this step did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not add service role keys, did not delete the Supabase adapter, and did not migrate real users.
- TDD evidence:
  - `npm test -- src/app/api/inventory/dashboard/route.test.ts src/features/inventory/self-hosted-inventory-client.test.ts` first failed because `./handlers` and `./self-hosted-inventory-client` did not exist; after implementation it passed 2 files / 5 tests.
  - `npm test -- src/features/inventory/app-dashboard-state.test.ts` first failed because self-hosted users still returned `selfHostedInventoryPending`; after implementation, targeted self-hosted dashboard tests passed.
- Full local validation evidence after truth-doc update: `npm test` passed 26 files / 164 tests with 2 skipped real-database integration cases; `npm run test:postgres` passed 2 files with 2 real-database cases skipped; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/inventory/dashboard` is now listed as a dynamic route alongside the inventory write routes.
- Secret scan evidence: matches were limited to local runbook placeholders, test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, database password, or session secret was found.
- Remaining blocked: actual local/test PostgreSQL runtime browser flow and real PostgreSQL API A/B negative execution require a reachable test PostgreSQL database and local env values.

## 2026-07-07 Self-hosted inventory API A/B negative route tests

- Added API-level permission negative test file: `src/app/api/inventory/inventory-routes-permissions.test.ts`.
- Refactored inventory API routes to keep Next.js route files thin and move injectable handlers into sibling `handlers.ts` files:
  - `src/app/api/inventory/areas/handlers.ts`
  - `src/app/api/inventory/areas/[areaId]/handlers.ts`
  - `src/app/api/inventory/locations/handlers.ts`
  - `src/app/api/inventory/locations/[locationId]/handlers.ts`
  - `src/app/api/inventory/items/handlers.ts`
  - `src/app/api/inventory/items/[itemId]/handlers.ts`
- Route permission coverage models user B calling HTTP route handlers with user A ids and verifies 403 responses for:
  - creating a location under another user's area
  - updating/deleting another user's area
  - updating/deleting another user's location
  - moving a current-user location into another user's area
  - creating an item in another user's location
  - updating/deleting another user's item
  - moving a current-user item into another user's location
- Route contract coverage also verifies that area creation ignores a caller-provided `householdId` and only forwards `userId`, `name`, and `color` to the service.
- Permission boundary: the route layer maps service-level ownership errors to HTTP 403 and still relies on `createInventoryService` for the actual owner checks before repository writes.
- Safety boundary: this step did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not add service role keys, did not delete the Supabase adapter, and did not migrate real users.
- TDD evidence: `npm test -- src/app/api/inventory/inventory-routes-permissions.test.ts` first failed because `./areas/handlers` did not exist; after implementation the same target passed 1 file / 11 tests.
- Targeted validation evidence: `npm test -- src/app/api/inventory/route-helpers.test.ts src/app/api/inventory/inventory-routes-permissions.test.ts src/features/inventory/inventory-service-permissions.test.ts` passed 3 files / 25 tests.
- Local build evidence before truth-doc update: `npm run lint` exit code 0; `npm run build` exit code 0 using webpack, with all inventory API routes still listed as dynamic routes.
- Remaining unverified: actual local/test PostgreSQL runtime write flow, browser flows using self-hosted auth, and real PostgreSQL test-database API A/B negative checks.

## 2026-07-07 Self-hosted inventory write API skeleton

- Added inventory route helper: `src/app/api/inventory/route-helpers.ts`.
- Added route helper tests: `src/app/api/inventory/route-helpers.test.ts`.
- Added self-hosted inventory write route skeletons:
  - `POST /api/inventory/areas`
  - `PATCH /api/inventory/areas/[areaId]`
  - `DELETE /api/inventory/areas/[areaId]`
  - `POST /api/inventory/locations`
  - `PATCH /api/inventory/locations/[locationId]`
  - `DELETE /api/inventory/locations/[locationId]`
  - `POST /api/inventory/items`
  - `PATCH /api/inventory/items/[itemId]`
  - `DELETE /api/inventory/items/[itemId]`
- Route boundary: routes read the self-hosted auth session cookie, resolve the current user server-side, parse JSON input, and call the existing inventory service methods.
- Permission boundary: routes do not accept caller-provided `householdId`; ownership checks remain in `createInventoryService` before repository writes.
- Error mapping: unauthenticated requests return 401; missing PostgreSQL inventory configuration returns 501; service-level ownership rejections return 403; missing current-user household returns 404; validation errors return 400.
- Safety boundary: this step did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not add service role keys, did not delete the Supabase adapter, and did not migrate real users.
- TDD evidence: `npm test -- src/app/api/inventory/route-helpers.test.ts` first failed because `./route-helpers` did not exist; after implementation the same target passed 1 file / 4 tests.
- Full local test evidence: `npm test` passed 22 files / 147 tests with 1 skipped real-database integration flow.
- Preliminary local build evidence before truth-doc update: `npm run lint` exit code 0; `npm run build` exit code 0 using webpack, with the new inventory API routes listed as dynamic routes.
- Remaining unverified: actual local/test PostgreSQL runtime write flow, browser flows using self-hosted auth, and API-level A/B negative checks against a real PostgreSQL test database.

## 2026-07-07 PostgreSQL inventory service permission negative test skeleton

- Added dedicated permission negative test file: `src/features/inventory/inventory-service-permissions.test.ts`.
- The test file models user B's dashboard and attempts to write with user A's area/location/item ids.
- Covered service-level negative cases:
  - create location under another user's area
  - update/delete another user's area
  - update/delete another user's location
  - move a current-user location into another user's area
  - create item in another user's location
  - update/delete another user's item
  - move a current-user item into another user's location
- Each negative case verifies that the correct ownership error is thrown and that the write repository method is not called.
- This is a test-organization step; it did not change production behavior, repository SQL, real database configuration, Supabase adapter behavior, or frontend behavior.
- Safety boundary: no real PostgreSQL connection, real `DATABASE_URL`, real `SESSION_SECRET`, service role key, database password, or real user data was added.
- Validation evidence: `npm test -- src/features/inventory/inventory-service-permissions.test.ts` passed 1 file / 10 tests.
- Full local validation evidence: `npm test` passed 21 files / 143 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime A/B negative flow, browser flows using self-hosted auth, and API/server-action level A/B negative checks.

## 2026-07-07 PostgreSQL inventory A/B negative skeleton: create-location area ownership

- Added service-level negative test coverage for creating a location with an `areaId` outside the current user's household.
- Updated `createLocationForCurrentUser({ userId, name, areaId })` to verify that a provided `areaId` is present in the current user's dashboard/household before writing.
- Cross-household area assignment attempts now throw `AreaOutsideCurrentHouseholdError` before the repository is called.
- This covers the A/B negative case where user B tries to create a location under user A's area id.
- The PostgreSQL repository SQL did not change in this step; ownership is enforced before calling `createLocation`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted test first failed because `createLocationForCurrentUser` accepted a foreign `areaId` and called the repository; after implementation, `src/features/inventory/inventory-service.test.ts` passed 1 file / 25 tests.
- Full local validation evidence: `npm test` passed 20 files / 133 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime A/B negative flow, browser location creation with self-hosted auth, and full PostgreSQL A/B negative suite across area/location/item create/update/delete.

## 2026-07-07 PostgreSQL inventory create-area write skeleton

- Added service method `createAreaForCurrentUser({ userId, name, color })` in `src/features/inventory/inventory-service.ts`.
- The service validates area input, resolves the current user's household through `getDashboardForUser(userId)`, and never accepts a caller-provided `householdId`.
- Implemented PostgreSQL `createArea` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL area writes validate input, use parameterized SQL, insert into `areas (household_id, name, color)`, and return `id, name, color`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because PostgreSQL `createArea` still threw the not-connected placeholder and `createAreaForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 38 tests.
- Full local validation evidence: `npm test` passed 20 files / 132 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime area creation, browser area creation flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory update/delete-area write skeleton

- Added service methods `updateAreaForCurrentUser({ userId, areaId, name, color })` and `deleteAreaForCurrentUser({ userId, areaId })` in `src/features/inventory/inventory-service.ts`.
- The service resolves the current user's household through `getDashboardForUser(userId)` and never accepts a caller-provided `householdId`.
- Area update/delete verifies that `areaId` is present in the current user's dashboard/household before writing.
- Cross-household area update/delete attempts use `AreaOutsideCurrentHouseholdError`.
- Implemented PostgreSQL `updateArea` and `deleteArea` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL area updates validate input, use parameterized SQL, update `areas`, scope the mutation with `where id = $1 and household_id = $2`, and return `id, name, color`.
- PostgreSQL area deletion uses parameterized SQL and scopes the mutation with `where id = $1 and household_id = $2`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because PostgreSQL `updateArea` and `deleteArea` still threw the not-connected placeholder and `updateAreaForCurrentUser` / `deleteAreaForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 34 tests.
- Full local validation evidence: `npm test` passed 20 files / 128 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime area update/delete, browser area update/delete flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory update/delete-location write skeleton

- Added service methods `updateLocationForCurrentUser({ userId, locationId, name, areaId })` and `deleteLocationForCurrentUser({ userId, locationId })` in `src/features/inventory/inventory-service.ts`.
- The service resolves the current user's household through `getDashboardForUser(userId)` and never accepts a caller-provided `householdId`.
- Location update/delete verifies that `locationId` is present in the current user's dashboard/household before writing.
- Location update verifies that a provided `areaId` is present in the current user's dashboard/household before writing.
- Added `AreaOutsideCurrentHouseholdError` for cross-household area assignment attempts.
- Added Supabase adapter contract support for `deleteLocation` without changing the current frontend path.
- Implemented PostgreSQL `updateLocation` and `deleteLocation` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL location updates validate input, use parameterized SQL, update `locations`, scope the mutation with `where id = $1 and household_id = $2`, and return `id, name`.
- PostgreSQL location deletion uses parameterized SQL and scopes the mutation with `where id = $1 and household_id = $2`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because `updateLocationForCurrentUser` and `deleteLocationForCurrentUser` did not exist, PostgreSQL `updateLocation` still threw the not-connected placeholder, and `deleteLocation` was missing from the repository contract; after implementation, targeted tests passed 2 files / 28 tests.
- Full local validation evidence: `npm test` passed 20 files / 122 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime location update/delete, browser location update/delete flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory delete-item write skeleton

- Added service method `deleteItemForCurrentUser({ userId, itemId })` in `src/features/inventory/inventory-service.ts`.
- The service resolves the current user's household through `getDashboardForUser(userId)` and never accepts a caller-provided `householdId`.
- The service verifies that `itemId` is present in the current user's dashboard/household before deleting.
- Cross-household item delete attempts reuse `ItemOutsideCurrentHouseholdError`.
- Implemented PostgreSQL `deleteItem` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL item deletion uses parameterized SQL and scopes the mutation with `where id = $1 and household_id = $2`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because PostgreSQL `deleteItem` still threw the not-connected placeholder and `deleteItemForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 20 tests.
- Full local validation evidence: `npm test` passed 20 files / 114 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime item deletion, browser delete-item flow using self-hosted auth, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory update-item write skeleton

- Added service method `updateItemForCurrentUser({ userId, itemId, name, note, expireDate, locationId })` in `src/features/inventory/inventory-service.ts`.
- The service validates item input, resolves the current user's household through `getDashboardForUser(userId)`, and never accepts a caller-provided `householdId`.
- The service verifies that `itemId` is present in the current user's dashboard/household before writing.
- If `locationId` is provided, the service verifies that the selected location is present in the current user's dashboard/household before writing.
- Added `ItemOutsideCurrentHouseholdError` for cross-household item update attempts.
- Implemented PostgreSQL `updateItem` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL item updates validate input, use parameterized SQL, update `items` with `where id = $1 and household_id = $2`, and return `id, name, note, expire_date, location_id`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because PostgreSQL `updateItem` still threw the not-connected placeholder and `updateItemForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 17 tests.
- Full local validation evidence: `npm test` passed 20 files / 111 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime item update, browser update-item flow using self-hosted auth, PostgreSQL delete item path, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory create-item write skeleton

- Added service method `createItemForCurrentUser({ userId, name, note, expireDate, locationId })` in `src/features/inventory/inventory-service.ts`.
- The service validates item input, resolves the current user's household through `getDashboardForUser(userId)`, and never accepts a caller-provided `householdId`.
- If `locationId` is provided, the service verifies that the selected location is present in the current user's dashboard/household before writing.
- Added `LocationOutsideCurrentHouseholdError` for cross-household location attempts.
- Implemented PostgreSQL `createItem` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL item writes validate input, use parameterized SQL, insert into `items (household_id, location_id, name, note, expire_date, created_by)`, and return `id, name, note, expire_date, location_id`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because PostgreSQL `createItem` still threw the not-connected placeholder and `createItemForCurrentUser` did not exist; after implementation, targeted tests passed 2 files / 13 tests.
- Full local validation evidence: `npm test` passed 20 files / 107 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, and `/app` are dynamic routes.
- Secret scan evidence: matches were limited to test placeholder URLs, existing documentation text, and an npm package URL containing `sk-` as part of `queue-microtask`; no real database URL, service role key, private key, API key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime item creation, browser create-item flow using self-hosted auth, PostgreSQL update/delete item paths, and full user A/B PostgreSQL negative tests.

## 2026-07-07 PostgreSQL inventory create-location write skeleton

- Added server-side inventory service: `src/features/inventory/inventory-service.ts`.
- The service exposes `createLocationForCurrentUser({ userId, name, areaId })`; callers do not provide `householdId`.
- The service resolves the current user's household through the repository before writing, so location creation does not trust a frontend-provided household id.
- Implemented PostgreSQL `createLocation` in `src/features/inventory/inventory-repository.ts`.
- PostgreSQL location writes validate input, use parameterized SQL, insert into `locations (household_id, area_id, name)`, and return `id, name`.
- The no-client PostgreSQL repository still throws `PostgresInventoryRepositoryNotConnectedError`.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because `inventory-service` did not exist and PostgreSQL `createLocation` still threw the not-connected placeholder; after implementation, targeted tests passed 2 files / 9 tests.
- Full local validation evidence: `npm test` passed 20 files / 103 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime location creation, browser create-location flow using self-hosted auth, and PostgreSQL update/delete/item write paths.

## 2026-07-07 PostgreSQL inventory dashboard read repository

- Added read contract `getDashboardForUser(userId)` to `src/features/inventory/inventory-repository.ts`.
- Implemented PostgreSQL dashboard read behavior with an injected query client.
- The PostgreSQL read path first resolves the user's default household through `household_members` joined to `households`, then reads `areas`, `locations`, and `items` scoped by that household id.
- SQL calls are parameterized. The read path returns `null` when the current user has no household membership.
- The no-client PostgreSQL inventory repository still throws `PostgresInventoryRepositoryNotConnectedError`, so code does not silently pretend a database exists.
- The current Supabase adapter remains intact for the temporary prototype.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because `getDashboardForUser` did not exist; after implementation, `npm test -- src/features/inventory/inventory-repository.test.ts` passed 1 file / 5 tests.
- Full local validation evidence: `npm test` passed 19 files / 99 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- UI boundary: this read repository is not wired into `/app` as an editable dashboard yet, because PostgreSQL write CRUD is not connected and the UI would otherwise mix self-hosted reads with Supabase writes.
- Remaining unverified: actual local/test PostgreSQL runtime inventory reads, browser display of PostgreSQL-backed inventory data, and PostgreSQL inventory write CRUD.

## 2026-07-07 `/app` self-hosted session recognition

- Added `/app` server-side auth resolver: `src/app/app/app-auth.ts`.
- Updated `/app` page to read `home_inventory_session` from server cookies before rendering the dashboard.
- Added dashboard initial-state helper: `src/features/inventory/app-dashboard-state.ts`.
- Updated `src/features/inventory/AppDashboard.tsx` to accept an optional self-hosted current user.
- If a self-hosted session is recognized, `/app` now shows an honest pending state: the user is authenticated, but PostgreSQL inventory CRUD is not connected yet.
- If there is no self-hosted cookie, or PostgreSQL auth is not configured, `/app` keeps the existing temporary Supabase browser path so the current prototype is not broken.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not delete Supabase code, and did not migrate real users.
- TDD evidence: targeted tests first failed because `app-auth` and `app-dashboard-state` did not exist; after implementation, targeted tests passed 4 files / 27 tests.
- Full local validation evidence: `npm test` passed 19 files / 97 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Build route evidence: `/app` is now a dynamic route because it reads server cookies before rendering.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- Remaining unverified: browser refresh with a real self-hosted PostgreSQL session, PostgreSQL inventory CRUD, and `/app` showing real PostgreSQL-backed inventory data.

## 2026-07-07 server-side current-user session lookup skeleton

- Added current-user lookup behavior to `src/server/auth/auth-service.ts`.
- Added `findSessionByHash` to the `AuthRepository` contract and PostgreSQL repository.
- The auth service now hashes the cookie session token, loads the matching `auth_sessions` + `users` row, rejects missing/expired/revoked sessions, rejects disabled users, and returns `{ userId, email }` for usable active sessions.
- Added route helper `getCurrentUserFromRequest` in `src/app/api/auth/route-helpers.ts`.
- Requests without `home_inventory_session` return `null` without initializing the PostgreSQL auth service, so anonymous requests do not open a database connection.
- PostgreSQL SQL remains parameterized and still uses the injected query client; no real database connection is opened by unit tests.
- This round did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not connect to a real PostgreSQL instance, and did not migrate real users.
- TDD evidence: targeted tests first failed because `service.getCurrentUser` and `repository.findSessionByHash` did not exist; after implementation, targeted tests passed 3 files / 20 tests.
- Full local validation evidence: `npm test` passed 17 files / 92 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack and generated `/api/auth/login`, `/api/auth/logout`, and `/api/auth/register`.
- Secret scan evidence: matches were limited to test placeholder URLs and existing documentation text; no real database URL, service role key, or session secret was found.
- Remaining unverified: actual local/test PostgreSQL runtime session lookup, browser refresh persistence, `/app` protection using the new self-owned auth session, and PostgreSQL A/B permission negative tests.

## 2026-07-06 gated PostgreSQL integration verification entrypoint

- Added a safe integration-test gate: `src/server/db/postgres-integration-config.ts`.
- Added gate tests: `src/server/db/postgres-integration-config.test.ts`.
- Added PostgreSQL auth integration test entrypoint: `src/server/auth/postgres-auth-repository.integration.test.ts`.
- Added `npm run test:postgres`, which runs only the PostgreSQL auth integration test.
- Added empty `.env.example` placeholder `TEST_DATABASE_URL`; this must remain server-side only and must not contain real credentials in Git.
- The integration test only runs when `TEST_DATABASE_URL` is configured and the target database name looks like a disposable test database, such as `home_inventory_test`.
- When enabled, the integration test resets the test database `public` schema, executes `dev-docs/sql/mainland_initial_schema.sql`, registers a user, creates the default profile/household/membership, logs in, logs out, and verifies the login session is revoked.
- This round did not connect to a real PostgreSQL instance, did not add a real `TEST_DATABASE_URL`, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, and did not migrate real users.
- Validation evidence: the new config test first failed because `src/server/db/postgres-integration-config.ts` did not exist; after implementation `npm test -- src/server/db/postgres-integration-config.test.ts` passed 1 file / 4 tests.
- Default no-database evidence: `npm run test:postgres` passed 1 file with 1 skip because `TEST_DATABASE_URL` is not configured. The real PostgreSQL auth flow remains unverified until a local/test database URL is supplied outside Git.
- Full local validation evidence: `npm test` passed 17 files / 85 tests with 1 skipped real-database integration flow; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack and generated `/api/auth/login`, `/api/auth/logout`, and `/api/auth/register`.

## 2026-07-06 auth API skeleton and PostgreSQL repository draft

- Added server-side auth service skeleton: `src/server/auth/auth-service.ts`.
- Added PostgreSQL auth repository draft: `src/server/auth/postgres-auth-repository.ts`.
- Added route handler skeletons: `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`.
- Added shared route helper for HttpOnly session cookie response handling: `src/app/api/auth/route-helpers.ts`.
- Added PostgreSQL inventory repository draft in `src/features/inventory/inventory-repository.ts`.
- Current PostgreSQL repositories intentionally do not connect to a real database. They expose the contract and throw explicit "not connected yet" errors.
- Register/login/logout route handlers compile and route to the auth service, but return not-connected responses until a real PostgreSQL adapter is implemented.
- No real `DATABASE_URL`, `SESSION_SECRET`, database password, service role key, or production user data was added.
- Validation evidence: targeted TDD test first failed because new skeleton files/functions did not exist; after implementation `npm test -- src/server/auth/auth-service.test.ts src/server/auth/postgres-auth-repository.test.ts src/features/inventory/inventory-repository.test.ts` passed 3 files / 9 tests.
- Full validation evidence: `npm test` passed 13 files / 70 tests; `npm run lint` exit code 0; `npm run build` exit code 0 and generated dynamic routes `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`.

## 2026-07-06 PostgreSQL auth repository query-client implementation

- Implemented the first real PostgreSQL auth repository behavior in `src/server/auth/postgres-auth-repository.ts`.
- The repository now supports an injected query client for `findUserByEmail`, `createUserWithDefaultHousehold`, `createSession`, and `revokeSessionByHash`.
- Registration bootstrap is transactional: `begin` -> insert `users` -> insert `profiles` -> insert `households` -> insert `household_members` -> `commit`; failures trigger `rollback`.
- SQL calls are parameterized. Email lookup normalizes email before querying `users`.
- The no-argument repository factory still throws an explicit not-connected error, so route handlers do not silently pretend a real database exists.
- This round did not connect to a real PostgreSQL instance, did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, and did not migrate real users.
- TDD evidence: the targeted repository test first failed with 5 expected failures because all new behaviors still hit the not-connected draft.
- Validation evidence after implementation: `npm test -- src/server/auth/postgres-auth-repository.test.ts` passed 1 file / 6 tests; full `npm test` passed 13 files / 75 tests; `npm run lint` exit code 0; `npm run build` exit code 0.

## 2026-07-06 PostgreSQL client factory and route wiring

- Added server-only PostgreSQL client factory: `src/server/db/postgres.ts`.
- Added tests for missing `DATABASE_URL`, rejecting public database env usage, and query delegation through an injected pool: `src/server/db/postgres.test.ts`.
- Updated auth route helper to build the auth service from `DATABASE_URL` via `createPostgresQueryClientFromEnv`, then inject it into `createPostgresAuthRepository`.
- Route helper still returns explicit 501 responses when PostgreSQL is not configured; it does not fake success.
- Added `pg` and `@types/pg`.
- Build route changed to `next build --webpack` because Next.js 16.2.10 Turbopack on Windows repeatedly failed while creating a `pg` junction in `.next/node_modules`. Webpack build completed successfully.
- This round did not add a real `DATABASE_URL`, did not add a real `SESSION_SECRET`, did not connect to production, and did not migrate real users.
- Validation evidence: new route/db targeted tests first failed because helper still used the not-connected repository and missing DB config returned 400; after implementation targeted tests passed 4 files / 16 tests.
- Full validation evidence: `npm test` passed 15 files / 80 tests; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack and generated `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`.
- Secret scan evidence: matches were limited to test placeholder URLs (`postgres://local-test.example/...`, `postgres://leaked.example/db`) and existing documentation text; no real database URL, service role key, or session secret was found.

## 阶段目标

在不影响当前 Vercel + Supabase 临时测试版的前提下，先设计清楚中国大陆正式版的技术底座迁移路线。

本阶段目标是完成数据库、认证、权限和部署四块的实施拆分与验收门槛。当前阶段不急着写功能代码，不直接删除 Supabase 代码，不迁移真实用户数据，不操作生产环境。

## 当前临时版

```text
Next.js
  -> Supabase Auth
  -> Supabase Postgres
  -> Supabase RLS
  -> Vercel 临时测试部署
```

当前临时版仍可继续用于 MVP 验证和临时演示。迁移规划不能破坏当前 `/app`、登录、物品管理和 Supabase RLS 验证路径。

## 迁移后正式版目标

```text
Next.js
  -> 阿里云轻量应用服务器
  -> 国内 PostgreSQL
  -> 自有邮箱密码登录
  -> 安全 cookie/session
  -> Next.js 服务端统一权限校验
  -> Nginx + HTTPS + PM2 或 systemd
```

数据库起步推荐使用阿里云轻量服务器本机 PostgreSQL，原因是成本低、部署简单、便于早期运维演练。等真实用户量、备份要求或运维复杂度上升后，再迁到阿里云 RDS PostgreSQL。

## 阶段边界

本阶段要做：

- 设计国内版 PostgreSQL schema 草案。
- 设计自有 `users`、`auth_sessions` 等认证相关表。
- 设计替代 Supabase RLS 的服务端权限校验边界。
- 设计数据访问层抽象路线，减少组件直接调用 Supabase。
- 拆分注册、登录、退出的实施顺序。
- 拆分 `locations`、`items` 服务端 CRUD 的实施顺序。
- 设计用户 A/B 权限负例测试。
- 设计阿里云测试环境部署前置清单。

本阶段不做：

- 不直接删除 Supabase 代码。
- 不把 `.env.local`、数据库密码、session secret 或任何真实密钥提交到 GitHub。
- 不在备案未通过前把正式域名解析到公开网站。
- 不接支付。
- 不接短信。
- 不接照片上传。
- 不接扫码。
- 不迁移真实用户数据。
- 不把未完成权限校验的用户数据表暴露给前端。

## 总体迁移原则

- 临时版和正式版先并行规划，不做硬切换。
- 所有高风险边界先写文档、再确认、再改代码。
- 认证、权限、数据库和部署必须分阶段验收，不能一次性混在一起上线。
- 当前 Supabase RLS 的用户隔离能力，迁移后必须由服务端权限校验和数据库约束共同替代。
- 前端隐藏按钮只能改善体验，不能作为权限边界。

## 数据库设计草案

国内版保留现有业务模型：

- `profiles`
- `households`
- `household_members`
- `areas`
- `locations`
- `items`

国内版新增或改造认证模型：

- `users`
- `auth_sessions`

### users

用途：替代 Supabase `auth.users`，作为正式版用户身份主表。

建议字段：

- `id uuid primary key`
- `email text not null unique`
- `password_hash text not null`
- `email_verified_at timestamptz null`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

约束：

- `email` 必须唯一。
- `password_hash` 只能保存 bcrypt 或 argon2 哈希后的结果，不能保存明文密码。
- `status` 第一版仅使用 `active`，保留后续禁用账号能力。

### auth_sessions

用途：保存服务端 session 状态，配合安全 cookie 完成登录态。

建议字段：

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `session_token_hash text not null unique`
- `expires_at timestamptz not null`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz null`
- `revoked_at timestamptz null`

约束：

- 浏览器 cookie 只保存随机 session token，数据库只保存 token hash。
- 退出登录时写入 `revoked_at` 或删除 session。
- 过期 session 不能继续访问用户数据。

### profiles

国内版建议改为引用自有 `users.id`：

- `id uuid primary key references users(id) on delete cascade`
- `display_name text null`
- `created_at timestamptz not null default now()`

### households

保持家庭空间概念，第一版仍是单账号私有清单。

- `id uuid primary key`
- `owner_user_id uuid not null references users(id)`
- `name text not null`
- `created_at timestamptz not null default now()`

### household_members

第一版只创建 owner 成员，为后续家庭共享保留结构。

- `household_id uuid not null references households(id) on delete cascade`
- `user_id uuid not null references users(id) on delete cascade`
- `role text not null default 'owner'`
- `created_at timestamptz not null default now()`

约束：

- `(household_id, user_id)` 唯一。
- 第一版不开放邀请成员。

### areas / locations / items

业务表继续通过 `household_id` 归属用户家庭空间。

关键约束：

- `areas.household_id` 必须引用 `households(id)`。
- `locations.household_id` 必须引用 `households(id)`。
- `locations.area_id` 必须属于同一个 household，允许为空。
- `items.household_id` 必须引用 `households(id)`。
- `items.location_id` 必须属于同一个 household，允许为空。
- `items.created_by` 必须引用 `users(id)`。

是否用数据库触发器强制同 household 关系，需要在正式 schema 任务中确认。无论是否使用触发器，服务端写入层必须显式校验。

## 自有认证设计

第一版认证只做邮箱 + 密码。

注册流程：

```text
提交 email + password
  -> 服务端校验格式和密码长度
  -> 检查 email 是否已存在
  -> bcrypt 或 argon2 生成 password_hash
  -> 创建 users
  -> 创建 profiles
  -> 创建默认 household
  -> 创建 household_members owner 记录
  -> 创建 auth_sessions
  -> 设置 HttpOnly secure cookie
```

登录流程：

```text
提交 email + password
  -> 服务端按 email 查找 users
  -> 校验 status
  -> 校验 password_hash
  -> 创建 auth_sessions
  -> 设置 HttpOnly secure cookie
  -> 返回登录成功
```

退出流程：

```text
读取 session cookie
  -> 服务端将 auth_sessions 标记 revoked
  -> 清除 cookie
  -> 返回退出成功
```

安全要求：

- 密码不能明文保存。
- 密码哈希算法确认使用 bcrypt。
- session cookie 必须 `HttpOnly`。
- 生产环境 cookie 必须 `Secure`。
- session 默认有效期确认为 30 天。
- session token 必须足够随机。
- 数据库只保存 session token hash。
- 登录失败提示不能泄露邮箱是否存在。
- 测试阶段先不做邮箱验证和密码重置。
- 正式公开前必须补齐邮箱验证和密码重置，或明确运营处理流程。

## 权限替代设计

迁移前由 Supabase Auth + RLS 提供隔离：

```text
Supabase session
  -> auth.uid()
  -> RLS 检查 household membership
```

迁移后由 Next.js 服务端统一校验：

```text
请求进入服务端
  -> 读取安全 cookie
  -> 查询 auth_sessions
  -> 确认 session 未过期且未撤销
  -> 得到 currentUser
  -> 查询 household_members
  -> 校验 area/location/item 是否属于该 household
  -> 执行读写
```

权限规则：

- 用户只能读取自己所属 household 的 `areas`、`locations`、`items`。
- 用户只能写入自己所属 household 的 `areas`、`locations`、`items`。
- 第一版每个用户只有一个默认 household。
- 前端传入的 `household_id`、`area_id`、`location_id`、`item_id` 都不可信，服务端必须重新校验。
- 更新和删除必须同时命中当前用户 household，不能只按主键执行。
- 用户 A/B 负例测试必须覆盖读、写、改、删。

建议服务端边界：

- `requireCurrentUser()`：从 session cookie 解析当前用户。
- `getDefaultHouseholdForUser(userId)`：取得当前用户 household。
- `assertHouseholdMember(userId, householdId)`：确认用户属于 household。
- `assertLocationBelongsToHousehold(locationId, householdId)`：确认位置归属。
- `assertItemBelongsToHousehold(itemId, householdId)`：确认物品归属。
- `inventoryRepository` 或 `inventoryService`：承载服务端 CRUD。

## 数据访问层迁移方向

当前代码中仍可能存在组件或 feature 文件直接调用 Supabase 的情况。国内版迁移前，应逐步把数据访问抽到明确边界。

推荐顺序：

1. 新增不改变行为的数据访问接口草案。
2. 把 `locations` 和 `items` 读写从组件中移到服务层。
3. 保留 Supabase 实现作为临时 adapter。
4. 新增 PostgreSQL 实现作为正式版 adapter。
5. 在正式版环境中只让服务端调用 PostgreSQL adapter。

禁止路线：

- 不在浏览器端直接连接 PostgreSQL。
- 不把数据库密码放到 `NEXT_PUBLIC_*` 环境变量。
- 不让前端绕过服务端权限层直接写业务表。

## 可执行子阶段

### 子阶段 1：国内版 schema 草案

目标：把 Supabase schema 转换为标准 PostgreSQL 草案，并补齐 `users`、`auth_sessions`。

产物：

- `dev-docs/mainland-database-design.md` 中确认后的正式版 schema 说明。
- `dev-docs/sql/mainland_initial_schema.sql` 中的 SQL 草案。
- 后续再创建 migration 文件，当前文档阶段不创建生产数据库。

完成标准：

- 所有业务表不再依赖 Supabase `auth.users`。
- 所有用户数据表都有明确 owner/household 边界。
- 明确哪些约束由数据库保证，哪些由服务端保证。

停止条件：

- 如果需要改 MVP 产品范围，例如家庭共享、手机号、照片、扫码，必须先询问用户。

### 子阶段 2：自有认证表与 session 设计

目标：确认 `users`、`auth_sessions`、密码哈希和 cookie/session 生命周期。

产物：

- 注册、登录、退出流程设计。
- session 过期、退出、撤销策略。
- 密码哈希算法选择记录。

完成标准：

- 不保存明文密码。
- 不把 session secret 或数据库密码写入仓库。
- 未登录访问 `/app` 的拦截策略明确。

停止条件：

- 如果要加入短信、社交登录、邮箱验证码服务或第三方认证服务，必须先询问用户。

### 子阶段 3：服务端权限校验设计

目标：把 Supabase RLS 的隔离能力转移到 Next.js 服务端权限层。

产物：

- 当前用户解析函数设计。
- household membership 校验设计。
- area/location/item 所属关系校验设计。
- 用户 A/B 负例测试清单。

完成标准：

- 用户 A/B 读、写、改、删负例都有验收路径。
- 任何业务表读写都不能只靠前端控制。
- 更新和删除必须按当前用户 household 收敛。

停止条件：

- 如果权限负例失败，不能部署到测试环境，更不能迁移真实用户。

### 子阶段 4：数据访问层抽象

目标：逐步减少组件直接调用 Supabase，为正式版 PostgreSQL adapter 留出位置。

产物：

- `locations` 和 `items` 的服务层接口。
- 当前 Supabase adapter 保留。
- 后续 PostgreSQL adapter 设计。

完成标准：

- 当前临时版行为不变。
- Supabase 代码未被删除。
- 业务组件不需要知道底层是 Supabase 还是 PostgreSQL。

停止条件：

- 如果重构会破坏当前 Vercel/Supabase 临时版，必须停止并拆小。

### 子阶段 5：注册/登录/退出实现

目标：在正式版服务端实现邮箱密码认证闭环。

产物：

- 注册接口或 server action。
- 登录接口或 server action。
- 退出接口或 server action。
- 未登录访问保护。

完成标准：

- 用户能注册、登录、退出。
- 刷新页面后 session 仍有效。
- session 过期或撤销后不能访问 `/app`。
- 错误提示不泄露敏感信息。

停止条件：

- 如果需要真实邮件发送服务或密码找回能力，必须先更新真源并让用户确认。

### 子阶段 6：locations/items 服务端 CRUD

目标：先实现核心业务表服务端 CRUD，证明自有权限层可替代 RLS。

产物：

- `locations` 服务端新增、读取、更新、删除。
- `items` 服务端新增、读取、更新、删除。
- 失败和权限错误提示。

完成标准：

- 用户只能看到自己的 locations/items。
- 新增后刷新仍存在。
- 编辑和删除只能作用于当前用户 household。
- 前端不直接连接 PostgreSQL。

停止条件：

- 如果需要改 schema 字段或新增业务功能，先更新 `dev-docs/database-design.md` 或对应真源。

### 子阶段 7：用户 A/B 权限负例测试

目标：用真实服务端权限层验证跨用户隔离。

测试清单：

- 用户 A 创建 location 和 item。
- 用户 B 查询 A 的 location/item，结果必须为空或无权限。
- 用户 B 使用 A 的 `household_id` 新增 location，必须失败。
- 用户 B 使用 A 的 `location_id` 新增 item，必须失败。
- 用户 B 更新 A 的 item，必须失败。
- 用户 B 删除 A 的 item，必须失败。
- 未登录请求读取任意用户数据，必须失败。

完成标准：

- 每个负例有命令、响应或截图证据。
- 失败来自服务端权限校验或数据库约束，不是只靠前端隐藏按钮。
- 结果写回 `dev-docs/acceptance.md`。

停止条件：

- 任一负例失败，都不能进入部署测试环境。

### 子阶段 8：阿里云测试环境部署准备

目标：只在认证、数据库和权限负例通过后，再部署到阿里云测试环境。

服务器准备：

- Node.js。
- PostgreSQL。
- Nginx。
- PM2 或 systemd。
- HTTPS 证书。
- 环境变量。
- 数据库备份脚本。
- 基础日志。

部署要求：

- `.env.local` 不提交。
- 数据库密码、session secret、邮件服务密钥不进入 Git。
- 未备案通过前，不把正式域名解析到公开网站。
- 阿里云测试环境可以先使用服务器 IP 访问。
- 测试环境可以使用临时访问方式，但不能对外宣称正式生产可用。

完成标准：

- `npm run build` 通过。
- 服务能在阿里云测试环境启动。
- 未登录访问被拦截。
- 注册/登录/退出可用。
- locations/items CRUD 可用。
- 用户 A/B 权限负例通过。
- 数据库备份脚本至少完成一次演练。

停止条件：

- 未完成 ICP 备案前，不进行正式域名公开解析。
- 未完成 HTTPS 前，不开放正式登录入口。
- 未完成备份恢复演练前，不承诺长期保存真实用户数据。

## 第一批代码改造顺序

代码实现必须在本规划确认后再开始。

推荐顺序：

1. 新增国内版数据库 schema 草案。
2. 新增 `users`、`auth_sessions` 或 auth 相关表。
3. 抽象数据访问层，逐步减少组件里直接调用 Supabase。
4. 实现注册、登录、退出。
5. 实现 `locations` / `items` 的服务端 CRUD。
6. 做用户 A/B 权限负例测试。
7. 再部署到阿里云测试环境。

## 验收路径

```text
完成本迁移规划确认
  -> 完成国内版 schema 草案
  -> 完成自有认证设计
  -> 完成服务端权限设计
  -> 保留当前 Supabase 临时版可用
  -> 实现正式版认证和服务端 CRUD
  -> 用户 A/B 权限负例通过
  -> 阿里云测试环境部署
  -> 备案和 HTTPS 准备完成后再考虑正式域名公开访问
```

## 当前确认状态

已确认：

- 当前 Vercel/Supabase 版本是临时测试版。
- 国内正式版目标路线是 Next.js + 阿里云轻量服务器 + 国内 PostgreSQL + 自有邮箱密码登录 + 服务端权限校验。
- 数据库起步推荐轻量服务器本机 PostgreSQL，后续按规模迁到阿里云 RDS PostgreSQL。
- 第一阶段先设计，不急着写代码。
- 密码哈希算法：bcrypt。
- session 默认有效期：30 天。
- 测试阶段先不做邮箱验证和密码重置。
- 阿里云测试环境可以先用服务器 IP 访问。
- 已新增国内版 PostgreSQL schema 草案：`dev-docs/mainland-database-design.md` 和 `dev-docs/sql/mainland_initial_schema.sql`。
- 已新增 session token 基础工具：`src/server/auth/session-security.ts`，当前只做本地可测试准备，尚未接入真实登录流程。
- 已新增 bcrypt 密码哈希工具：`src/server/auth/password-security.ts`，当前只做本地可测试准备，尚未接入真实登录流程。
- 已新增服务端权限校验纯函数：`src/server/auth/authorization.ts`，当前只做本地可测试准备，尚未接入 route handler/server action。
- 已新增库存数据访问 repository 边界：`src/features/inventory/inventory-repository.ts`，当前 Supabase adapter 保留，未切换到 PostgreSQL。
- `.env.example` 已补充服务端专用 `DATABASE_URL` 和 `SESSION_SECRET` 占位符，未提交真实密钥。

待确认：

- 阿里云服务器 IP、SSH 登录方式、PostgreSQL 初始化方式。
- 正式公开前的邮箱发送服务选择。

## 2026-07-06 本地准备证据

- `npm test`：9 个测试文件 / 55 个测试通过。
- `npm run lint`：exit code 0。
- `npm run build`：exit code 0，Next.js 16.2.10 / Turbopack 构建成功，生成 `/`、`/_not-found`、`/app`、`/login`。
- 本轮未连接真实 PostgreSQL。
- 本轮未删除 Supabase 代码。
- 本轮未接入真实云服务、真实密钥、支付、短信、照片或扫码。

## 2026-07-06 认证与权限本地雏形证据

- `bcryptjs` 已加入项目依赖，用于实现已确认的 bcrypt 密码哈希路线。
- `src/server/auth/password-security.ts` 已覆盖 bcrypt cost、密码哈希、密码验证和短密码拒绝。
- `src/server/auth/session-security.ts` 已补充 30 天 session 默认有效期。
- `src/server/auth/authorization.ts` 已覆盖 household membership 校验和资源 household 归属校验。
- 当前仍未接入真实注册、登录、退出流程。
- 当前仍未连接真实 PostgreSQL。
- 本轮验证：`npm test` 通过 11 个测试文件 / 63 个测试；`npm run lint` exit code 0；`npm run build` exit code 0。

## 必须停止并询问

- 要改变技术路线，例如放弃阿里云、改用 Firebase、自建非 Next.js 后端或原生 App 先行。
- 要新增手机号短信、社交登录、支付、上传、AI 识别、扫码、家庭共享、管理员后台。
- 需要真实云账号、真实密钥、真实用户数据或生产环境操作。
- 项目目标、MVP、不做什么、验收标准发生变化。

## 2026-07-07 Local PostgreSQL runtime evidence

- Installed local PostgreSQL through Scoop as `postgresql` 18.4-2 after the EDB installer path produced an incomplete local installation.
- Started local PostgreSQL on `localhost:5432` and created disposable database `home_inventory_test`.
- Verified auth repository integration against real PostgreSQL: register, login, logout, user/profile/household/member/session persistence.
- Verified inventory repository/service integration against real PostgreSQL: user A creates area/location/item, user B sees no A data, and user B write attempts against A ids are rejected.
- Updated `npm run test:postgres` to use `--no-file-parallelism`, because both integration test files reset the same disposable `public` schema.
- Configured local Windows user environment variables for this machine: `TEST_DATABASE_URL`, `DATABASE_URL`, and `SESSION_SECRET`.
- Validation evidence: `npm run test:postgres` passed 2 files / 2 real database tests with 2 skip-placeholder tests; `npm test` passed 26 files / 164 tests with 2 skipped placeholder cases; `npm run lint` exit code 0; `npm run build` exit code 0 using webpack.
- Safety boundary: no production database, real cloud database, real user data, database password, service role key, private key, or session secret was committed.
- Next required step before server upload: run browser-level self-hosted register/login/logout/inventory CRUD against this local PostgreSQL runtime, then prepare Alibaba Cloud test environment variables and deployment checklist.

## 2026-07-07 Browser self-hosted auth and inventory CRUD evidence

- Updated the `/login` form to call self-hosted auth APIs instead of Supabase browser auth.
- Updated `npm run dev` to `next dev --webpack` because Turbopack on Windows failed when compiling the `pg` dependency for auth routes.
- Browser verification against local PostgreSQL confirmed: register, login, dashboard load, logout, and unauthenticated `/app` protection.
- Browser verification against local PostgreSQL confirmed create flows for area, location, and item; a reload kept the created records visible.
- Local disposable data used for the smoke flow: area `厨房`, location `冰箱`, item `牛奶`.
- Added `@playwright/test` as a dev dependency so browser verification can run locally.
- Safety boundary: no production database, real cloud database, real user data, database password, service role key, private key, or session secret was committed.
- Next required step before server upload: browser-level update/delete verification for area/location/item, then Alibaba Cloud test-environment deployment checklist and environment-variable preparation.
