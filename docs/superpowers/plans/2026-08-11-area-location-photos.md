# 区域/位置照片实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web/PWA 与 Android 内测版上为每个区域、每个位置增加一张可查看、可替换、可删除的主照片，并在物品行提供位置/区域照片入口。

**Architecture:** `areas`、`locations` 各新增 `photo_key`，服务器通过新的 `PUT/GET/DELETE /api/inventory/{areas|locations}/[id]/photo` 接口直接上传、读取、删除清晰图；Android 用 `LocalPhotoStore` 缓存，Web 依赖浏览器缓存。物品行把位置名和区域名渲染为小按钮，长按区域/位置的编辑弹窗内提供照片操作。

**Tech Stack:** Next.js + TypeScript + PostgreSQL、Kotlin + Jetpack Compose + Room、Retrofit/OkHttp、Vitest。

---

## 文件结构

- `dev-docs/sql/area_location_photos_self_hosted.sql`：新增 `areas.photo_key`、`locations.photo_key` 与唯一索引。
- `src/server/photos/thumbnail.ts`：抽出通用 `resizeJpeg`，新增 `createMediumPhoto`。
- `src/server/photos/photo-repository.ts`：新增区域/位置照片 key 的读取、写入、清空方法。
- `src/server/photos/area-location-photo-service.ts`：上传/读取/删除/清理区域与位置照片。
- `src/app/api/inventory/photo-route-helpers.ts`：照片路由公共创建逻辑。
- `src/app/api/inventory/areas/[areaId]/photo/route.ts`、`handlers.ts`：区域照片路由。
- `src/app/api/inventory/locations/[locationId]/photo/route.ts`、`handlers.ts`：位置照片路由。
- `src/features/inventory/dashboard-data.ts`、`inventory-repository.ts`：Dashboard/快照透传 `photoKey`。
- `src/features/inventory/self-hosted-inventory-client.ts`：Web 照片上传/读取/删除客户端。
- `src/features/inventory/AppDashboard.tsx`：Web 物品行小按钮、无照片提示、区域/位置照片入口。
- `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`：`RemoteAreaDto`/`RemoteLocationDto` 增加 `photoKey`。
- `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`：新增照片接口。
- `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt`、`AppDatabase.kt`、`AreaDao.kt`、`LocationDao.kt`：Room 增加 `photoKey` 与迁移。
- `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`：照片上传/读取/删除与快照映射。
- `android/app/src/main/java/com/homeinventory/app/ui/dashboard/`：物品行小按钮、照片查看、长按弹窗照片区。
- 测试文件与 `dev-docs/acceptance.md`、`dev-docs/user-manual.md`：随任务同步。

---

## Task 1: SQL migration

**Files:**
- Create: `dev-docs/sql/area_location_photos_self_hosted.sql`
- Test: 本机 PostgreSQL `home_inventory_test`

- [ ] **Step 1: Create migration SQL**

```sql
alter table areas add column if not exists photo_key text;
alter table locations add column if not exists photo_key text;

create unique index if not exists areas_photo_key_unique
  on areas(photo_key) where photo_key is not null;

create unique index if not exists locations_photo_key_unique
  on locations(photo_key) where photo_key is not null;
```

- [ ] **Step 2: Run migration against local test DB**

Run: `psql $env:TEST_DATABASE_URL -f dev-docs/sql/area_location_photos_self_hosted.sql`
Expected: exits 0, no errors.

- [ ] **Step 3: Verify columns**

Run: `psql $env:TEST_DATABASE_URL -c "\d areas" -c "\d locations"`
Expected: both tables contain `photo_key text`；索引 `areas_photo_key_unique`、`locations_photo_key_unique` 存在。

- [ ] **Step 4: Commit**

```bash
git add dev-docs/sql/area_location_photos_self_hosted.sql
git commit -m "feat: add area and location photo columns"
```

---

## Task 2: 中等清晰图压缩

**Files:**
- Modify: `src/server/photos/thumbnail.ts`
- Test: `src/server/photos/thumbnail.test.ts`

- [ ] **Step 1: Add failing test for medium photo**

在 `thumbnail.test.ts` 顶部 import 改为：

```ts
import { createMediumPhoto, createThumbnail, isJpeg } from "./thumbnail";
```

在 `describe("thumbnail")` 内新增：

```ts
it("creates a 1280px medium photo", () => {
  const medium = createMediumPhoto(makeJpeg(2000, 1000));
  const pixels = decode(medium, { useTArray: true });

  expect(pixels.width).toBe(1280);
  expect(pixels.height).toBe(640);
  expect(isJpeg(medium)).toBe(true);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npx vitest run src/server/photos/thumbnail.test.ts`
Expected: FAIL with `createMediumPhoto is not a function`.

- [ ] **Step 3: Refactor thumbnail.ts**

将原 `createThumbnail` 的函数体抽成通用函数，并新增 `createMediumPhoto`：

```ts
export function resizeJpeg(
  source: Buffer,
  maxDimension = 1280,
  quality = 80,
): Buffer {
  const pixels = decode(source, {
    useTArray: true,
    maxMemoryUsageInMB: 256,
  });
  const { width, height, data } = pixels;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const resized = new Uint8Array(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale));
      const sourceIndex = (sy * width + sx) * 4;
      const targetIndex = (y * targetWidth + x) * 4;
      resized[targetIndex] = data[sourceIndex];
      resized[targetIndex + 1] = data[sourceIndex + 1];
      resized[targetIndex + 2] = data[sourceIndex + 2];
      resized[targetIndex + 3] = 255;
    }
  }

  const encoded = encode(
    { data: resized, width: targetWidth, height: targetHeight },
    quality,
  );
  return Buffer.from(encoded.data);
}

export function createThumbnail(
  source: Buffer,
  maxDimension = 200,
): Buffer {
  return resizeJpeg(source, maxDimension, 70);
}

export function createMediumPhoto(source: Buffer): Buffer {
  return resizeJpeg(source, 1280, 80);
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `npx vitest run src/server/photos/thumbnail.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/server/photos/thumbnail.ts src/server/photos/thumbnail.test.ts
git commit -m "feat: add medium photo resize for area and location photos"
```

---

## Task 3: PhotoRepository 区域/位置方法

**Files:**
- Modify: `src/server/photos/photo-repository.ts`

- [ ] **Step 1: Extend interface**

在 `PhotoRepository` 类型中新增：

```ts
getAreaPhotoKey: (input: {
  areaId: string;
  householdId: string;
}) => Promise<string | null>;
updateAreaPhotoKey: (input: {
  areaId: string;
  householdId: string;
  photoKey: string;
}) => Promise<{ photoKey: string; previousPhotoKey: string | null } | null>;
clearAreaPhotoKey: (input: {
  areaId: string;
  householdId: string;
}) => Promise<string | null>;
getLocationPhotoKey: (input: {
  locationId: string;
  householdId: string;
}) => Promise<string | null>;
updateLocationPhotoKey: (input: {
  locationId: string;
  householdId: string;
  photoKey: string;
}) => Promise<{ photoKey: string; previousPhotoKey: string | null } | null>;
clearLocationPhotoKey: (input: {
  locationId: string;
  householdId: string;
}) => Promise<string | null>;
listLocationPhotoKeysForArea: (input: {
  areaId: string;
  householdId: string;
}) => Promise<string[]>;
```

- [ ] **Step 2: Implement in Postgres repository**

在 `createPostgresPhotoRepository` 返回值中新增：

```ts
getAreaPhotoKey: async (input) => {
  const result = await client.query<{ photo_key: string | null }>(
    `
      select photo_key
      from areas
      where id = $1 and household_id = $2
    `,
    [input.areaId, input.householdId],
  );
  return result.rows[0]?.photo_key ?? null;
},
updateAreaPhotoKey: async (input) => {
  const existing = await client.query<{ photo_key: string | null }>(
    `
      select photo_key
      from areas
      where id = $1 and household_id = $2
    `,
    [input.areaId, input.householdId],
  );
  if (existing.rows.length === 0) {
    return null;
  }
  const previousPhotoKey = existing.rows[0]?.photo_key ?? null;
  await client.query(
    `
      update areas
      set photo_key = $3, updated_at = now()
      where id = $1 and household_id = $2
    `,
    [input.areaId, input.householdId, input.photoKey],
  );
  return { photoKey: input.photoKey, previousPhotoKey };
},
clearAreaPhotoKey: async (input) => {
  const existing = await client.query<{ photo_key: string | null }>(
    `
      select photo_key
      from areas
      where id = $1 and household_id = $2
    `,
    [input.areaId, input.householdId],
  );
  if (existing.rows.length === 0) {
    return null;
  }
  const previousPhotoKey = existing.rows[0]?.photo_key ?? null;
  await client.query(
    `
      update areas
      set photo_key = null, updated_at = now()
      where id = $1 and household_id = $2
    `,
    [input.areaId, input.householdId],
  );
  return previousPhotoKey;
},
getLocationPhotoKey: async (input) => {
  const result = await client.query<{ photo_key: string | null }>(
    `
      select photo_key
      from locations
      where id = $1 and household_id = $2
    `,
    [input.locationId, input.householdId],
  );
  return result.rows[0]?.photo_key ?? null;
},
updateLocationPhotoKey: async (input) => {
  const existing = await client.query<{ photo_key: string | null }>(
    `
      select photo_key
      from locations
      where id = $1 and household_id = $2
    `,
    [input.locationId, input.householdId],
  );
  if (existing.rows.length === 0) {
    return null;
  }
  const previousPhotoKey = existing.rows[0]?.photo_key ?? null;
  await client.query(
    `
      update locations
      set photo_key = $3, updated_at = now()
      where id = $1 and household_id = $2
    `,
    [input.locationId, input.householdId, input.photoKey],
  );
  return { photoKey: input.photoKey, previousPhotoKey };
},
clearLocationPhotoKey: async (input) => {
  const existing = await client.query<{ photo_key: string | null }>(
    `
      select photo_key
      from locations
      where id = $1 and household_id = $2
    `,
    [input.locationId, input.householdId],
  );
  if (existing.rows.length === 0) {
    return null;
  }
  const previousPhotoKey = existing.rows[0]?.photo_key ?? null;
  await client.query(
    `
      update locations
      set photo_key = null, updated_at = now()
      where id = $1 and household_id = $2
    `,
    [input.locationId, input.householdId],
  );
  return previousPhotoKey;
},
listLocationPhotoKeysForArea: async (input) => {
  const result = await client.query<{ photo_key: string }>(
    `
      select photo_key
      from locations
      where area_id = $1 and household_id = $2 and photo_key is not null
    `,
    [input.areaId, input.householdId],
  );
  return result.rows.map((row) => row.photo_key);
},
```

- [ ] **Step 3: Implement in not-connected fake**

在 `createNotConnectedPhotoRepository` 返回值中为上述新方法补 `async () => { throw new PhotoRepositoryNotConnectedError(); }`（`getAreaPhotoKey` 等返回 `Promise` 的方法同样抛错）。

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/server/photos/photo-repository.ts
git commit -m "feat: add area and location photo key repository methods"
```

---

## Task 4: 区域/位置照片服务

**Files:**
- Create: `src/server/photos/area-location-photo-service.ts`
- Test: `src/server/photos/area-location-photo-service.test.ts`

- [ ] **Step 1: Write failing service test**

```ts
import { describe, expect, it } from "vitest";

import { createAreaLocationPhotoService } from "./area-location-photo-service";

function jpegBuffer() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
}

describe("area location photo service", () => {
  it("uploads an area photo, saves file and updates photo key", async () => {
    const saved = new Map<string, Buffer>();
    const photoRepository = {
      updateAreaPhotoKey: async () => ({
        photoKey: "area_1.jpg",
        previousPhotoKey: null,
      }),
      clearAreaPhotoKey: async () => null,
      getAreaPhotoKey: async () => "area_1.jpg",
      listLocationPhotoKeysForArea: async () => [],
      updateLocationPhotoKey: async () => null,
      clearLocationPhotoKey: async () => null,
      getLocationPhotoKey: async () => null,
    };
    const service = createAreaLocationPhotoService({
      loadDashboardForUser: async () => ({
        householdId: "household-1",
        role: "member",
        areaIds: ["area-1"],
        locationIds: [],
      }),
      photoRepository,
      photoStore: {
        save: async (key, buffer) => saved.set(key, buffer),
        read: async (key) => saved.get(key) ?? null,
        delete: async () => undefined,
      },
    });

    const result = await service.uploadAreaPhoto({
      userId: "user-1",
      areaId: "area-1",
      jpegBuffer: jpegBuffer(),
    });

    expect(result.photoKey).toMatch(/^area_/);
    expect(saved.has(result.photoKey)).toBe(true);
  });

  it("rejects readonly members", async () => {
    const service = createAreaLocationPhotoService({
      loadDashboardForUser: async () => ({
        householdId: "household-1",
        role: "readonly",
        areaIds: ["area-1"],
        locationIds: [],
      }),
      photoRepository: {},
      photoStore: {},
    });

    await expect(
      service.uploadAreaPhoto({
        userId: "user-1",
        areaId: "area-1",
        jpegBuffer: jpegBuffer(),
      }),
    ).rejects.toThrow("readonly");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npx vitest run src/server/photos/area-location-photo-service.test.ts`
Expected: FAIL with module not found。

- [ ] **Step 3: Implement service**

```ts
import { randomUUID } from "node:crypto";

import type { PhotoRepository } from "./photo-repository";
import type { PhotoStore } from "./photo-store";
import { createMediumPhoto } from "./thumbnail";

export type AreaLocationPhotoContext = {
  householdId: string;
  role: string;
  areaIds: string[];
  locationIds: string[];
};

export type AreaLocationPhotoServiceDependencies = {
  loadDashboardForUser: (userId: string) => Promise<AreaLocationPhotoContext | null>;
  photoRepository: Partial<PhotoRepository>;
  photoStore: Partial<PhotoStore>;
};

export class AreaLocationPhotoPermissionError extends Error {
  constructor() {
    super("只读成员不能修改照片");
    this.name = "AreaLocationPhotoPermissionError";
  }
}

export class AreaLocationPhotoNotFoundError extends Error {
  constructor() {
    super("区域或位置不存在");
    this.name = "AreaLocationPhotoNotFoundError";
  }
}

export function createAreaLocationPhotoService(
  deps: AreaLocationPhotoServiceDependencies,
) {
  async function loadContext(userId: string) {
    const context = await deps.loadDashboardForUser(userId);
    if (!context) {
      throw new AreaLocationPhotoNotFoundError();
    }
    if (context.role === "readonly") {
      throw new AreaLocationPhotoPermissionError();
    }
    return context;
  }

  function assertArea(context: AreaLocationPhotoContext, areaId: string) {
    if (!context.areaIds.includes(areaId)) {
      throw new AreaLocationPhotoNotFoundError();
    }
  }

  function assertLocation(
    context: AreaLocationPhotoContext,
    locationId: string,
  ) {
    if (!context.locationIds.includes(locationId)) {
      throw new AreaLocationPhotoNotFoundError();
    }
  }

  return {
    async uploadAreaPhoto(input: {
      userId: string;
      areaId: string;
      jpegBuffer: Buffer;
    }) {
      const context = await loadContext(input.userId);
      assertArea(context, input.areaId);
      const photoKey = `area_${randomUUID()}.jpg`;
      const buffer = createMediumPhoto(input.jpegBuffer);
      await deps.photoStore.save?.(photoKey, buffer);
      const result = await deps.photoRepository.updateAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
        photoKey,
      });
      if (!result) {
        await deps.photoStore.delete?.(photoKey);
        throw new AreaLocationPhotoNotFoundError();
      }
      if (result.previousPhotoKey) {
        await deps.photoStore.delete?.(result.previousPhotoKey);
      }
      return { photoKey };
    },

    async getAreaPhoto(input: { userId: string; areaId: string }) {
      const context = await loadContext(input.userId);
      assertArea(context, input.areaId);
      const photoKey = await deps.photoRepository.getAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      if (!photoKey) return null;
      const buffer = await deps.photoStore.read?.(photoKey);
      return buffer ? { photoKey, buffer } : null;
    },

    async deleteAreaPhoto(input: { userId: string; areaId: string }) {
      const context = await loadContext(input.userId);
      assertArea(context, input.areaId);
      const photoKey = await deps.photoRepository.clearAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      if (photoKey) {
        await deps.photoStore.delete?.(photoKey);
      }
    },

    async uploadLocationPhoto(input: {
      userId: string;
      locationId: string;
      jpegBuffer: Buffer;
    }) {
      const context = await loadContext(input.userId);
      assertLocation(context, input.locationId);
      const photoKey = `location_${randomUUID()}.jpg`;
      const buffer = createMediumPhoto(input.jpegBuffer);
      await deps.photoStore.save?.(photoKey, buffer);
      const result = await deps.photoRepository.updateLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
        photoKey,
      });
      if (!result) {
        await deps.photoStore.delete?.(photoKey);
        throw new AreaLocationPhotoNotFoundError();
      }
      if (result.previousPhotoKey) {
        await deps.photoStore.delete?.(result.previousPhotoKey);
      }
      return { photoKey };
    },

    async getLocationPhoto(input: { userId: string; locationId: string }) {
      const context = await loadContext(input.userId);
      assertLocation(context, input.locationId);
      const photoKey = await deps.photoRepository.getLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
      });
      if (!photoKey) return null;
      const buffer = await deps.photoStore.read?.(photoKey);
      return buffer ? { photoKey, buffer } : null;
    },

    async deleteLocationPhoto(input: { userId: string; locationId: string }) {
      const context = await loadContext(input.userId);
      assertLocation(context, input.locationId);
      const photoKey = await deps.photoRepository.clearLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
      });
      if (photoKey) {
        await deps.photoStore.delete?.(photoKey);
      }
    },

    async listAreaPhotoKeys(input: { userId: string; areaId: string }) {
      const context = await loadContext(input.userId);
      assertArea(context, input.areaId);
      const areaKey = await deps.photoRepository.getAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      const locationKeys = await deps.photoRepository.listLocationPhotoKeysForArea?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      return [...(areaKey ? [areaKey] : []), ...(locationKeys ?? [])];
    },

    async listLocationPhotoKeys(input: { userId: string; locationId: string }) {
      const context = await loadContext(input.userId);
      assertLocation(context, input.locationId);
      const key = await deps.photoRepository.getLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
      });
      return key ? [key] : [];
    },

    async deletePhotoFiles(keys: string[]) {
      for (const key of keys) {
        await deps.photoStore.delete?.(key);
      }
    },
  };
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `npx vitest run src/server/photos/area-location-photo-service.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/server/photos/area-location-photo-service.ts src/server/photos/area-location-photo-service.test.ts
git commit -m "feat: add area and location photo service"
```

---

## Task 5: 照片 API 路由

**Files:**
- Create: `src/app/api/inventory/photo-route-helpers.ts`
- Create: `src/app/api/inventory/areas/[areaId]/photo/handlers.ts`
- Create: `src/app/api/inventory/areas/[areaId]/photo/route.ts`
- Create: `src/app/api/inventory/locations/[locationId]/photo/handlers.ts`
- Create: `src/app/api/inventory/locations/[locationId]/photo/route.ts`
- Test: `src/app/api/inventory/area-location-photo-routes.test.ts`

- [ ] **Step 1: Create route helper**

```ts
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../auth/route-helpers";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../server/db/postgres";
import { createPostgresPhotoRepository } from "../../../server/photos/photo-repository";
import { createLocalPhotoStore } from "../../../server/photos/photo-store";
import { isJpeg } from "../../../server/photos/thumbnail";
import {
  createAreaLocationPhotoService,
  AreaLocationPhotoPermissionError,
  AreaLocationPhotoNotFoundError,
} from "../../../server/photos/area-location-photo-service";
import {
  createPostgresInventoryRepository,
} from "../../../features/inventory/inventory-repository";
import { createRecognitionRateLimiter } from "../../../server/recognition/rate-limiter";
import type { createAuthService } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type PhotoRouteService = ReturnType<typeof createAreaLocationPhotoService>;
type PhotoRateLimiter = ReturnType<typeof createRecognitionRateLimiter>;

export type EntityPhotoDependencies = {
  authService?: CurrentUserAuthService;
  photoService?: PhotoRouteService;
  rateLimiter?: PhotoRateLimiter;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PHOTO_LIMIT_PER_HOUR = 20;

export function createRouteAreaLocationPhotoService(
  env: PostgresEnv = process.env,
  overrides: PostgresQueryClientFactoryOptions = {},
) {
  const queryClient = createPostgresQueryClientFromEnv(env, {
    createPool: overrides.createPool,
  });
  const inventoryRepository = createPostgresInventoryRepository(queryClient);
  const photoRepository = createPostgresPhotoRepository(queryClient);
  const photoStore = createLocalPhotoStore(
    env.PHOTO_STORAGE_DIR?.trim() ||
      path.join(process.cwd(), "data", "photos"),
  );

  return createAreaLocationPhotoService({
    loadDashboardForUser: async (userId) => {
      const dashboard = await inventoryRepository.getDashboardForUser(userId);
      if (!dashboard) return null;
      return {
        householdId: dashboard.household.id,
        role: dashboard.household.role ?? "owner",
        areaIds: dashboard.areas.map((area) => area.id),
        locationIds: dashboard.locations.map((location) => location.id),
      };
    },
    photoRepository,
    photoStore,
  });
}

export function createEntityPhotoHandlers(
  entity: "area" | "location",
  dependencies: EntityPhotoDependencies = {},
) {
  const idKey = entity === "area" ? "areaId" : "locationId";
  const entityLabel = entity === "area" ? "区域" : "位置";

  return {
    async GET(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );
        if (!currentUser) {
          return unauthorized();
        }
        const params = await context.params;
        const entityId = params[idKey];
        const service =
          dependencies.photoService ?? createRouteAreaLocationPhotoService();
        const photo =
          entity === "area"
            ? await service.getAreaPhoto({ userId: currentUser.userId, areaId: entityId })
            : await service.getLocationPhoto({ userId: currentUser.userId, locationId: entityId });
        if (!photo) {
          return NextResponse.json(
            { ok: false, message: `${entityLabel}照片不存在` },
            { status: 404 },
          );
        }
        return new NextResponse(new Uint8Array(photo.buffer), {
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "private, max-age=86400",
          },
        });
      } catch (error) {
        return photoErrorResponse(error);
      }
    },

    async PUT(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );
        if (!currentUser) {
          return unauthorized();
        }
        const limiter =
          dependencies.rateLimiter ??
          createRecognitionRateLimiter({
            limit: PHOTO_LIMIT_PER_HOUR,
            windowMs: 60 * 60 * 1000,
          });
        if (!limiter.tryConsume(currentUser.userId)) {
          return NextResponse.json(
            { ok: false, message: "照片操作太频繁，请稍后再试" },
            { status: 429 },
          );
        }
        const params = await context.params;
        const entityId = params[idKey];
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof Blob)) {
          return NextResponse.json(
            { ok: false, message: "请上传图片" },
            { status: 400 },
          );
        }
        if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { ok: false, message: "图片大小需在 10MB 以内" },
            { status: 400 },
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        if (!isJpeg(buffer)) {
          return NextResponse.json(
            { ok: false, message: "仅支持 JPEG 图片" },
            { status: 400 },
          );
        }
        const service =
          dependencies.photoService ?? createRouteAreaLocationPhotoService();
        const data =
          entity === "area"
            ? await service.uploadAreaPhoto({
                userId: currentUser.userId,
                areaId: entityId,
                jpegBuffer: buffer,
              })
            : await service.uploadLocationPhoto({
                userId: currentUser.userId,
                locationId: entityId,
                jpegBuffer: buffer,
              });
        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return photoErrorResponse(error);
      }
    },

    async DELETE(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );
        if (!currentUser) {
          return unauthorized();
        }
        const params = await context.params;
        const entityId = params[idKey];
        const service =
          dependencies.photoService ?? createRouteAreaLocationPhotoService();
        if (entity === "area") {
          await service.deleteAreaPhoto({ userId: currentUser.userId, areaId: entityId });
        } else {
          await service.deleteLocationPhoto({ userId: currentUser.userId, locationId: entityId });
        }
        return NextResponse.json({ ok: true, data: null });
      } catch (error) {
        return photoErrorResponse(error);
      }
    },
  };
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, message: "Authentication required" },
    { status: 401 },
  );
}

function photoErrorResponse(error: unknown) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: "DATABASE_URL is required for photos" },
      { status: 501 },
    );
  }
  if (error instanceof AreaLocationPhotoPermissionError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }
  if (error instanceof AreaLocationPhotoNotFoundError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 404 },
    );
  }
  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { ok: false, message: "Unknown photo error" },
    { status: 500 },
  );
}
```

- [ ] **Step 2: Create area route files**

`handlers.ts`：

```ts
import { createEntityPhotoHandlers } from "../../../photo-route-helpers";

export const createAreaPhotoHandlers = createEntityPhotoHandlers("area");
```

`route.ts`：

```ts
import { createAreaPhotoHandlers } from "./handlers";

const handlers = createAreaPhotoHandlers;

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
```

- [ ] **Step 3: Create location route files**

`handlers.ts`：

```ts
import { createEntityPhotoHandlers } from "../../../photo-route-helpers";

export const createLocationPhotoHandlers = createEntityPhotoHandlers("location");
```

`route.ts`：

```ts
import { createLocationPhotoHandlers } from "./handlers";

const handlers = createLocationPhotoHandlers;

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
```

- [ ] **Step 4: Add route tests**

在 `src/app/api/inventory/area-location-photo-routes.test.ts` 中注入 fake `authService`、`photoService`、`rateLimiter`，覆盖：

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createEntityPhotoHandlers } from "./photo-route-helpers";
import { AreaLocationPhotoPermissionError } from "../../../server/photos/area-location-photo-service";

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

describe("area/location photo routes", () => {
  const authService = {
    getCurrentUser: async () => ({ userId: "user-1" }),
  };

  it("rejects upload without a session", async () => {
    const handlers = createEntityPhotoHandlers("area", {
      authService: { getCurrentUser: async () => null },
    });
    const response = await handlers.PUT(
      request("http://localhost/api/inventory/areas/area-1/photo"),
      { params: Promise.resolve({ areaId: "area-1" }) },
    );
    expect(response.status).toBe(401);
  });

  it("uploads an area photo", async () => {
    const photoService = {
      uploadAreaPhoto: async () => ({ photoKey: "area_1.jpg" }),
    };
    const handlers = createEntityPhotoHandlers("area", {
      authService,
      photoService,
      rateLimiter: { tryConsume: () => true },
    });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), "photo.jpg");
    const response = await handlers.PUT(
      request("http://localhost/api/inventory/areas/area-1/photo", {
        method: "PUT",
        body: form,
      }),
      { params: Promise.resolve({ areaId: "area-1" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.photoKey).toBe("area_1.jpg");
  });

  it("rejects readonly upload with 403", async () => {
    const photoService = {
      uploadAreaPhoto: async () => {
        throw new AreaLocationPhotoPermissionError();
      },
    };
    const handlers = createEntityPhotoHandlers("area", {
      authService,
      photoService,
      rateLimiter: { tryConsume: () => true },
    });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), "photo.jpg");
    const response = await handlers.PUT(
      request("http://localhost/api/inventory/areas/area-1/photo", {
        method: "PUT",
        body: form,
      }),
      { params: Promise.resolve({ areaId: "area-1" }) },
    );
    expect(response.status).toBe(403);
  });
});
```

说明：测试顶部需要同时 import `AreaLocationPhotoPermissionError`。

- [ ] **Step 5: Run route tests**

Run: `npx vitest run src/app/api/inventory/area-location-photo-routes.test.ts src/server/photos/area-location-photo-service.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/app/api/inventory/photo-route-helpers.ts src/app/api/inventory/areas/[areaId]/photo src/app/api/inventory/locations/[locationId]/photo src/app/api/inventory/area-location-photo-routes.test.ts
git commit -m "feat: add area and location photo api routes"
```

---

## Task 6: 删除区域/位置时清理照片

**Files:**
- Modify: `src/app/api/inventory/areas/[areaId]/handlers.ts`
- Modify: `src/app/api/inventory/locations/[locationId]/handlers.ts`

- [ ] **Step 1: Modify area delete handler**

```ts
import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";
import {
  createRouteAreaLocationPhotoService,
} from "../../../photo-route-helpers";

type AreaRouteContext = {
  params: Promise<{ areaId: string }>;
};

export function createAreaItemHandlers(
  dependencies: InventoryMutationDependencies & {
    photoService?: ReturnType<typeof createRouteAreaLocationPhotoService>;
  } = {},
) {
  return {
    async PATCH(request: NextRequest, context: AreaRouteContext) {
      const { areaId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, body }) =>
          service.updateAreaForCurrentUser({
            userId,
            areaId,
            name: textField(body, "name"),
            color: optionalTextField(body, "color") ?? undefined,
          }),
        dependencies,
      );
    },

    async DELETE(request: NextRequest, context: AreaRouteContext) {
      const { areaId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId }) => {
          const photoService =
            dependencies.photoService ?? createRouteAreaLocationPhotoService();
          const keys = await photoService.listAreaPhotoKeys({
            userId,
            areaId,
          });
          await service.deleteAreaForCurrentUser({ userId, areaId });
          await photoService.deletePhotoFiles(keys);
          return null;
        },
        dependencies,
      );
    },
  };
}
```

- [ ] **Step 2: Modify location delete handler**

同理，在 `DELETE` 中先调用 `photoService.listLocationPhotoKeys({ userId, locationId })`，删除位置后再 `photoService.deletePhotoFiles(keys)`。

- [ ] **Step 3: Run existing permission tests**

Run: `npx vitest run src/app/api/inventory/inventory-routes-permissions.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventory/areas/[areaId]/handlers.ts src/app/api/inventory/locations/[locationId]/handlers.ts
git commit -m "feat: clean area and location photos on delete"
```

---

## Task 7: Dashboard/快照透传 photoKey

**Files:**
- Modify: `src/features/inventory/dashboard-data.ts`
- Modify: `src/features/inventory/inventory-repository.ts`

- [ ] **Step 1: Extend types**

在 `AreaRow`、`LocationRow` 中新增：

```ts
photo_key?: string | null;
```

在 `DashboardLocation` 中新增：

```ts
photoKey: string | null;
```

`buildDashboardSummary` 的 locations 映射中新增 `photoKey: location.photo_key ?? null`。

- [ ] **Step 2: Include photo_key in repository queries**

`getDashboardForUser` 的 areas 查询改为：

```sql
select id, name, color, photo_key, updated_at as "updatedAt"
```

locations 查询改为：

```sql
select id, name, area_id, photo_key, updated_at as "updatedAt"
```

`createArea`、`updateArea` 的 returning 和类型中增加 `photo_key`；`createLocation`、`updateLocation` 同理。

- [ ] **Step 3: Add/adjust dashboard test**

在 `src/features/inventory/dashboard-data.test.ts` 中新增断言：区域/位置带 `photoKey` 时，`DashboardSummary` 能透出该值。

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/inventory/dashboard-data.test.ts src/app/api/mobile/inventory/snapshot/route.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/dashboard-data.ts src/features/inventory/inventory-repository.ts src/features/inventory/dashboard-data.test.ts
git commit -m "feat: expose area and location photo keys in dashboard and snapshot"
```

---

## Task 8: Web 客户端与类型

**Files:**
- Modify: `src/features/inventory/self-hosted-inventory-client.ts`
- Test: `src/features/inventory/self-hosted-inventory-client.test.ts`

- [ ] **Step 1: Add client methods**

在返回对象中新增：

```ts
uploadAreaPhoto(areaId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<{ photoKey: string }>(
    `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
    { method: "PUT", body: formData },
  );
},

deleteAreaPhoto(areaId: string) {
  return request(
    `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
    jsonInit("DELETE"),
  );
},

async getAreaPhoto(areaId: string) {
  const response = await fetchImpl(
    `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
  );
  if (!response.ok) {
    throw new Error("加载区域照片失败");
  }
  return response.blob();
},

uploadLocationPhoto(locationId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<{ photoKey: string }>(
    `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
    { method: "PUT", body: formData },
  );
},

deleteLocationPhoto(locationId: string) {
  return request(
    `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
    jsonInit("DELETE"),
  );
},

async getLocationPhoto(locationId: string) {
  const response = await fetchImpl(
    `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
  );
  if (!response.ok) {
    throw new Error("加载位置照片失败");
  }
  return response.blob();
},
```

- [ ] **Step 2: Add client tests**

在 `self-hosted-inventory-client.test.ts` 中 mock `fetch`，验证 PUT 请求带 FormData、DELETE 请求方法和 GET 返回 Blob。

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/features/inventory/self-hosted-inventory-client.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/features/inventory/self-hosted-inventory-client.ts src/features/inventory/self-hosted-inventory-client.test.ts
git commit -m "feat: add web area and location photo client"
```

---

## Task 9: Web 物品行小按钮与无照片提示

**Files:**
- Modify: `src/features/inventory/AppDashboard.tsx`
- Test: `src/features/inventory/AppDashboard.test.ts`

- [ ] **Step 1: Add state for photo viewer and pending upload**

在组件顶部新增：

```ts
const [photoViewer, setPhotoViewer] = useState<{
  kind: "area" | "location";
  id: string;
  title: string;
} | null>(null);
const [photoSource, setPhotoSource] = useState<{
  kind: "area" | "location";
  id: string;
} | null>(null);
const photoInputRef = useRef<HTMLInputElement | null>(null);
```

- [ ] **Step 2: Render item row chips**

把移动端物品行里原来的 `item.locationName` 文本替换为：

```tsx
<span className="mt-0.5 flex flex-wrap items-center gap-1">
  {item.locationId ? (
    <button
      className="rounded-md border border-[var(--primary)] bg-[#eef5ef] px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary)]"
      onClick={(event) => {
        event.stopPropagation();
        setPhotoViewer({
          kind: "location",
          id: item.locationId,
          title: item.locationName,
        });
      }}
      type="button"
    >
      {item.locationName}
    </button>
  ) : null}
  {item.areaId ? (
    <button
      className="rounded-md border border-[var(--border)] bg-white px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]"
      onClick={(event) => {
        event.stopPropagation();
        setPhotoViewer({
          kind: "area",
          id: item.areaId,
          title: item.areaName,
        });
      }}
      type="button"
    >
      {item.areaName}
    </button>
  ) : null}
  {item.note ? (
    <span className="text-[11px] leading-3 text-[var(--muted-foreground)]">
      · {item.note}
    </span>
  ) : null}
</span>
```

- [ ] **Step 3: Add photo viewer and no-photo prompt**

在 JSX 末尾新增：

```tsx
{photoViewer ? (
  <PhotoViewerDialog
    title={photoViewer.title}
    loadUrl={
      photoViewer.kind === "area"
        ? `/api/inventory/areas/${photoViewer.id}/photo`
        : `/api/inventory/locations/${photoViewer.id}/photo`
    }
    onAdd={() => {
      setPhotoSource(photoViewer);
      setPhotoViewer(null);
      photoInputRef.current?.click();
    }}
    onDismiss={() => setPhotoViewer(null)}
  />
) : null}
{photoSource ? (
  <NoPhotoDialog
    kind={photoSource.kind === "area" ? "区域" : "位置"}
    onTake={() => {
      if (photoInputRef.current) {
        photoInputRef.current.setAttribute("capture", "environment");
        photoInputRef.current.click();
      }
    }}
    onPick={() => {
      if (photoInputRef.current) {
        photoInputRef.current.removeAttribute("capture");
        photoInputRef.current.click();
      }
    }}
    onDismiss={() => setPhotoSource(null)}
  />
) : null}
<input
  ref={photoInputRef}
  className="hidden"
  type="file"
  accept="image/jpeg"
  onChange={async (event) => {
    const file = event.target.files?.[0];
    const target = photoSource;
    setPhotoSource(null);
    event.target.value = "";
    if (!file || !target) return;
    if (target.kind === "area") {
      await inventory.uploadAreaPhoto(target.id, file);
    } else {
      await inventory.uploadLocationPhoto(target.id, file);
    }
    void loadDashboard();
  }}
/>
```

说明：`PhotoViewerDialog`、`NoPhotoDialog` 是本次新增的小组件，放在 `src/features/inventory/photo-dialogs.tsx`：

```tsx
"use client";

import { useEffect, useState } from "react";

export function PhotoViewerDialog({
  title,
  loadUrl,
  onAdd,
  onDismiss,
}: {
  title: string;
  loadUrl: string;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setMissing(false);
    fetch(loadUrl)
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setMissing(true);
          return;
        }
        const blob = await response.blob();
        if (!cancelled) {
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [loadUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <p className="mb-3 text-[15px] font-semibold text-white">{title}</p>
      {objectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="max-h-[70vh] max-w-full rounded-md object-contain"
          src={objectUrl}
        />
      ) : missing ? (
        <p className="text-sm text-white">照片不存在</p>
      ) : (
        <p className="text-sm text-white">加载中...</p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          onClick={onAdd}
          type="button"
        >
          拍照/选图
        </button>
        <button
          className="rounded-md bg-white px-4 py-2 text-sm text-black"
          onClick={onDismiss}
          type="button"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

export function NoPhotoDialog({
  kind,
  onTake,
  onPick,
  onDismiss,
}: {
  kind: string;
  onTake: () => void;
  onPick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <p className="text-[15px] font-semibold">
          还没有{kind}照片，拍照或从相册选择
        </p>
        <div className="mt-4 grid gap-2">
          <button
            className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
            onClick={onTake}
            type="button"
          >
            拍照
          </button>
          <button
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            onClick={onPick}
            type="button"
          >
            从相册选择
          </button>
          <button
            className="px-3 py-2 text-sm text-[var(--muted-foreground)]"
            onClick={onDismiss}
            type="button"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add AppDashboard test**

在 `AppDashboard.test.ts` 中新增：移动端物品行渲染 `data-testid="mobile-location-photo-chip"` 与 `data-testid="mobile-area-photo-chip"`。

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/features/inventory/AppDashboard.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/features/inventory/AppDashboard.tsx src/features/inventory/AppDashboard.test.ts src/features/inventory/photo-dialogs.tsx
git commit -m "feat: add web item row photo buttons and no photo prompt"
```

---

## Task 10: Web 区域/位置面板照片入口

**Files:**
- Modify: `src/features/inventory/AppDashboard.tsx`

- [ ] **Step 1: 在桌面区域/位置卡片加照片按钮**

在区域卡片名称旁新增：

```tsx
<button
  aria-label="查看区域照片"
  className="rounded-md border border-[var(--border)] px-1.5 text-[11px] text-[var(--primary)]"
  onClick={(event) => {
    event.stopPropagation();
    setPhotoViewer({ kind: "area", id: area.id, title: area.name });
  }}
  type="button"
>
  {area.photoKey ? "照片" : "拍照"}
</button>
```

位置卡片同样增加 `{ location.photoKey ? "照片" : "拍照" }`，点击设置 `photoViewer` 为 `location`。

- [ ] **Step 2: 在区域/位置编辑表单加照片操作**

在 `AreaForm`/`LocationForm` 提交按钮上方新增与 Task 9 相同的隐藏 `input[type=file]` 和上传逻辑；提交编辑时照片已独立保存，不进入 name/color 表单。

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: exit 0。

- [ ] **Step 4: Commit**

```bash
git add src/features/inventory/AppDashboard.tsx
git commit -m "feat: add web area and location panel photo entries"
```

---

## Task 11: Android 数据层与 API

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventorySnapshot.kt`

- [ ] **Step 1: Extend DTOs**

```kotlin
data class RemoteAreaDto(
    val id: String,
    val name: String,
    val color: String,
    @SerializedName("photo_key")
    val photoKey: String? = null,
    val updatedAt: String? = null,
)

data class RemoteLocationDto(
    val id: String,
    val name: String,
    @SerializedName("area_id")
    val areaId: String? = null,
    @SerializedName("photo_key")
    val photoKey: String? = null,
    val updatedAt: String? = null,
)

data class PhotoUploadResponseDto(
    val photoKey: String? = null,
)
```

- [ ] **Step 2: Add API methods**

```kotlin
@Multipart
@PUT("api/inventory/areas/{areaId}/photo")
suspend fun uploadAreaPhoto(
    @Path("areaId") areaId: String,
    @Part file: MultipartBody.Part,
): Response<ApiEnvelope<PhotoUploadResponseDto>>

@GET("api/inventory/areas/{areaId}/photo")
suspend fun areaPhoto(@Path("areaId") areaId: String): Response<ResponseBody>

@DELETE("api/inventory/areas/{areaId}/photo")
suspend fun deleteAreaPhoto(@Path("areaId") areaId: String): Response<ApiEnvelope<Unit>>

@Multipart
@PUT("api/inventory/locations/{locationId}/photo")
suspend fun uploadLocationPhoto(
    @Path("locationId") locationId: String,
    @Part file: MultipartBody.Part,
): Response<ApiEnvelope<PhotoUploadResponseDto>>

@GET("api/inventory/locations/{locationId}/photo")
suspend fun locationPhoto(@Path("locationId") locationId: String): Response<ResponseBody>

@DELETE("api/inventory/locations/{locationId}/photo")
suspend fun deleteLocationPhoto(@Path("locationId") locationId: String): Response<ApiEnvelope<Unit>>
```

不要忘记 import `retrofit2.http.PUT`。

- [ ] **Step 3: Extend Room entities and migration**

`AreaEntity`、`LocationEntity` 新增 `val photoKey: String? = null`；`AppDatabase` 版本改为 `5`，新增：

```kotlin
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE areas ADD COLUMN photoKey TEXT")
        db.execSQL("ALTER TABLE locations ADD COLUMN photoKey TEXT")
    }
}
```

并在 builder 中 `.addMigrations(MIGRATION_4_5)`。

- [ ] **Step 4: Extend snapshot models**

`InventorySnapshot.AreaView`、`LocationView` 新增 `val photoKey: String? = null`；`observeInventory` 映射时透传。

- [ ] **Step 5: Add repository photo methods**

```kotlin
suspend fun uploadAreaPhoto(areaId: String, jpegBytes: ByteArray): Result<String> {
    val body = jpegBytes.toRequestBody("image/jpeg".toMediaType())
    val part = MultipartBody.Part.createFormData("file", "photo.jpg", body)
    val response = try {
        api.uploadAreaPhoto(areaId, part)
    } catch (_: Exception) {
        return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
    }
    val envelope = response.body()
    if (!response.isSuccessful || envelope?.ok != true || envelope.data?.photoKey == null) {
        return Result.failure(
            IllegalStateException(
                parseErrorMessage(response.errorBody()) ?: envelope?.message ?: "上传区域照片失败",
            ),
        )
    }
    val photoKey = envelope.data.photoKey
    refreshSnapshot()
    return Result.success(photoKey)
}

suspend fun getAreaPhoto(areaId: String): Result<Bitmap> {
    val response = try {
        api.areaPhoto(areaId)
    } catch (_: Exception) {
        return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
    }
    val bytes = response.body()?.bytes()
    if (!response.isSuccessful || bytes == null) {
        return Result.failure(IllegalStateException("加载区域照片失败"))
    }
    return decodeBitmap(bytes)
}

suspend fun deleteAreaPhoto(areaId: String): Result<Unit> {
    val response = try {
        api.deleteAreaPhoto(areaId)
    } catch (_: Exception) {
        return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
    }
    val envelope = response.body()
    if (!response.isSuccessful || envelope?.ok != true) {
        return Result.failure(IllegalStateException("删除区域照片失败"))
    }
    refreshSnapshot()
    return Result.success(Unit)
}
```

位置照片使用相同模式的 `uploadLocationPhoto`、`getLocationPhoto`、`deleteLocationPhoto`。`decodeBitmap` 复用现有 `BitmapFactory.decodeByteArray` 逻辑。

新增私有函数：

```kotlin
private fun decodeBitmap(bytes: ByteArray): Result<Bitmap> {
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: return Result.failure(IllegalStateException("图片数据无效"))
    return Result.success(bitmap)
}
```

- [ ] **Step 6: Add Android unit tests**

在 `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt` 中新增 API stub 用例：上传成功返回 `photoKey`、网络失败返回中文提示、读取失败返回提示。

- [ ] **Step 7: Run Android tests**

Run: `gradle :app:testDebugUnitTest --no-daemon`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/data android/app/src/test/java/com/homeinventory/app/data
git commit -m "feat: add android area and location photo data layer"
```

---

## Task 12: Android 物品行小按钮与照片查看

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardScreen.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/ItemList.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt`

- [ ] **Step 1: Extend DashboardUiItem**

```kotlin
data class DashboardUiItem(
    val id: String,
    val name: String,
    val note: String,
    val expireDate: String?,
    val areaId: String?,
    val areaName: String? = null,
    val areaPhotoKey: String? = null,
    val locationId: String?,
    val locationName: String?,
    val locationPhotoKey: String? = null,
    val serverUpdatedAt: String?,
    val syncStatus: String,
    val expirationStatus: String,
    val photoKey: String? = null,
)
```

`state` 映射时从 snapshot 的 `areas`/`locations` 查找 `photoKey` 填入。

- [ ] **Step 2: Add screen callbacks**

`DashboardScreen` 新增参数：

```kotlin
onLocationPhotoClick: (DashboardUiItem) -> Unit,
onAreaPhotoClick: (DashboardUiItem) -> Unit,
```

并传给 `ItemList`。

- [ ] **Step 3: Render chips in ItemList**

把 `ItemRow` 中 subtitle 的 `listOfNotNull(item.locationName, ...)` 改为 `Row` 小按钮：

```kotlin
Row(
    horizontalArrangement = Arrangement.spacedBy(4.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    if (item.locationName != null) {
        Text(
            text = item.locationName,
            color = Primary,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(SurfaceMuted)
                .clickable { onLocationPhotoClick(item) }
                .padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
    if (item.areaName != null) {
        Text(
            text = item.areaName,
            color = MutedForeground,
            fontSize = 11.sp,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(SurfaceMuted)
                .clickable { onAreaPhotoClick(item) }
                .padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
    if (item.note.isNotBlank()) {
        Text(
            text = item.note,
            color = MutedForeground,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
```

- [ ] **Step 4: Wire DashboardHost**

在 `DashboardScreen` 调用处新增：

```kotlin
onLocationPhotoClick = { item ->
    if (item.locationPhotoKey != null) {
        previewLocationPhoto = EntityPhotoPreview(item.locationId!!, item.locationPhotoKey)
    } else {
        showLocationPhotoPrompt = true
        pendingPhotoEntity = PhotoEntityTarget.Location(item.locationId!!)
    }
},
onAreaPhotoClick = { item ->
    if (item.areaPhotoKey != null) {
        previewAreaPhoto = EntityPhotoPreview(item.areaId!!, item.areaPhotoKey)
    } else {
        showAreaPhotoPrompt = true
        pendingPhotoEntity = PhotoEntityTarget.Area(item.areaId!!)
    }
},
```

在 `DashboardHost` 顶部新增状态：

```kotlin
sealed interface PhotoEntityTarget {
    data class Area(val id: String) : PhotoEntityTarget
    data class Location(val id: String) : PhotoEntityTarget
}

data class EntityPhotoPreview(
    val entityId: String,
    val photoKey: String?,
)

var previewAreaPhoto by remember { mutableStateOf<EntityPhotoPreview?>(null) }
var previewLocationPhoto by remember { mutableStateOf<EntityPhotoPreview?>(null) }
var showAreaPhotoPrompt by remember { mutableStateOf(false) }
var showLocationPhotoPrompt by remember { mutableStateOf(false) }
var pendingPhotoEntity by remember { mutableStateOf<PhotoEntityTarget?>(null) }
```

新增 `PhotoPreviewDialog` 展示：

```kotlin
previewAreaPhoto?.let { preview ->
    PhotoPreviewDialog(
        title = "区域照片",
        loadBitmap = {
            preview.photoKey?.let { key ->
                LocalPhotoStore.read(context, key, 1600)?.let { Result.success(it) }
            } ?: repository.getAreaPhoto(preview.entityId)
        },
        onDismiss = { previewAreaPhoto = null },
    )
}
previewLocationPhoto?.let { preview ->
    PhotoPreviewDialog(
        title = "位置照片",
        loadBitmap = {
            preview.photoKey?.let { key ->
                LocalPhotoStore.read(context, key, 1600)?.let { Result.success(it) }
            } ?: repository.getLocationPhoto(preview.entityId)
        },
        onDismiss = { previewLocationPhoto = null },
    )
}
```

无照片提示用 `AlertDialog` 提供“拍照/相册”，选择后复用 Task 13 的相机/相册流程上传到 `pendingPhotoEntity`。

- [ ] **Step 5: Run Android tests**

Run: `gradle :app:testDebugUnitTest --no-daemon`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard
git commit -m "feat: add android item row photo chips and viewer"
```

---

## Task 13: Android 长按编辑弹窗照片区

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/AreaLocationPhotoSection.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/AreaFormDialog.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/LocationFormDialog.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt`

- [ ] **Step 1: Create reusable photo section**

```kotlin
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.homeinventory.app.data.media.ImageCompressor
import com.homeinventory.app.data.media.LocalPhotoStore
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.MutedForeground
import java.io.File
import kotlinx.coroutines.launch

@Composable
fun AreaLocationPhotoSection(
    photoKey: String?,
    entityLabel: String,
    onUpload: suspend (ByteArray) -> Result<String>,
    onView: () -> Unit,
    onDelete: suspend () -> Result<Unit>,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val cameraFile = remember {
        File(context.cacheDir, "camera").apply { mkdirs() }
        File(context.cacheDir, "camera/entity_${System.currentTimeMillis()}.jpg")
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success) {
            scope.launch {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    cameraFile,
                )
                val bytes = ImageCompressor.compressToJpeg(context, uri)
                    ?: cameraFile.readBytes()
                cameraFile.delete()
                uploading = true
                onUpload(bytes)
                    .onSuccess { key ->
                        LocalPhotoStore.save(context, key, bytes)
                        error = null
                    }
                    .onFailure { error = it.message ?: "上传失败" }
                uploading = false
            }
        }
    }
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = ImageCompressor.compressToJpeg(context, uri) ?: ByteArray(0)
                uploading = true
                onUpload(bytes)
                    .onSuccess { key ->
                        LocalPhotoStore.save(context, key, bytes)
                        error = null
                    }
                    .onFailure { error = it.message ?: "上传失败" }
                uploading = false
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("${entityLabel}照片", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    cameraFile.parentFile?.mkdirs()
                    cameraLauncher.launch(
                        FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            cameraFile,
                        ),
                    )
                },
                enabled = !uploading,
            ) { Text("拍照") }
            OutlinedButton(
                onClick = {
                    galleryLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                enabled = !uploading,
            ) { Text("从相册选择") }
            if (photoKey != null) {
                TextButton(onClick = onView) { Text("查看") }
                TextButton(
                    onClick = {
                        scope.launch {
                            onDelete().onSuccess {
                                LocalPhotoStore.delete(context, photoKey)
                            }
                        }
                    },
                ) { Text("删除", color = Danger) }
            }
        }
        if (uploading) Text("上传中...", color = MutedForeground, fontSize = 12.sp)
        error?.let { Text(it, color = Danger, fontSize = 12.sp) }
    }
}
```

- [ ] **Step 2: Extend AreaFormDialog**

`AreaFormDialog` 增加参数 `photoKey: String?`、`onUploadPhoto: suspend (ByteArray) -> Result<String>`、`onViewPhoto: () -> Unit`、`onDeletePhoto: suspend () -> Result<Unit>`，在颜色选择器下方渲染 `AreaLocationPhotoSection(photoKey, "区域", ...)`。

- [ ] **Step 3: Extend LocationFormDialog**

同样增加照片区参数并渲染 `AreaLocationPhotoSection(photoKey, "位置", ...)`。

- [ ] **Step 4: Wire DashboardHost**

`AreaFormDialog` 调用处传入：

```kotlin
photoKey = editingArea?.photoKey,
onUploadPhoto = { bytes -> repository.uploadAreaPhoto(editingArea!!.id, bytes) },
onViewPhoto = {
    previewAreaPhoto = EntityPhotoPreview(editingArea!!.id, editingArea!!.photoKey)
},
onDeletePhoto = { repository.deleteAreaPhoto(editingArea!!.id) },
```

`LocationFormDialog` 同理使用 `location.id` 与 `repository.uploadLocationPhoto` 等。

- [ ] **Step 5: Run Android tests**

Run: `gradle :app:testDebugUnitTest --no-daemon`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard
git commit -m "feat: add area and location photo actions to long press dialogs"
```

---

## Task 14: 缓存与离线行为验证

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/media/LocalPhotoStore.kt`

- [ ] **Step 1: 确认本地缓存键**

`LocalPhotoStore` 已按 `photoKey` 保存到 `filesDir/photos`；区域 key 形如 `area_<uuid>.jpg`，位置 key 形如 `location_<uuid>.jpg`，与物品 key 不会冲突。无需新增存储逻辑。

- [ ] **Step 2: 验证查看路径**

Android `PhotoPreviewDialog` 的 `loadBitmap` 应优先 `LocalPhotoStore.read(context, key, 1600)`，缺失再调 `repository.getAreaPhoto/getLocationPhoto`。Web 由浏览器缓存头 `private, max-age=86400` 覆盖。

- [ ] **Step 3: 验证断网提示**

`uploadAreaPhoto`、`deleteAreaPhoto` 等仓库方法已把网络异常映射为“无法连接服务器，请检查网络”；在 UI 中通过 `Toast` 或表单错误提示显示。

- [ ] **Step 4: Commit（如无代码改动则跳过）**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard
git commit -m "feat: verify area and location photo local cache fallback"
```

---

## Task 15: 全量验证与文档收口

**Files:**
- Modify: `dev-docs/user-manual.md`
- Modify: `dev-docs/acceptance.md`

- [ ] **Step 1: 服务端全量测试**

Run: `npx vitest run src/server/photos src/app/api/inventory`
Expected: PASS。

- [ ] **Step 2: Web 全量验证**

Run: `npx eslint src && npm run build`
Expected: exit 0。

- [ ] **Step 3: Android 全量验证**

Run: `gradle :app:testDebugUnitTest --no-daemon && gradle :app:assembleDebug --no-daemon`
Expected: PASS。

- [ ] **Step 4: 更新 user-manual**

在 `dev-docs/user-manual.md` 增加：长按区域/位置可拍照/相册、物品行 A1/区域按钮查看照片、无照片提示、readonly 只能查看。

- [ ] **Step 5: 更新 acceptance**

把 `2026-08-11 区域/位置照片验收标准（待实施）` 改为 `2026-08-11 区域/位置照片验收证据`，逐项记录实现与验证结果；未完成项保持“未验证”，不得包装为已完成。

- [ ] **Step 6: Commit**

```bash
git add dev-docs/user-manual.md dev-docs/acceptance.md
git commit -m "docs: record area and location photo implementation evidence"
```

---

## 自审记录

- 规格覆盖：单张主照片、替换、删除、长按入口、物品行小按钮、无照片提示、1280px 清晰图、Android/Web 缓存、readonly 只读、越权负例、文件清理均有对应任务。
- 无占位符：所有代码步骤都给出可执行代码或明确说明。
- 类型一致性：服务端 `photoKey`、Web `photoKey`、Android `photoKey` 命名一致；路由路径 `areas/[areaId]/photo` 与 `locations/[locationId]/photo` 全文一致。
