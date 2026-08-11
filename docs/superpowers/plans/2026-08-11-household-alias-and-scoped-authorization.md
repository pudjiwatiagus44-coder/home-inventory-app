# Household Alias and Scoped Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-user household display names, multi-household invitation grants, and the new contributor permission level across the self-hosted server and Android app.

**Architecture:** Keep the current self-hosted path only: Next.js API handlers call feature services, services enforce membership/role boundaries, repositories read/write PostgreSQL, and Android consumes the same API contracts. Personal display names live in a new per-user preference table; real household names remain owner-only.

**Tech Stack:** TypeScript, Next.js route handlers, PostgreSQL SQL migrations, Vitest, Kotlin, Retrofit, Jetpack Compose, Android unit tests.

---

## File Structure

- Create: `dev-docs/sql/household_alias_and_scoped_authorization.sql`
  - Adds `contributor`, `locations.created_by`, `household_user_preferences`, and invitation grant tables/columns.
- Modify: `src/features/family/family-data.ts`
  - Extends role/household/invitation DTO types with `contributor`, `displayName`, `effectiveName`, and grants.
- Modify: `src/features/family/family-repository.ts`
  - Reads/writes aliases, invitation grants, contributor role, and scoped membership updates.
- Modify: `src/features/family/family-service.ts`
  - Adds alias methods, management-role checks, grant creation/approval, and contributor role validation.
- Modify: `src/app/api/family/handlers.ts`
  - Exposes display-name PATCH and grant-aware invitation/member routes.
- Modify: `src/app/api/family/households/route.ts`
  - Routes `PATCH` for owner rename and display-name action.
- Modify: `src/features/inventory/dashboard-data.ts`
  - Extends role type and location creator metadata.
- Modify: `src/features/inventory/inventory-repository.ts`
  - Selects `locations.created_by`; inserts creator for new locations.
- Modify: `src/features/inventory/inventory-service.ts`
  - Enforces contributor create/update/delete rules for locations/items and mobile sync.
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
  - Adds effective household name, display-name request, invitation grants, and contributor role support.
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
  - Adds household display-name endpoint and grant-aware invitation request.
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
  - Uses effective household names and submits alias/invitation grant requests.
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt`
  - Long-press now edits personal display name, not real household name.
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/InviteDialog.kt`
  - Adds household multi-select and role controls: 管理 / 新增 / 只读.
- Modify: truth docs in `dev-docs/`
  - Record implementation evidence only after verification.

## Task 1: Family Types, Alias Repository, and Alias API

**Files:**
- Create: `dev-docs/sql/household_alias_and_scoped_authorization.sql`
- Modify: `src/features/family/family-data.ts`
- Modify: `src/features/family/family-repository.ts`
- Modify: `src/features/family/family-service.ts`
- Modify: `src/app/api/family/handlers.ts`
- Test: `src/features/family/family-service.test.ts`
- Test: `src/features/family/family-client.test.ts`
- Test: `src/app/api/family/family-handlers.test.ts`

- [ ] **Step 1: Write failing family service tests for personal display names**

Add tests proving aliases are membership-scoped and user-scoped:

```ts
it("lets any household member set a personal display name without renaming the household", async () => {
  const repository = createMemoryFamilyRepository({
    ownerUserId: "owner",
    members: [
      { householdId: "household-1", userId: "owner", role: "owner" },
      { householdId: "household-1", userId: "member-1", role: "readonly" },
    ],
  });
  const service = createFamilyService({ repository });

  await service.setHouseholdDisplayNameForCurrentUser({
    userId: "member-1",
    householdId: "household-1",
    displayName: "爸妈家",
  });

  const households = await service.listHouseholdsForCurrentUser("member-1");
  expect(households[0]).toMatchObject({
    id: "household-1",
    name: "我的家",
    displayName: "爸妈家",
    effectiveName: "爸妈家",
  });
  await expect(repository.getHouseholdName("household-1")).resolves.toBe("我的家");
});

it("does not let a non-member set a household display name", async () => {
  const service = createFamilyService({
    repository: createMemoryFamilyRepository({ ownerUserId: "owner" }),
  });

  await expect(
    service.setHouseholdDisplayNameForCurrentUser({
      userId: "stranger",
      householdId: "household-1",
      displayName: "不该成功",
    }),
  ).rejects.toThrow("无权访问");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx vitest run src/features/family/family-service.test.ts
```

Expected: FAIL because `setHouseholdDisplayNameForCurrentUser` and alias repository methods do not exist.

- [ ] **Step 3: Implement alias types and repository methods**

Add role and household type fields:

```ts
export type HouseholdRole = "owner" | "member" | "contributor" | "readonly";

export type HouseholdOption = {
  id: string;
  name: string;
  displayName?: string | null;
  effectiveName: string;
  role: HouseholdRole;
};
```

Add repository contract:

```ts
setHouseholdDisplayName: (input: {
  userId: string;
  householdId: string;
  displayName: string | null;
}) => Promise<void>;
```

PostgreSQL list query should left join preferences:

```sql
select hm.household_id, h.name, hup.display_name, hm.role
from household_members hm
join households h on h.id = hm.household_id
left join household_user_preferences hup
  on hup.household_id = hm.household_id and hup.user_id = hm.user_id
where hm.user_id = $1
```

Return `effectiveName: row.display_name || row.name`.

- [ ] **Step 4: Implement service alias method**

Add:

```ts
async setHouseholdDisplayNameForCurrentUser(input: {
  userId: string;
  householdId: string;
  displayName: string;
}): Promise<void> {
  await assertMember(input.userId, input.householdId);
  const normalized = input.displayName.trim();
  if (normalized.length > 50) {
    throw new Error("家庭显示名需要 50 个字符以内");
  }
  await repository.setHouseholdDisplayName({
    userId: input.userId,
    householdId: input.householdId,
    displayName: normalized || null,
  });
}
```

- [ ] **Step 5: Add API handler and client tests for display-name PATCH**

Add handler test:

```ts
it("updates the caller household display name", async () => {
  const service = createMockFamilyService({
    setHouseholdDisplayNameForCurrentUser: async (input) => {
      expect(input).toMatchObject({
        userId: "user-1",
        householdId: "household-1",
        displayName: "爸妈家",
      });
    },
  });
  const response = await createFamilyHandlers({ service }).PATCH_HOUSEHOLD_DISPLAY_NAME(
    authedRequest("http://localhost/api/family/households/display-name", {
      method: "PATCH",
      body: JSON.stringify({ householdId: "household-1", displayName: "爸妈家" }),
    }),
  );
  expect(response.status).toBe(200);
});
```

Add web client method:

```ts
await client.setHouseholdDisplayName({
  householdId: "household-1",
  displayName: "爸妈家",
});
```

- [ ] **Step 6: Run alias tests and commit**

Run:

```powershell
npx vitest run src/features/family/family-service.test.ts src/features/family/family-client.test.ts src/app/api/family/family-handlers.test.ts
```

Expected: PASS.

Commit:

```powershell
git add dev-docs/sql/household_alias_and_scoped_authorization.sql src/features/family src/app/api/family
git commit -m "feat: add household personal display names"
```

## Task 2: Contributor Inventory Permissions

**Files:**
- Modify: `src/features/inventory/dashboard-data.ts`
- Modify: `src/features/inventory/inventory-repository.ts`
- Modify: `src/features/inventory/inventory-service.ts`
- Modify: `src/features/inventory/mobile-sync.ts`
- Test: `src/features/inventory/inventory-service-permissions.test.ts`
- Test: `src/app/api/mobile/inventory/permissions.test.ts`

- [ ] **Step 1: Write failing tests for contributor writes**

Add:

```ts
it("lets contributors create and edit their own items but not delete them", async () => {
  const repository = createMemoryInventoryRepository({
    dashboard: dashboardWithRole("contributor", {
      items: [{ id: "item-1", name: "杯子", createdBy: "member-1" }],
    }),
  });
  const service = createInventoryService({ repository });

  await service.createItemForCurrentUser({
    userId: "member-1",
    name: "新物品",
    note: "",
    expireDate: null,
    locationId: null,
  });
  await service.updateItemForCurrentUser({
    userId: "member-1",
    itemId: "item-1",
    name: "杯子2",
    note: "",
    expireDate: null,
    locationId: null,
  });
  await expect(
    service.deleteItemForCurrentUser({ userId: "member-1", itemId: "item-1" }),
  ).rejects.toThrow("不能删除");
});

it("rejects contributors editing items or locations created by someone else", async () => {
  const service = createInventoryService({
    repository: createMemoryInventoryRepository({
      dashboard: dashboardWithRole("contributor", {
        items: [{ id: "item-2", name: "别人建的", createdBy: "owner" }],
        locations: [{ id: "location-2", name: "旧位置", createdBy: "owner" }],
      }),
    }),
  });

  await expect(
    service.updateItemForCurrentUser({
      userId: "member-1",
      itemId: "item-2",
      name: "改名",
      note: "",
      expireDate: null,
      locationId: null,
    }),
  ).rejects.toThrow("只能编辑自己创建");

  await expect(
    service.updateLocationForCurrentUser({
      userId: "member-1",
      locationId: "location-2",
      name: "改位置",
      areaId: null,
    }),
  ).rejects.toThrow("只能编辑自己创建");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx vitest run src/features/inventory/inventory-service-permissions.test.ts
```

Expected: FAIL because contributor is not handled and locations lack creator data.

- [ ] **Step 3: Implement contributor permission helpers**

Add errors and helpers:

```ts
export class ContributorPermissionError extends Error {
  constructor(message = "新增成员只能新增，或编辑自己创建的内容") {
    super(message);
    this.name = "ContributorPermissionError";
  }
}

function roleOf(dashboard: DashboardData) {
  return dashboard.household.role;
}

function assertCanDelete(dashboard: DashboardData) {
  assertCanWrite(dashboard);
  if (roleOf(dashboard) === "contributor") {
    throw new ContributorPermissionError("新增成员不能删除家庭数据");
  }
}

function assertContributorOwnsRecord(input: {
  dashboard: DashboardData;
  userId: string;
  createdBy?: string | null;
}) {
  if (input.dashboard.household.role === "contributor" && input.createdBy !== input.userId) {
    throw new ContributorPermissionError("新增成员只能编辑自己创建的内容");
  }
}
```

Use them in update/delete item/location flows. Keep area create/update/delete as owner/member only for contributor by throwing `ContributorPermissionError`.

- [ ] **Step 4: Update repository creator fields**

Add `createdBy` to dashboard location rows and insert creator for new locations:

```sql
select id, household_id, area_id, name, sort_order, created_by, updated_at
from locations
where household_id = $1
```

```sql
insert into locations (household_id, area_id, name, created_by)
values ($1, $2, $3, $4)
```

Pass `createdBy: input.userId` from service to repository.

- [ ] **Step 5: Run contributor tests and commit**

Run:

```powershell
npx vitest run src/features/inventory/inventory-service-permissions.test.ts src/app/api/mobile/inventory/permissions.test.ts
```

Expected: PASS.

Commit:

```powershell
git add src/features/inventory src/app/api/mobile/inventory dev-docs/sql/household_alias_and_scoped_authorization.sql
git commit -m "feat: enforce contributor inventory permissions"
```

## Task 3: Multi-Household Invitation Grants and Member Roles

**Files:**
- Modify: `src/features/family/family-data.ts`
- Modify: `src/features/family/family-repository.ts`
- Modify: `src/features/family/family-service.ts`
- Modify: `src/app/api/family/handlers.ts`
- Modify: `src/features/family/FamilySettings.tsx`
- Test: `src/features/family/family-service.test.ts`
- Test: `src/app/api/family/family-handlers.test.ts`

- [ ] **Step 1: Write failing service tests for grants**

Add:

```ts
it("creates an invitation with grants defaulting to the current household", async () => {
  const grants: Array<{ householdId: string; role: string }> = [];
  const service = createFamilyService({
    repository: createMemoryFamilyRepository({
      ownerUserId: "owner",
      members: [{ householdId: "household-1", userId: "owner", role: "owner" }],
      createdInvitationGrants: grants,
    }),
  });

  await service.createInvitationLinkForCurrentUser({
    userId: "owner",
    householdId: "household-1",
    grants: [{ householdId: "household-1", role: "contributor" }],
    token: "token-1",
    now: new Date("2026-08-11T00:00:00.000Z"),
  });

  expect(grants).toEqual([{ householdId: "household-1", role: "contributor" }]);
});

it("approves a join request by inserting every invitation grant", async () => {
  const members: Array<{ householdId: string; userId: string; role: string }> = [];
  const service = createFamilyService({
    repository: createMemoryFamilyRepository({
      ownerUserId: "owner",
      members,
      pendingRequest: {
        requestId: "request-1",
        userId: "invitee",
        householdId: "household-1",
        invitationId: "invitation-1",
        grants: [
          { householdId: "household-1", role: "member" },
          { householdId: "household-2", role: "readonly" },
        ],
      },
    }),
  });

  await service.approveJoinRequestForCurrentUser({
    userId: "owner",
    requestId: "request-1",
  });

  expect(members).toEqual(
    expect.arrayContaining([
      { householdId: "household-1", userId: "invitee", role: "member" },
      { householdId: "household-2", userId: "invitee", role: "readonly" },
    ]),
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx vitest run src/features/family/family-service.test.ts
```

Expected: FAIL because invitation grants and contributor role validation are missing.

- [ ] **Step 3: Implement management-role authorization**

Replace owner-only invitation/member management checks with:

```ts
async function assertCanManageHousehold(userId: string, householdId: string) {
  const role = await repository.getHouseholdMemberRole(userId, householdId);
  if (role !== "owner" && role !== "member") {
    throw new AuthorizationError("只有房主或管理成员可以管理邀请和授权");
  }
}
```

Keep real household rename owner-only.

- [ ] **Step 4: Implement grant-aware invitation creation and approval**

Service validation:

```ts
const allowedGrantRoles = new Set(["member", "contributor", "readonly"]);
for (const grant of grants) {
  if (!allowedGrantRoles.has(grant.role)) throw new AuthorizationError("不支持的授权角色");
  await assertCanManageHousehold(input.userId, grant.householdId);
}
```

Approval inserts all grants:

```ts
const grants = await repository.listInvitationGrants(pending.invitationId);
for (const grant of grants) {
  await repository.insertMemberIfMissing({
    householdId: grant.householdId,
    userId: pending.userId,
    role: grant.role,
  });
}
```

- [ ] **Step 5: Update API handler tests**

Add:

```ts
it("accepts invitation grants in POST /api/family/invitations", async () => {
  const response = await handlers.POST_INVITATION(
    authedRequest("http://localhost/api/family/invitations", {
      method: "POST",
      body: JSON.stringify({
        grants: [
          { householdId: "household-1", role: "member" },
          { householdId: "household-2", role: "readonly" },
        ],
      }),
    }),
  );

  expect(response.status).toBe(200);
});

it("allows contributor as a member role update target", async () => {
  const response = await handlers.PATCH_MEMBER(
    authedRequest("http://localhost/api/family/members/user-2", {
      method: "PATCH",
      body: JSON.stringify({ householdId: "household-1", role: "contributor" }),
    }),
    { params: Promise.resolve({ userId: "user-2" }) },
  );

  expect(response.status).toBe(200);
});
```

- [ ] **Step 6: Run family route tests and commit**

Run:

```powershell
npx vitest run src/features/family/family-service.test.ts src/app/api/family/family-handlers.test.ts
```

Expected: PASS.

Commit:

```powershell
git add src/features/family src/app/api/family dev-docs/sql/household_alias_and_scoped_authorization.sql
git commit -m "feat: add scoped household invitation grants"
```

## Task 4: Android Alias Display and Grant-Aware Invite UI

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/InviteDialog.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/ui/dashboard/components/TopBarTest.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt`

- [ ] **Step 1: Write failing Android repository tests**

Add:

```kotlin
@Test
fun `loadHouseholds uses effective name when display name exists`() = runTest {
    api.householdsResponse = apiEnvelope(
        listOf(HouseholdDto(id = "h1", name = "原名", displayName = "我的家", effectiveName = "我的家", role = "member"))
    )

    val households = repository.loadHouseholds().getOrThrow()

    assertEquals("我的家", households.single().effectiveName)
}

@Test
fun `rename household display name sends personal alias request`() = runTest {
    repository.setHouseholdDisplayName("h1", "爸妈家").getOrThrow()

    assertEquals(DisplayNameRequest("h1", "爸妈家"), api.lastDisplayNameRequest)
}
```

- [ ] **Step 2: Run Android repository tests and verify RED**

Run:

```powershell
.\gradlew.bat -p android testDebugUnitTest --tests "com.homeinventory.app.data.repository.InventoryRepositoryTest"
```

Expected: FAIL because DTO/API/repository alias fields and method do not exist.

- [ ] **Step 3: Implement Android DTO/API/repository alias support**

DTO:

```kotlin
data class HouseholdDto(
    val id: String,
    val name: String,
    val displayName: String? = null,
    val effectiveName: String? = null,
    val role: String? = null,
)

data class HouseholdDisplayNameRequest(
    val householdId: String,
    val displayName: String,
)
```

API:

```kotlin
@PATCH("api/family/households/display-name")
suspend fun setHouseholdDisplayName(
    @Body request: HouseholdDisplayNameRequest,
): Response<ApiEnvelope<Unit>>
```

Repository:

```kotlin
suspend fun setHouseholdDisplayName(householdId: String, displayName: String): Result<Unit> =
    safeUnitCall { api.setHouseholdDisplayName(HouseholdDisplayNameRequest(householdId, displayName)) }
```

- [ ] **Step 4: Write failing TopBar/ViewModel tests**

Add tests that long-press calls personal alias callback and role label maps contributor:

```kotlin
composeTestRule.onNodeWithText("我的家").performTouchInput { longClick() }
assertEquals("h1", renamedHouseholdId)
```

Expected UI labels:

```kotlin
roleLabel("owner") == "房主"
roleLabel("member") == "管理"
roleLabel("contributor") == "新增"
roleLabel("readonly") == "只读"
```

- [ ] **Step 5: Implement Android UI behavior**

Use `household.effectiveName ?: household.name` everywhere household names are rendered. Rename callback should be renamed in code to `onSetHouseholdDisplayName` and should call the display-name endpoint. Keep owner real-name endpoint available only if an explicit future UI uses it.

Invite dialog roles:

```kotlin
val grantRoles = listOf(
    "member" to "管理",
    "contributor" to "新增",
    "readonly" to "只读",
)
```

Default selected grant:

```kotlin
selectedHouseholdIds = setOf(currentHouseholdId)
roleByHouseholdId = mapOf(currentHouseholdId to "member")
```

- [ ] **Step 6: Run Android tests and commit**

Run:

```powershell
.\gradlew.bat -p android testDebugUnitTest
```

Expected: PASS.

Commit:

```powershell
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat: add android household aliases and invite grants"
```

## Task 5: Web Family Settings and Final Verification

**Files:**
- Modify: `src/features/family/FamilySettings.tsx`
- Modify: `src/features/family/family-client.ts`
- Modify: `src/features/inventory/AppDashboard.tsx`
- Modify: `dev-docs/project-brief.md`
- Modify: `dev-docs/architecture.md`
- Modify: `dev-docs/acceptance.md`
- Test: `src/features/family/family-client.test.ts`
- Test: `src/features/inventory/AppDashboard.test.ts`

- [ ] **Step 1: Write failing web tests**

Add client tests:

```ts
it("creates invitation grants for multiple households", async () => {
  await client.createInvitationLink({
    grants: [
      { householdId: "h1", role: "member" },
      { householdId: "h2", role: "contributor" },
    ],
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/family/invitations",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        grants: [
          { householdId: "h1", role: "member" },
          { householdId: "h2", role: "contributor" },
        ],
      }),
    }),
  );
});
```

- [ ] **Step 2: Run web client tests and verify RED**

Run:

```powershell
npx vitest run src/features/family/family-client.test.ts src/features/inventory/AppDashboard.test.ts
```

Expected: FAIL until client/UI supports grant payload and effective names.

- [ ] **Step 3: Implement Web client/UI support**

Family client create invitation signature:

```ts
createInvitationLink(input: {
  householdId?: string;
  grants?: Array<{ householdId: string; role: "member" | "contributor" | "readonly" }>;
})
```

Dashboard household selector displays:

```ts
const label = household.effectiveName ?? household.displayName ?? household.name;
```

Family settings role label:

```ts
const roleLabels = {
  owner: "房主",
  member: "管理",
  contributor: "新增",
  readonly: "只读",
};
```

- [ ] **Step 4: Update truth docs with implementation evidence**

Append to `dev-docs/acceptance.md` only after verification:

```md
## 2026-08-11 家庭空间个人别名与按地点授权实现证据

- 服务端：...
- Android：...
- Web：...
- 本地验证：...
- 待办：APK 上传、服务器部署和真机验收（如本轮未执行）。
```

- [ ] **Step 5: Run full verification**

Run:

```powershell
npx vitest run --exclude src/server/auth/postgres-auth-repository.integration.test.ts --exclude src/features/inventory/postgres-inventory.integration.test.ts
npx eslint src
npm run build
.\gradlew.bat -p android testDebugUnitTest
.\gradlew.bat -p android assembleDebug
```

Expected: all PASS.

- [ ] **Step 6: Commit final implementation**

Commit:

```powershell
git add src android dev-docs
git commit -m "feat: add household aliases and scoped authorization"
```

## Self-Review

- Spec coverage: personal aliases, alias-only visibility, owner-only real name, contributor rules, multi-household invitation grants, member authorization edit/delete, Android top dropdown names, Web/API parity, and Supabase exclusion are all mapped to tasks.
- Placeholder scan: no TBD/TODO/later-only implementation steps remain; each task has concrete commands and expected failures/passes.
- Type consistency: role literals are `owner | member | contributor | readonly`; UI labels are 房主 / 管理 / 新增 / 只读; household display fields are `name`, `displayName`, and `effectiveName`.
- Scope note: production deployment and APK upload are intentionally outside this implementation plan unless requested after local verification.
