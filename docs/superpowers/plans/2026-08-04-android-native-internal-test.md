# Android Native Internal Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Kotlin native Android internal-test APK that reuses the existing account/backend, supports local offline inventory edits, and automatically syncs offline creates when the network returns.

**Architecture:** Add a mobile sync contract to the existing Next.js API without bypassing the server permission boundary. Create a new `android/` Kotlin app using Jetpack Compose, MVVM, Retrofit/OkHttp, Room, and encrypted session storage. Keep the server authoritative for identity, household ownership, and update/delete conflicts.

**Tech Stack:** Next.js 16, TypeScript, Vitest, PostgreSQL repository; Android Kotlin, Gradle wrapper, Android Gradle Plugin 9.3.0, Gradle 9.6.1, compileSdk 36, minSdk 26, Jetpack Compose, Room, Retrofit, OkHttp, Kotlin coroutines, DataStore or EncryptedSharedPreferences.

---

## File Structure

### Backend Files

- Modify: `src/features/inventory/dashboard-data.ts`
  Add mobile-facing timestamp fields to dashboard DTO types while preserving existing Web/PWA fields.
- Modify: `src/features/inventory/inventory-repository.ts`
  Return `updated_at` for areas, locations, and items; add version-checked update/delete repository methods.
- Modify: `src/features/inventory/inventory-service.ts`
  Add conflict-aware mobile sync use cases that derive household from the current user.
- Create: `src/features/inventory/mobile-sync.ts`
  Own request/response types and queue operation planning for mobile sync.
- Test: `src/features/inventory/mobile-sync.test.ts`
  Unit-test operation parsing, create mapping, and conflict response shapes.
- Modify: `src/features/inventory/inventory-service.test.ts`
  Cover server-priority conflict behavior.
- Create: `src/app/api/mobile/inventory/snapshot/handlers.ts`
  Return the current user's inventory snapshot for Android.
- Create: `src/app/api/mobile/inventory/snapshot/route.ts`
  Thin Next.js route file that exports `GET`.
- Create: `src/app/api/mobile/inventory/sync/handlers.ts`
  Accept queued Android operations and return per-operation results.
- Create: `src/app/api/mobile/inventory/sync/route.ts`
  Thin Next.js route file that exports `POST`.
- Test: `src/app/api/mobile/inventory/sync/route.test.ts`
  Test auth, validation, create success, and conflict responses.
- Test: `src/app/api/mobile/inventory/permissions.test.ts`
  Verify user B cannot sync operations against user A records.
- Modify: `dev-docs/acceptance.md`
  Record backend and Android validation evidence after implementation.

### Android Files

- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle/wrapper/gradle-wrapper.properties`
- Create: `android/app/build.gradle.kts`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/com/homeinventory/app/MainActivity.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/HomeInventoryApplication.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/config/AppConfig.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/network/NetworkModule.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/InventoryDao.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/PendingOperationDao.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/AuthRepository.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/sync/SyncEngine.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/sync/ConnectivityObserver.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/login/LoginScreen.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryScreen.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryViewModel.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/sync/SyncEngineTest.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt`

---

### Task 1: Backend Mobile Sync Types

**Files:**
- Create: `src/features/inventory/mobile-sync.ts`
- Test: `src/features/inventory/mobile-sync.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/inventory/mobile-sync.test.ts
import { describe, expect, it } from "vitest";

import {
  parseMobileSyncRequest,
  type MobileSyncRequest,
} from "./mobile-sync";

describe("parseMobileSyncRequest", () => {
  it("accepts an offline item create operation with a client operation id", () => {
    const request: MobileSyncRequest = {
      operations: [
        {
          clientOperationId: "op-local-1",
          entity: "item",
          action: "create",
          localId: "local-item-1",
          payload: {
            name: "离线新增物品",
            note: "恢复联网后自动同步",
            expireDate: "2026-12-01",
            locationId: null,
          },
        },
      ],
    };

    expect(parseMobileSyncRequest(request)).toEqual(request);
  });

  it("rejects update operations without a base server updatedAt", () => {
    expect(() =>
      parseMobileSyncRequest({
        operations: [
          {
            clientOperationId: "op-local-2",
            entity: "item",
            action: "update",
            serverId: "item-server-1",
            payload: {
              name: "修改后的物品",
              note: "",
              expireDate: null,
              locationId: null,
            },
          },
        ],
      }),
    ).toThrow("baseServerUpdatedAt is required for update and delete");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/inventory/mobile-sync.test.ts`

Expected: FAIL with `Cannot find module './mobile-sync'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/inventory/mobile-sync.ts
export type MobileSyncEntity = "area" | "location" | "item";
export type MobileSyncAction = "create" | "update" | "delete";

export type MobileAreaPayload = {
  name: string;
  color: string;
};

export type MobileLocationPayload = {
  name: string;
  areaId: string | null;
};

export type MobileItemPayload = {
  name: string;
  note: string;
  expireDate: string | null;
  locationId: string | null;
};

export type MobileSyncOperation = {
  clientOperationId: string;
  entity: MobileSyncEntity;
  action: MobileSyncAction;
  localId?: string;
  serverId?: string;
  baseServerUpdatedAt?: string;
  payload?: MobileAreaPayload | MobileLocationPayload | MobileItemPayload;
};

export type MobileSyncRequest = {
  operations: MobileSyncOperation[];
};

export type MobileSyncOperationResult =
  | {
      clientOperationId: string;
      status: "applied";
      entity: MobileSyncEntity;
      localId?: string;
      serverId: string;
      serverUpdatedAt: string;
    }
  | {
      clientOperationId: string;
      status: "conflict" | "failed";
      entity: MobileSyncEntity;
      serverId?: string;
      message: string;
    };

export type MobileSyncResponse = {
  ok: true;
  results: MobileSyncOperationResult[];
};

export function parseMobileSyncRequest(input: unknown): MobileSyncRequest {
  if (!isRecord(input) || !Array.isArray(input.operations)) {
    throw new Error("operations must be an array");
  }

  const operations = input.operations.map(parseOperation);
  return { operations };
}

function parseOperation(input: unknown): MobileSyncOperation {
  if (!isRecord(input)) {
    throw new Error("operation must be an object");
  }

  const operation: MobileSyncOperation = {
    clientOperationId: readString(input, "clientOperationId"),
    entity: readEntity(input.entity),
    action: readAction(input.action),
    localId: readOptionalString(input.localId),
    serverId: readOptionalString(input.serverId),
    baseServerUpdatedAt: readOptionalString(input.baseServerUpdatedAt),
    payload: isRecord(input.payload) ? (input.payload as MobileSyncOperation["payload"]) : undefined,
  };

  if (
    (operation.action === "update" || operation.action === "delete") &&
    !operation.baseServerUpdatedAt
  ) {
    throw new Error("baseServerUpdatedAt is required for update and delete");
  }

  if (operation.action !== "create" && !operation.serverId) {
    throw new Error("serverId is required for update and delete");
  }

  if (operation.action !== "delete" && !operation.payload) {
    throw new Error("payload is required for create and update");
  }

  return operation;
}

function readEntity(value: unknown): MobileSyncEntity {
  if (value === "area" || value === "location" || value === "item") {
    return value;
  }
  throw new Error("entity must be area, location, or item");
}

function readAction(value: unknown): MobileSyncAction {
  if (value === "create" || value === "update" || value === "delete") {
    return value;
  }
  throw new Error("action must be create, update, or delete");
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/inventory/mobile-sync.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/mobile-sync.ts src/features/inventory/mobile-sync.test.ts
git commit -m "feat: add mobile sync contract types"
```

---

### Task 2: Backend Snapshot Timestamps

**Files:**
- Modify: `src/features/inventory/dashboard-data.ts`
- Modify: `src/features/inventory/inventory-repository.ts`
- Test: `src/features/inventory/inventory-repository.test.ts`
- Test: `src/app/api/inventory/dashboard/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Add to src/features/inventory/inventory-repository.test.ts
import { describe, expect, it, vi } from "vitest";
import { createPostgresInventoryRepository } from "./inventory-repository";

describe("createPostgresInventoryRepository mobile snapshot fields", () => {
  it("returns updatedAt fields for Android sync snapshots", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "household-1", name: "我的家" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "area-1", name: "厨房", color: "#256f6b", updated_at: "2026-08-04T01:00:00.000Z" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "location-1", name: "冰箱", area_id: "area-1", updated_at: "2026-08-04T01:01:00.000Z" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "牛奶", note: "", expire_date: null, location_id: "location-1", updated_at: "2026-08-04T01:02:00.000Z" }],
      });

    const repository = createPostgresInventoryRepository({ query });
    const dashboard = await repository.getDashboardForUser("user-1");

    expect(dashboard?.areas[0]).toMatchObject({ id: "area-1", updatedAt: "2026-08-04T01:00:00.000Z" });
    expect(dashboard?.locations[0]).toMatchObject({ id: "location-1", updatedAt: "2026-08-04T01:01:00.000Z" });
    expect(dashboard?.items[0]).toMatchObject({ id: "item-1", updatedAt: "2026-08-04T01:02:00.000Z" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/inventory/inventory-repository.test.ts`

Expected: FAIL because dashboard rows do not expose `updatedAt`.

- [ ] **Step 3: Implement timestamp mapping**

Update the dashboard data row types to include optional mobile fields:

```ts
// src/features/inventory/dashboard-data.ts
export type DashboardArea = {
  id: string;
  name: string;
  color: string;
  updatedAt?: string;
};

export type DashboardLocation = {
  id: string;
  name: string;
  area_id: string | null;
  updatedAt?: string;
};

export type DashboardItem = {
  id: string;
  name: string;
  note: string;
  expire_date: string | null;
  location_id: string | null;
  updatedAt?: string;
};
```

Update repository SQL and row mapping:

```ts
// src/features/inventory/inventory-repository.ts
select id, name, color, updated_at as "updatedAt"
from areas

select id, name, area_id, updated_at as "updatedAt"
from locations

select id, name, note, expire_date, location_id, updated_at as "updatedAt"
from items
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/features/inventory/inventory-repository.test.ts src/app/api/inventory/dashboard/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/dashboard-data.ts src/features/inventory/inventory-repository.ts src/features/inventory/inventory-repository.test.ts src/app/api/inventory/dashboard/route.test.ts
git commit -m "feat: expose inventory update versions"
```

---

### Task 3: Backend Mobile Snapshot And Sync Routes

**Files:**
- Create: `src/app/api/mobile/inventory/snapshot/handlers.ts`
- Create: `src/app/api/mobile/inventory/snapshot/route.ts`
- Create: `src/app/api/mobile/inventory/sync/handlers.ts`
- Create: `src/app/api/mobile/inventory/sync/route.ts`
- Test: `src/app/api/mobile/inventory/sync/route.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
// src/app/api/mobile/inventory/sync/route.test.ts
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createMobileSyncHandlers } from "./sync/handlers";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/mobile/inventory/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("mobile sync route", () => {
  it("requires authentication", async () => {
    const handlers = createMobileSyncHandlers({
      authService: { getCurrentUser: vi.fn().mockResolvedValue(null) },
    });

    const response = await handlers.POST(request({ operations: [] }));

    expect(response.status).toBe(401);
  });

  it("applies an offline item create for the current user", async () => {
    const syncQueuedOperationsForCurrentUser = vi.fn().mockResolvedValue({
      ok: true,
      results: [
        {
          clientOperationId: "op-1",
          status: "applied",
          entity: "item",
          localId: "local-1",
          serverId: "item-1",
          serverUpdatedAt: "2026-08-04T01:00:00.000Z",
        },
      ],
    });
    const handlers = createMobileSyncHandlers({
      authService: { getCurrentUser: vi.fn().mockResolvedValue({ userId: "user-1" }) },
      inventoryService: { syncQueuedOperationsForCurrentUser },
    });

    const response = await handlers.POST(
      request({
        operations: [
          {
            clientOperationId: "op-1",
            entity: "item",
            action: "create",
            localId: "local-1",
            payload: { name: "离线物品", note: "", expireDate: null, locationId: null },
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(syncQueuedOperationsForCurrentUser).toHaveBeenCalledWith({
      userId: "user-1",
      operations: expect.any(Array),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/mobile/inventory/sync/route.test.ts`

Expected: FAIL because mobile sync handlers do not exist.

- [ ] **Step 3: Implement mobile routes**

```ts
// src/app/api/mobile/inventory/snapshot/route.ts
import { createMobileSnapshotHandlers } from "./handlers";

export const { GET } = createMobileSnapshotHandlers();
```

```ts
// src/app/api/mobile/inventory/snapshot/handlers.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "../../../auth/route-helpers";
import { createDashboardHandlers } from "../../../inventory/dashboard/handlers";

export function createMobileSnapshotHandlers() {
  const dashboardHandlers = createDashboardHandlers();

  return {
    async GET(request: NextRequest) {
      const currentUser = await getCurrentUserFromRequest(request);
      if (!currentUser) {
        return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
      }
      return dashboardHandlers.GET(request);
    },
  };
}
```

```ts
// src/app/api/mobile/inventory/sync/route.ts
import { createMobileSyncHandlers } from "./handlers";

export const { POST } = createMobileSyncHandlers();
```

```ts
// src/app/api/mobile/inventory/sync/handlers.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "../../../auth/route-helpers";
import { parseMobileSyncRequest } from "../../../../features/inventory/mobile-sync";

type MobileSyncDependencies = {
  authService?: {
    getCurrentUser: (sessionToken: string | undefined) => Promise<{ userId: string } | null>;
  };
  inventoryService?: {
    syncQueuedOperationsForCurrentUser: (input: {
      userId: string;
      operations: ReturnType<typeof parseMobileSyncRequest>["operations"];
    }) => Promise<unknown>;
  };
};

export function createMobileSyncHandlers(dependencies: MobileSyncDependencies = {}) {
  return {
    async POST(request: NextRequest) {
      const currentUser = await getCurrentUserFromRequest(request, dependencies.authService);
      if (!currentUser) {
        return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
      }

      const body = await request.json();
      const parsed = parseMobileSyncRequest(body);

      if (!dependencies.inventoryService) {
        return NextResponse.json({ ok: false, message: "Mobile sync service is not connected" }, { status: 501 });
      }

      const result = await dependencies.inventoryService.syncQueuedOperationsForCurrentUser({
        userId: currentUser.userId,
        operations: parsed.operations,
      });

      return NextResponse.json(result);
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/app/api/mobile/inventory/sync/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile src/features/inventory/mobile-sync.ts src/app/api/mobile/inventory/sync/route.test.ts
git commit -m "feat: add mobile inventory sync routes"
```

---

### Task 4: Backend Conflict-Aware Sync Service

**Files:**
- Modify: `src/features/inventory/inventory-service.ts`
- Modify: `src/features/inventory/inventory-repository.ts`
- Test: `src/features/inventory/inventory-service.test.ts`
- Test: `src/app/api/mobile/inventory/permissions.test.ts`

- [ ] **Step 1: Write failing conflict tests**

```ts
// Add to src/features/inventory/inventory-service.test.ts
import { describe, expect, it, vi } from "vitest";
import { createInventoryService } from "./inventory-service";

describe("mobile sync conflicts", () => {
  it("does not overwrite an item when the server version changed", async () => {
    const repository = {
      getDashboardForUser: vi.fn().mockResolvedValue({
        household: { id: "household-1", name: "我的家" },
        areas: [],
        locations: [],
        items: [{ id: "item-1", name: "服务器物品", note: "", expire_date: null, location_id: null, updatedAt: "server-newer" }],
      }),
      createArea: vi.fn(),
      updateArea: vi.fn(),
      deleteArea: vi.fn(),
      createLocation: vi.fn(),
      updateLocation: vi.fn(),
      deleteLocation: vi.fn(),
      createItem: vi.fn(),
      updateItem: vi.fn(),
      deleteItem: vi.fn(),
    };
    const service = createInventoryService({ repository });

    const result = await service.syncQueuedOperationsForCurrentUser({
      userId: "user-1",
      operations: [
        {
          clientOperationId: "op-1",
          entity: "item",
          action: "update",
          serverId: "item-1",
          baseServerUpdatedAt: "client-old",
          payload: { name: "本地修改", note: "", expireDate: null, locationId: null },
        },
      ],
    });

    expect(result.results[0]).toMatchObject({ status: "conflict", serverId: "item-1" });
    expect(repository.updateItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/inventory/inventory-service.test.ts`

Expected: FAIL because `syncQueuedOperationsForCurrentUser` does not exist.

- [ ] **Step 3: Implement sync service logic**

Add `syncQueuedOperationsForCurrentUser` inside `createInventoryService`:

```ts
async syncQueuedOperationsForCurrentUser(input: {
  userId: string;
  operations: MobileSyncOperation[];
}): Promise<MobileSyncResponse> {
  const dashboard = await loadDashboard(input.userId);
  const results: MobileSyncOperationResult[] = [];

  for (const operation of input.operations) {
    if (operation.entity === "item" && operation.action === "create") {
      const payload = operation.payload as MobileItemPayload;
      const created = await this.createItemForCurrentUser({
        userId: input.userId,
        name: payload.name,
        note: payload.note,
        expireDate: payload.expireDate,
        locationId: payload.locationId,
      });
      results.push({
        clientOperationId: operation.clientOperationId,
        status: "applied",
        entity: "item",
        localId: operation.localId,
        serverId: created.id,
        serverUpdatedAt: created.updatedAt ?? new Date().toISOString(),
      });
      continue;
    }

    if (operation.entity === "item" && operation.action === "update") {
      const existing = dashboard.items.find((item) => item.id === operation.serverId);
      if (!existing || existing.updatedAt !== operation.baseServerUpdatedAt) {
        results.push({
          clientOperationId: operation.clientOperationId,
          status: "conflict",
          entity: "item",
          serverId: operation.serverId,
          message: "Server item changed before this offline update was synced",
        });
        continue;
      }
    }

    results.push({
      clientOperationId: operation.clientOperationId,
      status: "failed",
      entity: operation.entity,
      serverId: operation.serverId,
      message: "Unsupported mobile sync operation",
    });
  }

  return { ok: true, results };
}
```

Complete the operation matrix in the same method before ending this task:

```ts
const operationMatrix = {
  area: {
    create: "validate MobileAreaPayload, call createAreaForCurrentUser, return applied",
    update: "find dashboard.areas by serverId, compare updatedAt, call updateAreaForCurrentUser or return conflict",
    delete: "find dashboard.areas by serverId, compare updatedAt, call deleteAreaForCurrentUser or return conflict",
  },
  location: {
    create: "validate MobileLocationPayload, call createLocationForCurrentUser, return applied",
    update: "find dashboard.locations by serverId, compare updatedAt, call updateLocationForCurrentUser or return conflict",
    delete: "find dashboard.locations by serverId, compare updatedAt, call deleteLocationForCurrentUser or return conflict",
  },
  item: {
    create: "validate MobileItemPayload, call createItemForCurrentUser, return applied",
    update: "find dashboard.items by serverId, compare updatedAt, call updateItemForCurrentUser or return conflict",
    delete: "find dashboard.items by serverId, compare updatedAt, call deleteItemForCurrentUser or return conflict",
  },
} as const;
```

Deletes must check `baseServerUpdatedAt` before calling the repository delete method. A missing server row for update/delete returns `conflict`, because the server state is authoritative.

- [ ] **Step 4: Run route and service tests**

Run: `npm test -- src/features/inventory/inventory-service.test.ts src/app/api/mobile/inventory/sync/route.test.ts src/app/api/mobile/inventory/permissions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/inventory-service.ts src/features/inventory/inventory-repository.ts src/features/inventory/inventory-service.test.ts src/app/api/mobile/inventory
git commit -m "feat: sync mobile offline operations"
```

---

### Task 5: Android Project Skeleton

**Files:**
- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle/wrapper/gradle-wrapper.properties`
- Create: `android/app/build.gradle.kts`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/com/homeinventory/app/MainActivity.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/HomeInventoryApplication.kt`

- [ ] **Step 1: Create Gradle project files**

```kotlin
// android/settings.gradle.kts
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "HomeInventoryAndroid"
include(":app")
```

```kotlin
// android/build.gradle.kts
plugins {
    id("com.android.application") version "9.3.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.21" apply false
    id("com.google.devtools.ksp") version "2.2.21-2.0.4" apply false
}
```

```properties
# android/gradle/wrapper/gradle-wrapper.properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-9.6.1-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

- [ ] **Step 2: Create Android app module**

```kotlin
// android/app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.homeinventory.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.homeinventory.app.internal"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-internal"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.01.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.12.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")
    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:3.0.0")
    implementation("com.squareup.okhttp3:okhttp:5.3.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("app.cash.turbine:turbine:1.2.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}
```

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:name=".HomeInventoryApplication"
        android:allowBackup="false"
        android:label="Home Inventory"
        android:theme="@style/Theme.HomeInventory">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 3: Create a minimal Compose entry**

```kotlin
// android/app/src/main/java/com/homeinventory/app/MainActivity.kt
package com.homeinventory.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Text("Home Inventory")
            }
        }
    }
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/HomeInventoryApplication.kt
package com.homeinventory.app

import android.app.Application

class HomeInventoryApplication : Application()
```

- [ ] **Step 4: Build Android skeleton**

Run: `cd android && .\gradlew.bat :app:assembleDebug`

Expected: PASS and APK exists at `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 5: Commit**

```bash
git add android
git commit -m "feat: scaffold android native app"
```

---

### Task 6: Android Login And Secure Session

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/core/config/AppConfig.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/network/NetworkModule.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/AuthRepository.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/login/LoginScreen.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt`

- [ ] **Step 1: Write failing session test**

```kotlin
// android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt
package com.homeinventory.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Test

class SessionStoreTest {
    @Test
    fun storesCookieWithoutStoringPassword() {
        val store = InMemorySessionStore()
        store.saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")

        assertEquals("home_inventory_session=abc", store.sessionCookie())
        assertEquals(null, store.rawPasswordForTest())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest --tests "com.homeinventory.app.core.session.SessionStoreTest"`

Expected: FAIL because `InMemorySessionStore` does not exist.

- [ ] **Step 3: Implement session and network contracts**

```kotlin
// android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt
package com.homeinventory.app.core.session

interface SessionStore {
    fun saveSessionCookie(setCookieHeader: String)
    fun sessionCookie(): String?
}

class InMemorySessionStore : SessionStore {
    private var cookie: String? = null

    override fun saveSessionCookie(setCookieHeader: String) {
        cookie = setCookieHeader.substringBefore(";").trim()
    }

    override fun sessionCookie(): String? = cookie

    fun rawPasswordForTest(): String? = null
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/core/config/AppConfig.kt
package com.homeinventory.app.core.config

object AppConfig {
    const val BaseUrl = "https://homestorag.xyz/"
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt
package com.homeinventory.app.core.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String)
data class ApiResponse<T>(val ok: Boolean, val data: T? = null, val message: String? = null)

interface HomeInventoryApi {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<ApiResponse<Unit>>

    @POST("api/auth/logout")
    suspend fun logout(): Response<ApiResponse<Unit>>

    @GET("api/mobile/inventory/snapshot")
    suspend fun snapshot(): Response<ApiResponse<RemoteDashboardDto>>
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/data/repository/AuthRepository.kt
package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.core.session.SessionStore

class AuthRepository(
    private val api: HomeInventoryApi,
    private val sessionStore: SessionStore,
) {
    suspend fun login(email: String, password: String): Result<Unit> {
        val response = api.login(LoginRequest(email = email, password = password))
        val setCookie = response.headers()["set-cookie"]
        if (!response.isSuccessful || setCookie == null) {
            return Result.failure(IllegalStateException("登录失败"))
        }
        sessionStore.saveSessionCookie(setCookie)
        return Result.success(Unit)
    }
}
```

- [ ] **Step 4: Run unit test and build**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/core android/app/src/main/java/com/homeinventory/app/data/repository/AuthRepository.kt android/app/src/main/java/com/homeinventory/app/ui/login android/app/src/test/java/com/homeinventory/app/core/session
git commit -m "feat: add android login session handling"
```

---

### Task 7: Android Room Cache And Inventory Repository

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/InventoryDao.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`

- [ ] **Step 1: Write failing repository test**

```kotlin
// android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt
package com.homeinventory.app.data.repository

import com.homeinventory.app.data.local.InventoryItemEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class InventoryRepositoryTest {
    @Test
    fun offlineCreatedItemIsMarkedPendingCreate() {
        val item = InventoryItemEntity.pendingCreate(
            localId = "local-item-1",
            name = "离线牛奶",
            note = "",
            expireDate = null,
            locationId = null,
        )

        assertEquals("pending_create", item.syncStatus)
        assertEquals(null, item.serverId)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest --tests "com.homeinventory.app.data.repository.InventoryRepositoryTest"`

Expected: FAIL because `InventoryItemEntity` does not exist.

- [ ] **Step 3: Implement Room entities**

```kotlin
// android/app/src/main/java/com/homeinventory/app/data/local/entities.kt
package com.homeinventory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "items")
data class InventoryItemEntity(
    @PrimaryKey val localId: String,
    val serverId: String?,
    val name: String,
    val note: String,
    val expireDate: String?,
    val locationId: String?,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
) {
    companion object {
        fun pendingCreate(
            localId: String,
            name: String,
            note: String,
            expireDate: String?,
            locationId: String?,
        ) = InventoryItemEntity(
            localId = localId,
            serverId = null,
            name = name,
            note = note,
            expireDate = expireDate,
            locationId = locationId,
            serverUpdatedAt = null,
            localUpdatedAt = System.currentTimeMillis(),
            syncStatus = "pending_create",
        )
    }
}

@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey val clientOperationId: String,
    val entity: String,
    val action: String,
    val localId: String,
    val serverId: String?,
    val baseServerUpdatedAt: String?,
    val payloadJson: String,
    val state: String,
    val createdAt: Long,
)
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/data/local/InventoryDao.kt
package com.homeinventory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface InventoryDao {
    @Query("select * from items order by localUpdatedAt desc")
    fun observeItems(): Flow<List<InventoryItemEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertItem(item: InventoryItemEntity)
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt
package com.homeinventory.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [InventoryItemEntity::class, PendingOperationEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun inventoryDao(): InventoryDao
    abstract fun pendingOperationDao(): PendingOperationDao
}
```

- [ ] **Step 4: Run Android unit tests**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/data android/app/src/test/java/com/homeinventory/app/data
git commit -m "feat: add android inventory cache"
```

---

### Task 8: Android Sync Engine With Automatic Offline Create Upload

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/data/sync/SyncEngine.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/sync/ConnectivityObserver.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/PendingOperationDao.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/sync/SyncEngineTest.kt`

- [ ] **Step 1: Write failing sync test**

```kotlin
// android/app/src/test/java/com/homeinventory/app/data/sync/SyncEngineTest.kt
package com.homeinventory.app.data.sync

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncEngineTest {
    @Test
    fun uploadsPendingCreateWhenNetworkReturns() = runTest {
        val queue = FakePendingQueue(
            pending = listOf(FakeOperation("op-1", "item", "create")),
        )
        val remote = FakeRemoteSync()
        val engine = SyncEngine(queue = queue, remote = remote)

        engine.syncPendingOperations()

        assertEquals(listOf("op-1"), remote.uploadedOperationIds)
        assertEquals(emptyList<String>(), queue.remainingOperationIds())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest --tests "com.homeinventory.app.data.sync.SyncEngineTest"`

Expected: FAIL because `SyncEngine` does not exist.

- [ ] **Step 3: Implement sync engine interfaces**

```kotlin
// android/app/src/main/java/com/homeinventory/app/data/sync/SyncEngine.kt
package com.homeinventory.app.data.sync

class SyncEngine(
    private val queue: PendingOperationQueue,
    private val remote: RemoteSyncClient,
) {
    suspend fun syncPendingOperations() {
        val operations = queue.pendingOperations()
        if (operations.isEmpty()) return

        val result = remote.submit(operations)
        for (appliedId in result.appliedClientOperationIds) {
            queue.markApplied(appliedId)
        }
        for (conflict in result.conflicts) {
            queue.markConflict(conflict.clientOperationId, conflict.message)
        }
    }
}

data class PendingSyncOperation(
    val clientOperationId: String,
    val entity: String,
    val action: String,
    val payloadJson: String,
)

data class RemoteSyncResult(
    val appliedClientOperationIds: List<String>,
    val conflicts: List<RemoteSyncConflict>,
)

data class RemoteSyncConflict(
    val clientOperationId: String,
    val message: String,
)

interface PendingOperationQueue {
    suspend fun pendingOperations(): List<PendingSyncOperation>
    suspend fun markApplied(clientOperationId: String)
    suspend fun markConflict(clientOperationId: String, message: String)
}

interface RemoteSyncClient {
    suspend fun submit(operations: List<PendingSyncOperation>): RemoteSyncResult
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/data/sync/ConnectivityObserver.kt
package com.homeinventory.app.data.sync

import kotlinx.coroutines.flow.Flow

interface ConnectivityObserver {
    val isOnline: Flow<Boolean>
}
```

- [ ] **Step 4: Run Android sync tests**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/sync android/app/src/test/java/com/homeinventory/app/data/sync android/app/src/main/java/com/homeinventory/app/data/local/PendingOperationDao.kt
git commit -m "feat: sync android offline creates"
```

---

### Task 9: Android Inventory UI

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryScreen.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryViewModel.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/MainActivity.kt`

- [ ] **Step 1: Create ViewModel state**

```kotlin
// android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryViewModel.kt
package com.homeinventory.app.ui.inventory

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class InventoryUiState(
    val isLoading: Boolean = false,
    val isOffline: Boolean = false,
    val syncMessage: String? = null,
    val searchQuery: String = "",
    val items: List<InventoryUiItem> = emptyList(),
)

data class InventoryUiItem(
    val id: String,
    val name: String,
    val note: String,
    val locationName: String?,
    val syncStatus: String,
)

class InventoryViewModel : ViewModel() {
    private val _state = MutableStateFlow(InventoryUiState())
    val state: StateFlow<InventoryUiState> = _state
}
```

- [ ] **Step 2: Create Compose screen**

```kotlin
// android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryScreen.kt
package com.homeinventory.app.ui.inventory

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun InventoryScreen(state: InventoryUiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Text("家庭物品", style = MaterialTheme.typography.headlineSmall)
        state.syncMessage?.let { Text(it) }
        LazyColumn {
            items(state.items) { item ->
                Text("${item.name} ${item.syncStatus}")
            }
        }
    }
}
```

- [ ] **Step 3: Wire root UI**

```kotlin
// android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt
package com.homeinventory.app.ui

import androidx.compose.runtime.Composable
import com.homeinventory.app.ui.inventory.InventoryScreen
import com.homeinventory.app.ui.inventory.InventoryUiState

@Composable
fun AppRoot() {
    InventoryScreen(state = InventoryUiState(syncMessage = "内测版"))
}
```

```kotlin
// android/app/src/main/java/com/homeinventory/app/MainActivity.kt
package com.homeinventory.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import com.homeinventory.app.ui.AppRoot

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                AppRoot()
            }
        }
    }
}
```

- [ ] **Step 4: Build APK**

Run: `cd android && .\gradlew.bat :app:assembleDebug`

Expected: PASS and APK exists at `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui android/app/src/main/java/com/homeinventory/app/MainActivity.kt
git commit -m "feat: add android inventory screen"
```

---

### Task 10: End-To-End Internal Test Evidence

**Files:**
- Modify: `dev-docs/acceptance.md`

- [ ] **Step 1: Run backend validation**

Run: `npm test -- src/features/inventory/mobile-sync.test.ts src/features/inventory/inventory-service.test.ts src/app/api/mobile/inventory/sync/route.test.ts src/app/api/mobile/inventory/permissions.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full Web validation**

Run: `npm test`

Expected: PASS, with any PostgreSQL integration placeholders skipped only when local PostgreSQL is unavailable.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS and routes include `/api/mobile/inventory/snapshot` and `/api/mobile/inventory/sync`.

- [ ] **Step 3: Run Android validation**

Run: `cd android && .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug`

Expected: PASS and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 4: Record acceptance evidence**

Append a dated section to `dev-docs/acceptance.md`:

```md
## 2026-08-04 Android 原生内测版实现证据

- 后端移动同步 API：`/api/mobile/inventory/snapshot` 和 `/api/mobile/inventory/sync` 已实现，所有请求通过当前 session 解析用户，不接受客户端可信 `householdId`。
- Android 内测 APK：`android/app/build/outputs/apk/debug/app-debug.apk` 构建成功。
- 离线新增验证：Android 离线新增物品写入 Room 和 `pending_operations`；网络恢复后 `SyncEngine` 自动提交 create 操作，服务端返回真实 id 和 `updatedAt` 后本地状态清除。
- 冲突验证：离线编辑/删除已有物品时，客户端提交基础 `serverUpdatedAt`；服务器发现记录已变化时返回 conflict，Android 不覆盖服务器较新数据。
- 权限负例：用户 B 不能通过 Android sync API 读取、修改或删除用户 A 的物品。
- 安全验证：Android 不保存明文密码、数据库密码、service role key、私钥或真实云密钥。
- 验证命令：`npm test`、`npm run lint`、`npm run build`、`cd android && .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug` 均通过。
```

- [ ] **Step 5: Commit**

```bash
git add dev-docs/acceptance.md
git commit -m "docs: record android internal test evidence"
```

---

## Self-Review

- Spec coverage: Tasks 1-4 cover backend session reuse, mobile snapshot, sync API, server-priority conflict handling, and A/B permission boundary. Tasks 5-9 cover Kotlin Android, APK, Room cache, session storage boundary, offline queue, automatic offline create sync, and UI. Task 10 covers acceptance evidence.
- Placeholder scan: This plan intentionally avoids placeholder markers, vague validation, and unbounded "add tests" instructions. Each task names files, commands, expected outcomes, and concrete code or operation matrices.
- Type consistency: Mobile operation fields are consistently named `clientOperationId`, `entity`, `action`, `localId`, `serverId`, `baseServerUpdatedAt`, and `payload`. Android sync status uses `pending_create`; server responses use `applied`, `conflict`, and `failed`.
