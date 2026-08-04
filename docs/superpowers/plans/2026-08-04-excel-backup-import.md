# Excel Backup Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel backup export and two-step Excel import for inventory data.

**Architecture:** Keep Excel parsing and conflict detection in `src/features/inventory/excel-backup.ts`, keep authenticated write decisions in the inventory service and API route, and keep the dashboard UI as a preflight/confirm flow. The import format follows the reference workbook headers: `序号`, `名称`, `格子编号`, `所在区域`, `备注`, `有效期`.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, `xlsx`, existing PostgreSQL-backed inventory service.

---

### Task 1: Truth Docs

**Files:**
- Modify: `dev-docs/project-brief.md`
- Modify: `dev-docs/architecture.md`
- Modify: `dev-docs/acceptance.md`

- [ ] Record Excel export/import as an MVP maintenance feature.
- [ ] Record duplicate/conflict rules: identical rows skip; same area/location/name with changed note or expire date requires user choice; new rows import and create missing areas/locations.
- [ ] Record validation evidence after implementation.

### Task 2: Excel Format And Conflict Tests

**Files:**
- Modify: `src/features/inventory/excel-backup.ts`
- Create or modify: `src/features/inventory/excel-backup.test.ts`

- [ ] Add failing tests for the reference headers and workbook filename.
- [ ] Add failing tests for date parsing: blank, `YYYY-MM-DD`, slash date, Excel serial date, and unsupported month-only values.
- [ ] Add failing tests for import planning: identical duplicate skips, changed duplicate becomes conflict, new row becomes create action.

### Task 3: Service And API Tests

**Files:**
- Modify: `src/features/inventory/inventory-service.ts`
- Modify: `src/features/inventory/inventory-service.test.ts`
- Modify: `src/app/api/inventory/import/route.ts`
- Create: `src/app/api/inventory/import/route.test.ts`

- [ ] Add failing service tests for `previewImportForCurrentUser` and `commitImportForCurrentUser`.
- [ ] Add failing API tests for unauthenticated requests, preview mode, and commit mode.
- [ ] Ensure route files export only valid Next.js route exports.

### Task 4: Client And Dashboard UI

**Files:**
- Modify: `src/features/inventory/self-hosted-inventory-client.ts`
- Modify: `src/features/inventory/self-hosted-inventory-client.test.ts`
- Modify: `src/features/inventory/AppDashboard.tsx`
- Modify: `src/features/inventory/AppDashboard.test.ts`

- [ ] Add client methods for import preview and commit.
- [ ] Add dashboard import flow: choose file, preview, conflict dialog, apply per-conflict choices, refresh dashboard.
- [ ] Keep export available from loaded dashboard data.

### Task 5: Verification

**Commands:**
- `npm test -- src/features/inventory/excel-backup.test.ts src/features/inventory/inventory-service.test.ts src/features/inventory/self-hosted-inventory-client.test.ts src/app/api/inventory/import/route.test.ts`
- `npm test`
- `npm run lint`
- `npm run build`

- [ ] All targeted tests pass.
- [ ] Full tests pass or documented skips are unchanged.
- [ ] Lint and build pass.
