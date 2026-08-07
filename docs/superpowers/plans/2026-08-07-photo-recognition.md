# 拍照识别物品实施计划（Android 内测版先行）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Android 内测版实现「拍照识别物品」：拍物品正面照识别名称自动填表、可选拍有效期照片识别过期日；服务器只保存几 KB 缩略图并关联物品，权限与限频兜底。

**Architecture:** Android 本地把照片压缩到约 1280px 的 JPEG 后上传 `POST /api/recognition`；服务器校验登录后生成 200px 缩略图暂存（`pending_photos` + 本地磁盘），再调火山引擎豆包视觉识别名称/日期，返回结果与缩略图 id；用户保存物品时携带 `photoKey`，服务端校验归属后把 `items.photo_key` 指向该缩略图。图片读取走登录态接口（家庭成员可看），未关联缩略图 24 小时后清理，识别接口按账号限频。豆包 API key 只存服务器环境变量。

**Tech Stack:** Next.js 16 + TypeScript + PostgreSQL（自托管）、`jpeg-js`（纯 JS 缩略图）、火山方舟 OpenAI 兼容接口（Doubao Vision）、Vitest；Android Kotlin + Jetpack Compose + Retrofit/OkHttp + Room。

---

## 文件结构

服务器端新增：

- `dev-docs/sql/photo_recognition_self_hosted.sql` — `items.photo_key` + `pending_photos` migration
- `src/server/photos/photo-store.ts` — 本地磁盘照片存储抽象
- `src/server/photos/thumbnail.ts` — JPEG 解码/缩放/编码 + `isJpeg`
- `src/server/recognition/doubao-vision.ts` — 豆包视觉客户端
- `src/server/recognition/rate-limiter.ts` — 每账号滑动窗口限频
- `src/server/photos/photo-repository.ts` — PostgreSQL 照片表读写
- `src/server/recognition/recognition-service.ts` — 识别/关联/读取/清理编排 + 权限校验
- `src/app/api/recognition/handlers.ts` + `route.ts` — 识别接口
- `src/app/api/inventory/items/[itemId]/photo/handlers.ts` + `route.ts` — 缩略图读取接口

服务器端修改：

- `src/features/inventory/dashboard-data.ts` — `ItemRow.photo_key` / `DashboardItem.photoKey`
- `src/features/inventory/inventory-repository.ts` — 查询与返回 `photo_key`
- `src/app/api/inventory/items/handlers.ts` — 创建物品后关联 `photoKey`
- `src/app/api/inventory/items/[itemId]/handlers.ts` — 删除物品后清理照片文件
- `.env.example` — 新增 `DOUBAO_API_KEY` / `DOUBAO_VISION_MODEL` / `DOUBAO_VISION_BASE_URL` / `PHOTO_STORAGE_DIR`

Android 端修改：

- `android/app/src/main/AndroidManifest.xml` — FileProvider
- `android/app/src/main/res/xml/file_paths.xml` — 相机临时目录
- `android/app/build.gradle.kts` — 依赖 + 版本号 0.5.0 / code 6
- `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt` — 识别 + 图片接口
- `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt` — DTO 扩展
- `android/app/src/main/java/com/homeinventory/app/data/media/ImageCompressor.kt` — 本地压缩
- `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt` — 识别/取图/带 photoKey 建档
- `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt` + `AppDatabase.kt` — `photoKey` 列 + Room 迁移
- `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt` — 识别状态与方法
- `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/ItemFormDialog.kt` + `FormValues.kt` — 拍照/相册识别入口与回填
- `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardScreen.kt` / `DashboardHost.kt` / `components/ItemList.kt` — 缩略图展示与接线
- `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt` — ViewModel 依赖注入

测试新增/修改：

- `src/server/photos/photo-store.test.ts`、`thumbnail.test.ts`
- `src/server/recognition/doubao-vision.test.ts`、`rate-limiter.test.ts`、`recognition-service.test.ts`
- `src/app/api/recognition/route.test.ts`
- `src/app/api/inventory/items/photo-attach.test.ts`
- `android/.../data/repository/InventoryRepositoryTest.kt`、`data/repository/TestApiStub.kt`、`ui/dashboard/DashboardViewModelTest.kt`

---

## Task 1: 数据库 migration SQL

**Files:**
- Create: `dev-docs/sql/photo_recognition_self_hosted.sql`

- [ ] **Step 1: 创建 migration 文件**

```sql
-- Photo recognition schema for the self-hosted route (homestorag.xyz).
-- Truth source: dev-docs/database-design.md (2026-08-07 photo recognition design).
-- Permission enforcement happens in the Next.js service layer (server-side checks),
-- equivalent to the RLS policies documented in database-design.md.

alter table items add column if not exists photo_key text;

create unique index if not exists items_photo_key_unique
  on items(photo_key) where photo_key is not null;

create table if not exists pending_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  photo_key text not null,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  constraint pending_photos_photo_key_unique unique (photo_key),
  constraint pending_photos_status_check check (status in ('pending', 'attached'))
);

create index if not exists pending_photos_created_by_idx on pending_photos(created_by);
create index if not exists pending_photos_household_id_idx on pending_photos(household_id);
create index if not exists pending_photos_status_created_at_idx on pending_photos(status, created_at);

grant all privileges on pending_photos to home_inventory_app;
```

- [ ] **Step 2: 校验 SQL 语法（本机 PostgreSQL 可用时执行）**

Run（本地 PostgreSQL 运行中时）: `psql "postgres://postgres@localhost:5432/home_inventory_test" -f dev-docs/sql/photo_recognition_self_hosted.sql`
Expected: `ALTER TABLE` / `CREATE TABLE` 等输出，无报错。本机 PostgreSQL 未启动时跳过，标记「未验证」。

- [ ] **Step 3: 提交**

```bash
git add dev-docs/sql/photo_recognition_self_hosted.sql
git commit -m "feat: photo recognition database migration (photo_key + pending_photos)"
```

---

## Task 2: jpeg-js 依赖 + 本地照片存储

**Files:**
- Modify: `package.json`（安装依赖后自动更新）
- Create: `src/server/photos/photo-store.ts`
- Test: `src/server/photos/photo-store.test.ts`

- [ ] **Step 1: 安装依赖**

Run: `npm install jpeg-js` then `npm install -D @types/jpeg-js`
Expected: `package.json` 出现 `jpeg-js` 与 `@types/jpeg-js`。

- [ ] **Step 2: 写失败测试**

`src/server/photos/photo-store.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createLocalPhotoStore,
  InvalidPhotoKeyError,
} from "./photo-store";

describe("local photo store", () => {
  it("saves, reads and deletes a photo by key", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
    const store = createLocalPhotoStore(dir);
    const buffer = Buffer.from("fake-jpeg");

    await store.save("photo_abc.jpg", buffer);
    await expect(store.read("photo_abc.jpg")).resolves.toEqual(buffer);

    await store.delete("photo_abc.jpg");
    await expect(store.read("photo_abc.jpg")).resolves.toBeNull();
  });

  it("returns null for a missing photo", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
    const store = createLocalPhotoStore(dir);

    await expect(store.read("missing.jpg")).resolves.toBeNull();
  });

  it("rejects unsafe photo keys", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
    const store = createLocalPhotoStore(dir);

    await expect(store.save("../evil.jpg", Buffer.from("x"))).rejects.toBeInstanceOf(
      InvalidPhotoKeyError,
    );
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- src/server/photos/photo-store.test.ts`
Expected: FAIL，`Cannot find module './photo-store'`。

- [ ] **Step 4: 实现**

`src/server/photos/photo-store.ts`：

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

export type PhotoStore = {
  save: (photoKey: string, buffer: Buffer) => Promise<void>;
  read: (photoKey: string) => Promise<Buffer | null>;
  delete: (photoKey: string) => Promise<void>;
};

export class InvalidPhotoKeyError extends Error {
  constructor(photoKey: string) {
    super(`Invalid photo key: ${photoKey}`);
    this.name = "InvalidPhotoKeyError";
  }
}

const SAFE_PHOTO_KEY = /^[A-Za-z0-9._-]{1,200}$/;

export function createLocalPhotoStore(
  baseDir: string,
  fsImpl: typeof fs = fs,
): PhotoStore {
  function resolvePath(photoKey: string) {
    if (!SAFE_PHOTO_KEY.test(photoKey)) {
      throw new InvalidPhotoKeyError(photoKey);
    }

    const dir = path.join(baseDir, photoKey.slice(0, 2));
    return { dir, file: path.join(dir, photoKey) };
  }

  return {
    save: async (photoKey, buffer) => {
      const { dir, file } = resolvePath(photoKey);
      await fsImpl.mkdir(dir, { recursive: true });
      await fsImpl.writeFile(file, buffer);
    },
    read: async (photoKey) => {
      const { file } = resolvePath(photoKey);

      try {
        return await fsImpl.readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    delete: async (photoKey) => {
      const { file } = resolvePath(photoKey);

      try {
        await fsImpl.unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    },
  };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- src/server/photos/photo-store.test.ts`
Expected: PASS（3 个测试）。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json src/server/photos/photo-store.ts src/server/photos/photo-store.test.ts
git commit -m "feat: local photo store with safe keys"
```

---

## Task 3: 缩略图生成器

**Files:**
- Create: `src/server/photos/thumbnail.ts`
- Test: `src/server/photos/thumbnail.test.ts`

- [ ] **Step 1: 写失败测试**

`src/server/photos/thumbnail.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { decode, encode } from "jpeg-js";

import { createThumbnail, isJpeg } from "./thumbnail";

function makeJpeg(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200;
    data[i + 1] = 100;
    data[i + 2] = 50;
    data[i + 3] = 255;
  }
  const encoded = encode({ data, width, height }, 80);
  return Buffer.from(encoded.data);
}

describe("thumbnail", () => {
  it("detects jpeg magic bytes", () => {
    expect(isJpeg(makeJpeg(10, 10))).toBe(true);
    expect(isJpeg(Buffer.from("hello"))).toBe(false);
  });

  it("downscales a 400x300 jpeg to 200x150", () => {
    const thumbnail = createThumbnail(makeJpeg(400, 300));
    const pixels = decode(thumbnail, { useTArray: true });

    expect(pixels.width).toBe(200);
    expect(pixels.height).toBe(150);
    expect(isJpeg(thumbnail)).toBe(true);
  });

  it("keeps images smaller than the target dimension unchanged", () => {
    const thumbnail = createThumbnail(makeJpeg(100, 80));
    const pixels = decode(thumbnail, { useTArray: true });

    expect(pixels.width).toBe(100);
    expect(pixels.height).toBe(80);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/server/photos/thumbnail.test.ts`
Expected: FAIL，`Cannot find module './thumbnail'`。

- [ ] **Step 3: 实现**

`src/server/photos/thumbnail.ts`：

```ts
import { decode, encode } from "jpeg-js";

export function isJpeg(buffer: Buffer) {
  return (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

export function createThumbnail(
  source: Buffer,
  maxDimension = 200,
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
    70,
  );
  return Buffer.from(encoded.data);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/server/photos/thumbnail.test.ts`
Expected: PASS（3 个测试）。

- [ ] **Step 5: 提交**

```bash
git add src/server/photos/thumbnail.ts src/server/photos/thumbnail.test.ts
git commit -m "feat: jpeg thumbnail generator"
```

---

## Task 4: 豆包视觉客户端

**Files:**
- Create: `src/server/recognition/doubao-vision.ts`
- Test: `src/server/recognition/doubao-vision.test.ts`

- [ ] **Step 1: 写失败测试**

`src/server/recognition/doubao-vision.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { createDoubaoVisionClient } from "./doubao-vision";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("doubao vision client", () => {
  it("returns the recognized name", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "牛奶" } }],
      });
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: true,
      value: "牛奶",
    });
  });

  it("normalizes an expiry date from a model answer", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "有效期至2026年8月30日" } }],
      });
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.recognizeExpireDate(Buffer.from("jpeg")),
    ).resolves.toEqual({ ok: true, value: "2026-08-30" });
  });

  it("reports not_recognized when the model cannot answer", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "无法识别" } }],
      });
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: false,
      reason: "not_recognized",
    });
  });

  it("reports api_key_missing without an api key", async () => {
    const client = createDoubaoVisionClient({ model: "model" });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: false,
      reason: "api_key_missing",
    });
  });

  it("reports upstream_error when the api fails", async () => {
    const fetchImpl = async () => jsonResponse(500, {});
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: false,
      reason: "upstream_error",
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/server/recognition/doubao-vision.test.ts`
Expected: FAIL，`Cannot find module './doubao-vision'`。

- [ ] **Step 3: 实现**

`src/server/recognition/doubao-vision.ts`：

```ts
export type DoubaoRecognitionResult =
  | { ok: true; value: string }
  | { ok: false; reason: "api_key_missing" | "upstream_error" | "not_recognized" };

export type DoubaoVisionClient = {
  recognizeName: (jpegBuffer: Buffer) => Promise<DoubaoRecognitionResult>;
  recognizeExpireDate: (jpegBuffer: Buffer) => Promise<DoubaoRecognitionResult>;
};

export class DoubaoApiKeyMissingError extends Error {
  constructor() {
    super("DOUBAO_API_KEY is required for photo recognition");
    this.name = "DoubaoApiKeyMissingError";
  }
}

type DoubaoVisionDependencies = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const NAME_PROMPT =
  "你是一个家庭物品识别助手。请识别图片中最主要的物品，只返回物品的中文名称，不要解释，不要加标点。如果无法识别，只返回“无法识别”。";

const EXPIRE_PROMPT =
  "请识别图片中印刷的有效期（或保质期、过期日期、生产日期）。只返回 YYYY-MM-DD 或 YYYY-MM 格式的日期；如果图片里没有日期，只返回“无”。不要解释。";

export function createDoubaoVisionClient(
  deps: DoubaoVisionDependencies = {},
): DoubaoVisionClient {
  const apiKey =
    deps.apiKey ?? process.env.DOUBAO_API_KEY?.trim() ?? "";
  const model =
    deps.model ??
    process.env.DOUBAO_VISION_MODEL?.trim() ??
    "doubao-1.5-vision-lite-250315";
  const baseUrl =
    deps.baseUrl ??
    process.env.DOUBAO_VISION_BASE_URL?.trim() ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  async function complete(
    prompt: string,
    jpegBuffer: Buffer,
  ): Promise<DoubaoRecognitionResult> {
    if (!apiKey) {
      return { ok: false, reason: "api_key_missing" };
    }

    const base64 = jpegBuffer.toString("base64");
    let response: Response;

    try {
      response = await fetchImpl(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
              ],
            },
          ],
        }),
      });
    } catch {
      return { ok: false, reason: "upstream_error" };
    }

    if (!response.ok) {
      return { ok: false, reason: "upstream_error" };
    }

    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const content = body?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, reason: "not_recognized" };
    }

    return { ok: true, value: content.trim() };
  }

  return {
    recognizeName: async (jpegBuffer) => {
      const result = await complete(NAME_PROMPT, jpegBuffer);

      if (!result.ok) {
        return result;
      }

      const cleaned = result.value
        .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
        .trim();

      if (!cleaned || cleaned.includes("无法识别") || cleaned.length > 120) {
        return { ok: false, reason: "not_recognized" };
      }

      return { ok: true, value: cleaned };
    },
    recognizeExpireDate: async (jpegBuffer) => {
      const result = await complete(EXPIRE_PROMPT, jpegBuffer);

      if (!result.ok) {
        return result;
      }

      if (result.value.includes("无")) {
        return { ok: false, reason: "not_recognized" };
      }

      const match = result.value.match(
        /(20\d{2})[-/年.](\d{1,2})(?:[-/月.](\d{1,2}))?/,
      );

      if (!match) {
        return { ok: false, reason: "not_recognized" };
      }

      const month = match[2].padStart(2, "0");
      const day = match[3] ? match[3].padStart(2, "0") : "01";
      return { ok: true, value: `${match[1]}-${month}-${day}` };
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/server/recognition/doubao-vision.test.ts`
Expected: PASS（5 个测试）。

- [ ] **Step 5: 提交**

```bash
git add src/server/recognition/doubao-vision.ts src/server/recognition/doubao-vision.test.ts
git commit -m "feat: doubao vision recognition client"
```

---

## Task 5: 识别接口限频器

**Files:**
- Create: `src/server/recognition/rate-limiter.ts`
- Test: `src/server/recognition/rate-limiter.test.ts`

- [ ] **Step 1: 写失败测试**

`src/server/recognition/rate-limiter.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { createRecognitionRateLimiter } from "./rate-limiter";

describe("recognition rate limiter", () => {
  it("allows up to the limit inside the window", () => {
    let now = 0;
    const limiter = createRecognitionRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
  });

  it("tracks users independently", () => {
    let now = 0;
    const limiter = createRecognitionRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-2")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
  });

  it("releases the slot after the window expires", () => {
    let now = 0;
    const limiter = createRecognitionRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
    now = 60_001;
    expect(limiter.tryConsume("user-1")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/server/recognition/rate-limiter.test.ts`
Expected: FAIL，`Cannot find module './rate-limiter'`。

- [ ] **Step 3: 实现**

`src/server/recognition/rate-limiter.ts`：

```ts
export type RecognitionRateLimiter = {
  tryConsume: (key: string) => boolean;
};

export function createRecognitionRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RecognitionRateLimiter {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;

  return {
    tryConsume(key) {
      const current = now();
      const timestamps = (hits.get(key) ?? []).filter(
        (timestamp) => current - timestamp < options.windowMs,
      );

      if (timestamps.length >= options.limit) {
        hits.set(key, timestamps);
        return false;
      }

      timestamps.push(current);
      hits.set(key, timestamps);
      return true;
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/server/recognition/rate-limiter.test.ts`
Expected: PASS（3 个测试）。

- [ ] **Step 5: 提交**

```bash
git add src/server/recognition/rate-limiter.ts src/server/recognition/rate-limiter.test.ts
git commit -m "feat: recognition rate limiter"
```

---

## Task 6: 照片 PostgreSQL 仓库

**Files:**
- Create: `src/server/photos/photo-repository.ts`

- [ ] **Step 1: 实现（本任务为纯数据层，行为由 Task 7 服务层测试覆盖）**

`src/server/photos/photo-repository.ts`：

```ts
import type { PostgresQueryClient } from "../auth/postgres-auth-repository";

export type PhotoRepository = {
  createPendingPhoto: (input: {
    householdId: string;
    createdBy: string;
    photoKey: string;
  }) => Promise<void>;
  attachPhotoToItem: (input: {
    itemId: string;
    householdId: string;
    photoKey: string;
    userId: string;
  }) => Promise<boolean>;
  getItemPhotoKey: (input: {
    itemId: string;
    householdId: string;
  }) => Promise<string | null>;
  listExpiredPendingPhotos: (olderThanIso: string) => Promise<string[]>;
  deletePendingPhotos: (photoKeys: string[]) => Promise<void>;
};

export class PhotoRepositoryNotConnectedError extends Error {
  constructor() {
    super("PostgreSQL photo repository is not connected yet");
    this.name = "PhotoRepositoryNotConnectedError";
  }
}

export function createPostgresPhotoRepository(
  client?: PostgresQueryClient,
): PhotoRepository {
  if (!client) {
    return createNotConnectedPhotoRepository();
  }

  return {
    createPendingPhoto: async (input) => {
      await client.query(
        `
          insert into pending_photos (household_id, created_by, photo_key)
          values ($1, $2, $3)
        `,
        [input.householdId, input.createdBy, input.photoKey],
      );
    },
    attachPhotoToItem: async (input) => {
      const pending = await client.query<{ id: string }>(
        `
          select id
          from pending_photos
          where photo_key = $1
            and created_by = $2
            and status = 'pending'
            and created_at > now() - interval '24 hours'
        `,
        [input.photoKey, input.userId],
      );

      if (pending.rows.length === 0) {
        return false;
      }

      const attached = await client.query<{ id: string }>(
        `
          update items
          set photo_key = $3, updated_at = now()
          where id = $1
            and household_id = $2
            and (photo_key is null or photo_key = $3)
          returning id
        `,
        [input.itemId, input.householdId, input.photoKey],
      );

      if (attached.rows.length === 0) {
        return false;
      }

      await client.query(
        `
          update pending_photos
          set status = 'attached'
          where photo_key = $1
        `,
        [input.photoKey],
      );

      return true;
    },
    getItemPhotoKey: async (input) => {
      const result = await client.query<{ photo_key: string | null }>(
        `
          select photo_key
          from items
          where id = $1
            and household_id = $2
        `,
        [input.itemId, input.householdId],
      );

      return result.rows[0]?.photo_key ?? null;
    },
    listExpiredPendingPhotos: async (olderThanIso) => {
      const result = await client.query<{ photo_key: string }>(
        `
          select photo_key
          from pending_photos
          where status = 'pending'
            and created_at < $1::timestamptz
        `,
        [olderThanIso],
      );

      return result.rows.map((row) => row.photo_key);
    },
    deletePendingPhotos: async (photoKeys) => {
      if (photoKeys.length === 0) {
        return;
      }

      await client.query(
        `
          delete from pending_photos
          where photo_key = any($1::text[])
        `,
        [photoKeys],
      );
    },
  };
}

function createNotConnectedPhotoRepository(): PhotoRepository {
  const fail = async () => {
    throw new PhotoRepositoryNotConnectedError();
  };

  return {
    createPendingPhoto: fail,
    attachPhotoToItem: async () => {
      throw new PhotoRepositoryNotConnectedError();
    },
    getItemPhotoKey: async () => {
      throw new PhotoRepositoryNotConnectedError();
    },
    listExpiredPendingPhotos: async () => {
      throw new PhotoRepositoryNotConnectedError();
    },
    deletePendingPhotos: fail,
  };
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/server/photos/photo-repository.ts
git commit -m "feat: postgres photo repository"
```

---

## Task 7: 识别服务（编排 + 权限）

**Files:**
- Create: `src/server/recognition/recognition-service.ts`
- Test: `src/server/recognition/recognition-service.test.ts`

- [ ] **Step 1: 写失败测试**

`src/server/recognition/recognition-service.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { createRecognitionService } from "./recognition-service";
import { DoubaoApiKeyMissingError } from "./doubao-vision";
import type { PhotoRepository } from "../photos/photo-repository";
import type { PhotoStore } from "../photos/photo-store";
import type { DoubaoVisionClient } from "./doubao-vision";

function createFakes(overrides: Partial<{
  householdId: string | null;
  saved: Map<string, Buffer>;
  pending: string[];
  itemPhotos: Map<string, string>;
}> = {}) {
  const saved = overrides.saved ?? new Map<string, Buffer>();
  const pending = overrides.pending ?? [];
  const itemPhotos = overrides.itemPhotos ?? new Map<string, string>();

  const photoRepository: PhotoRepository = {
    createPendingPhoto: async (input) => {
      pending.push(input.photoKey);
    },
    attachPhotoToItem: async (input) => {
      if (!pending.includes(input.photoKey) || input.userId !== "user-1") {
        return false;
      }
      itemPhotos.set(input.itemId, input.photoKey);
      return true;
    },
    getItemPhotoKey: async (input) => itemPhotos.get(input.itemId) ?? null,
    listExpiredPendingPhotos: async () => [...pending],
    deletePendingPhotos: async (keys) => {
      keys.forEach((key) => {
        const index = pending.indexOf(key);
        if (index >= 0) {
          pending.splice(index, 1);
        }
      });
    },
  };
  const photoStore: PhotoStore = {
    save: async (key, buffer) => {
      saved.set(key, buffer);
    },
    read: async (key) => saved.get(key) ?? null,
    delete: async (key) => {
      saved.delete(key);
    },
  };
  const doubaoVision: DoubaoVisionClient = {
    recognizeName: async () => ({ ok: true, value: "牛奶" }),
    recognizeExpireDate: async () => ({ ok: true, value: "2026-08-30" }),
  };

  return {
    saved,
    pending,
    itemPhotos,
    photoRepository,
    photoStore,
    doubaoVision,
    householdId: overrides.householdId ?? "household-1",
  };
}

describe("recognition service", () => {
  it("recognizes a name, stores a pending thumbnail and returns its key", async () => {
    const fakes = createFakes({ householdId: "household-1" });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => fakes.householdId,
      ...fakes,
    });

    const result = await service.recognizeForCurrentUser({
      userId: "user-1",
      mode: "name",
      jpegBuffer: Buffer.from("jpeg"),
    });

    expect(result.mode).toBe("name");
    expect(result.recognized).toBe(true);
    expect(result.name).toBe("牛奶");
    expect(result.thumbnailId).toMatch(/^photo_/);
    expect(fakes.pending).toHaveLength(1);
    expect(fakes.saved.has(result.thumbnailId as string)).toBe(true);
  });

  it("recognizes an expiry date without storing a thumbnail", async () => {
    const fakes = createFakes({ householdId: "household-1" });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => fakes.householdId,
      ...fakes,
    });

    const result = await service.recognizeForCurrentUser({
      userId: "user-1",
      mode: "expiry",
      jpegBuffer: Buffer.from("jpeg"),
    });

    expect(result.mode).toBe("expiry");
    expect(result.expireDate).toBe("2026-08-30");
    expect(fakes.pending).toHaveLength(0);
  });

  it("rejects recognition when the user has no household", async () => {
    const fakes = createFakes({ householdId: null });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => null,
      ...fakes,
    });

    await expect(
      service.recognizeForCurrentUser({
        userId: "user-1",
        mode: "name",
        jpegBuffer: Buffer.from("jpeg"),
      }),
    ).rejects.toThrow("No household found for current user");
  });

  it("only lets the pending photo creator attach it to their own item", async () => {
    const fakes = createFakes({ householdId: "household-1" });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => fakes.householdId,
      ...fakes,
    });

    const result = await service.recognizeForCurrentUser({
      userId: "user-1",
      mode: "name",
      jpegBuffer: Buffer.from("jpeg"),
    });

    const attachedByOwner = await service.attachPhotoToItem({
      userId: "user-1",
      itemId: "item-1",
      photoKey: result.thumbnailId as string,
    });
    const attachedByOther = await service.attachPhotoToItem({
      userId: "user-2",
      itemId: "item-1",
      photoKey: result.thumbnailId as string,
    });

    expect(attachedByOwner).toBe(true);
    expect(attachedByOther).toBe(false);
  });

  it("cleanup removes expired pending photo files and rows", async () => {
    const fakes = createFakes({ householdId: "household-1" });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => fakes.householdId,
      ...fakes,
    });

    await service.recognizeForCurrentUser({
      userId: "user-1",
      mode: "name",
      jpegBuffer: Buffer.from("jpeg"),
    });
    const cleared = await service.cleanupExpiredPendingPhotos();

    expect(cleared).toBe(1);
    expect(fakes.pending).toHaveLength(0);
    expect(fakes.saved.size).toBe(0);
  });

  it("throws DoubaoApiKeyMissingError when the api key is missing", async () => {
    const fakes = createFakes({ householdId: "household-1" });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => fakes.householdId,
      photoRepository: fakes.photoRepository,
      photoStore: fakes.photoStore,
      doubaoVision: {
        recognizeName: async () => ({ ok: false, reason: "api_key_missing" }),
        recognizeExpireDate: async () => ({
          ok: false,
          reason: "api_key_missing",
        }),
      },
    });

    await expect(
      service.recognizeForCurrentUser({
        userId: "user-1",
        mode: "name",
        jpegBuffer: Buffer.from("jpeg"),
      }),
    ).rejects.toBeInstanceOf(DoubaoApiKeyMissingError);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/server/recognition/recognition-service.test.ts`
Expected: FAIL，`Cannot find module './recognition-service'`。

- [ ] **Step 3: 实现**

`src/server/recognition/recognition-service.ts`：

```ts
import { randomUUID } from "node:crypto";

import { createThumbnail } from "../photos/thumbnail";
import type { PhotoRepository } from "../photos/photo-repository";
import type { PhotoStore } from "../photos/photo-store";
import {
  DoubaoApiKeyMissingError,
  type DoubaoVisionClient,
} from "./doubao-vision";

export type RecognitionOutcome = {
  mode: "name" | "expiry";
  recognized: boolean;
  name?: string | null;
  expireDate?: string | null;
  thumbnailId?: string | null;
};

export type RecognitionServiceDependencies = {
  loadHouseholdIdForUser: (userId: string) => Promise<string | null>;
  photoRepository: PhotoRepository;
  photoStore: PhotoStore;
  doubaoVision: DoubaoVisionClient;
};

export function createRecognitionService(
  deps: RecognitionServiceDependencies,
) {
  async function loadHouseholdId(userId: string) {
    const householdId = await deps.loadHouseholdIdForUser(userId);

    if (!householdId) {
      throw new Error("No household found for current user");
    }

    return householdId;
  }

  return {
    async recognizeForCurrentUser(input: {
      userId: string;
      mode: "name" | "expiry";
      jpegBuffer: Buffer;
    }): Promise<RecognitionOutcome> {
      const householdId = await loadHouseholdId(input.userId);

      if (input.mode === "expiry") {
        const result = await deps.doubaoVision.recognizeExpireDate(
          input.jpegBuffer,
        );

        if (result.reason === "api_key_missing") {
          throw new DoubaoApiKeyMissingError();
        }

        return {
          mode: "expiry",
          recognized: result.ok,
          expireDate: result.ok ? result.value : null,
        };
      }

      const photoKey = `photo_${randomUUID()}.jpg`;
      const thumbnail = createThumbnail(input.jpegBuffer);
      await deps.photoStore.save(photoKey, thumbnail);
      await deps.photoRepository.createPendingPhoto({
        householdId,
        createdBy: input.userId,
        photoKey,
      });

      const result = await deps.doubaoVision.recognizeName(input.jpegBuffer);

      if (result.reason === "api_key_missing") {
        throw new DoubaoApiKeyMissingError();
      }

      return {
        mode: "name",
        recognized: result.ok,
        name: result.ok ? result.value : null,
        thumbnailId: photoKey,
      };
    },

    async attachPhotoToItem(input: {
      userId: string;
      itemId: string;
      photoKey: string;
    }) {
      const householdId = await loadHouseholdId(input.userId);
      return deps.photoRepository.attachPhotoToItem({
        itemId: input.itemId,
        householdId,
        photoKey: input.photoKey,
        userId: input.userId,
      });
    },

    async getItemPhoto(input: { userId: string; itemId: string }) {
      const householdId = await loadHouseholdId(input.userId);
      const photoKey = await deps.photoRepository.getItemPhotoKey({
        itemId: input.itemId,
        householdId,
      });

      if (!photoKey) {
        return null;
      }

      const buffer = await deps.photoStore.read(photoKey);
      return buffer ? { photoKey, buffer } : null;
    },

    async deleteItemPhoto(input: { userId: string; itemId: string }) {
      const householdId = await loadHouseholdId(input.userId);
      const photoKey = await deps.photoRepository.getItemPhotoKey({
        itemId: input.itemId,
        householdId,
      });

      if (photoKey) {
        await deps.photoStore.delete(photoKey);
      }
    },

    async cleanupExpiredPendingPhotos() {
      const olderThan = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const keys = await deps.photoRepository.listExpiredPendingPhotos(
        olderThan,
      );

      for (const key of keys) {
        await deps.photoStore.delete(key);
      }
      await deps.photoRepository.deletePendingPhotos(keys);
      return keys.length;
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/server/recognition/recognition-service.test.ts`
Expected: PASS（6 个测试）。

- [ ] **Step 5: 提交**

```bash
git add src/server/recognition/recognition-service.ts src/server/recognition/recognition-service.test.ts
git commit -m "feat: recognition service with permission boundaries and cleanup"
```

---

## Task 8: 识别 API 路由

**Files:**
- Create: `src/app/api/recognition/handlers.ts`、`src/app/api/recognition/route.ts`
- Modify: `.env.example`
- Test: `src/app/api/recognition/route.test.ts`

- [ ] **Step 1: 写失败测试**

`src/app/api/recognition/route.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createRecognitionHandlers } from "./handlers";
import { createRecognitionRateLimiter } from "../../../server/recognition/rate-limiter";

function jpegBlob() {
  return new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], {
    type: "image/jpeg",
  });
}

function requestWithFormData(body: FormData, mode?: string) {
  const url = mode
    ? `http://localhost/api/recognition?mode=${mode}`
    : "http://localhost/api/recognition";
  return new NextRequest(url, {
    method: "POST",
    headers: { cookie: "home_inventory_session=session-token" },
    body,
  });
}

describe("recognition route", () => {
  it("returns 401 without a session", async () => {
    const handlers = createRecognitionHandlers();
    const response = await handlers.POST(
      new NextRequest("http://localhost/api/recognition", { method: "POST" }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(response.status).toBe(401);
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    let calls = 0;
    const handlers = createRecognitionHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      rateLimiter: createRecognitionRateLimiter({
        limit: 1,
        windowMs: 60_000,
      }),
      recognitionService: {
        recognizeForCurrentUser: async () => {
          calls += 1;
          return {
            mode: "name",
            recognized: true,
            name: "牛奶",
            thumbnailId: "photo_1.jpg",
          };
        },
        attachPhotoToItem: async () => true,
        getItemPhoto: async () => null,
        deleteItemPhoto: async () => undefined,
        cleanupExpiredPendingPhotos: async () => 0,
      },
    });

    const form = new FormData();
    form.append("file", jpegBlob(), "photo.jpg");
    await handlers.POST(requestWithFormData(form));
    const response = await handlers.POST(requestWithFormData(form));

    expect(calls).toBe(1);
    expect(response.status).toBe(429);
  });

  it("returns a recognized name with a thumbnail id", async () => {
    const handlers = createRecognitionHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      recognitionService: {
        recognizeForCurrentUser: async ({ mode }) => ({
          mode,
          recognized: true,
          name: "牛奶",
          thumbnailId: "photo_1.jpg",
        }),
        attachPhotoToItem: async () => true,
        getItemPhoto: async () => null,
        deleteItemPhoto: async () => undefined,
        cleanupExpiredPendingPhotos: async () => 0,
      },
    });

    const form = new FormData();
    form.append("file", jpegBlob(), "photo.jpg");
    const response = await handlers.POST(requestWithFormData(form));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        mode: "name",
        recognized: true,
        name: "牛奶",
        thumbnailId: "photo_1.jpg",
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns 400 for a non-jpeg upload", async () => {
    const handlers = createRecognitionHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      recognitionService: {
        recognizeForCurrentUser: async () => ({
          mode: "name",
          recognized: false,
          name: null,
        }),
        attachPhotoToItem: async () => true,
        getItemPhoto: async () => null,
        deleteItemPhoto: async () => undefined,
        cleanupExpiredPendingPhotos: async () => 0,
      },
    });

    const form = new FormData();
    form.append("file", new Blob([Buffer.from("hello")]), "photo.jpg");
    const response = await handlers.POST(requestWithFormData(form));

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/app/api/recognition/route.test.ts`
Expected: FAIL，`Cannot find module './handlers'`。

- [ ] **Step 3: 实现 handlers**

`src/app/api/recognition/handlers.ts`：

```ts
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../auth/route-helpers";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../server/db/postgres";
import { createPostgresPhotoRepository } from "../../server/photos/photo-repository";
import { createLocalPhotoStore } from "../../server/photos/photo-store";
import { isJpeg } from "../../server/photos/thumbnail";
import {
  createDoubaoVisionClient,
  DoubaoApiKeyMissingError,
} from "../../server/recognition/doubao-vision";
import { createRecognitionRateLimiter } from "../../server/recognition/rate-limiter";
import { createRecognitionService } from "../../server/recognition/recognition-service";
import { createPostgresInventoryRepository } from "../../features/inventory/inventory-repository";
import type { createAuthService } from "../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type RecognitionRouteService = ReturnType<typeof createRecognitionService>;

export type RecognitionDependencies = {
  authService?: CurrentUserAuthService;
  recognitionService?: RecognitionRouteService;
  rateLimiter?: ReturnType<typeof createRecognitionRateLimiter>;
};

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 10;

export function createRouteRecognitionService(
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
  const doubaoVision = createDoubaoVisionClient({
    apiKey: env.DOUBAO_API_KEY,
    model: env.DOUBAO_VISION_MODEL,
  });

  return createRecognitionService({
    loadHouseholdIdForUser: async (userId) => {
      const dashboard = await inventoryRepository.getDashboardForUser(userId);
      return dashboard?.household.id ?? null;
    },
    photoRepository,
    photoStore,
    doubaoVision,
  });
}

export function createRecognitionHandlers(
  dependencies: RecognitionDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const limiter =
          dependencies.rateLimiter ??
          createRecognitionRateLimiter({
            limit: RATE_LIMIT_PER_MINUTE,
            windowMs: 60_000,
          });

        if (!limiter.tryConsume(currentUser.userId)) {
          return NextResponse.json(
            { ok: false, message: "识别太频繁，请稍后再试" },
            { status: 429 },
          );
        }

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
            { ok: false, message: "图片大小需在 4MB 以内" },
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

        const mode =
          request.nextUrl.searchParams.get("mode") === "expiry"
            ? "expiry"
            : "name";
        const service =
          dependencies.recognitionService ?? createRouteRecognitionService();
        const data = await service.recognizeForCurrentUser({
          userId: currentUser.userId,
          mode,
          jpegBuffer: buffer,
        });

        await service.cleanupExpiredPendingPhotos().catch(() => undefined);

        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return createRecognitionErrorResponse(error);
      }
    },
  };
}

function createRecognitionErrorResponse(error: unknown) {
  if (error instanceof DoubaoApiKeyMissingError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 501 },
    );
  }

  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: "DATABASE_URL is required for photo recognition" },
      { status: 501 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown recognition error" },
    { status: 500 },
  );
}
```

`src/app/api/recognition/route.ts`：

```ts
import { createRecognitionHandlers } from "./handlers";

export const { POST } = createRecognitionHandlers();
```

- [ ] **Step 4: 更新 `.env.example`**

在 `.env.example` 末尾追加：

```text
# 拍照识别（火山引擎豆包视觉）
DOUBAO_API_KEY=
DOUBAO_VISION_MODEL=doubao-1.5-vision-lite-250315
DOUBAO_VISION_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
PHOTO_STORAGE_DIR=./data/photos
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- src/app/api/recognition/route.test.ts`
Expected: PASS（4 个测试）。

- [ ] **Step 6: 提交**

```bash
git add src/app/api/recognition .env.example
git commit -m "feat: recognition api route with auth, rate limit and upload validation"
```

---

## Task 9: 物品 photoKey 关联、图片读取、删除清理、dashboard 透传

**Files:**
- Modify: `src/features/inventory/dashboard-data.ts`、`src/features/inventory/inventory-repository.ts`
- Modify: `src/app/api/inventory/items/handlers.ts`、`src/app/api/inventory/items/[itemId]/handlers.ts`
- Create: `src/app/api/inventory/items/[itemId]/photo/handlers.ts`、`route.ts`
- Test: `src/app/api/inventory/items/photo-attach.test.ts`

- [ ] **Step 1: 修改 dashboard 数据模型**

`src/features/inventory/dashboard-data.ts`：

```diff
 export type ItemRow = {
   id: string;
   name: string;
   note: string;
   expire_date: string | null;
   location_id: string | null;
+  photo_key?: string | null;
   updatedAt?: string;
 };
```

```diff
 export type DashboardItem = {
     ...
     expirationStatus: ExpirationStatus;
+    photoKey?: string | null;
 };
```

`buildDashboardSummary` 的 items map 中加入：

```ts
        photoKey: item.photo_key ?? null,
```

- [ ] **Step 2: 修改 PostgreSQL 仓库返回 `photo_key`**

`src/features/inventory/inventory-repository.ts`：

```diff
        client.query<PostgresItemRow>(
          `
-            select id, name, note, expire_date, location_id, updated_at as "updatedAt"
+            select id, name, note, expire_date, location_id, photo_key, updated_at as "updatedAt"
            from items
            where household_id = $1
            order by created_at desc
          `,
```

`createItem` 的 `returning` 加入 `photo_key`：

```diff
-          returning id, name, note, expire_date, location_id, updated_at as "updatedAt"
+          returning id, name, note, expire_date, location_id, photo_key, updated_at as "updatedAt"
```

`updateItem` / `updateItemIfVersionMatches` 的 `returning` 同样加入 `photo_key`，并把查询返回类型 `photo_key: string | null` 加入两个 `result` 泛型对象。

- [ ] **Step 3: 修改物品创建路由（关联缩略图）**

`src/app/api/inventory/items/handlers.ts` 整体替换为：

```ts
import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../route-helpers";
import {
  createRouteRecognitionService,
  type RecognitionDependencies,
} from "../../recognition/handlers";

export type ItemHandlersDependencies = InventoryMutationDependencies &
  RecognitionDependencies;

export function createItemHandlers(
  dependencies: ItemHandlersDependencies = {},
) {
  return {
    POST(request: NextRequest) {
      return runInventoryMutation(
        request,
        async ({ service, userId, body }) => {
          const item = await service.createItemForCurrentUser({
            userId,
            name: textField(body, "name"),
            note: textField(body, "note"),
            expireDate: optionalTextField(body, "expireDate"),
            locationId: optionalTextField(body, "locationId"),
          });
          const photoKey = optionalTextField(body, "photoKey");

          if (photoKey) {
            const photoService =
              dependencies.recognitionService ??
              createRouteRecognitionService();
            const attached = await photoService.attachPhotoToItem({
              userId,
              itemId: item.id,
              photoKey,
            });

            if (attached) {
              return { ...item, photo_key: photoKey };
            }
          }

          return item;
        },
        dependencies,
      );
    },
  };
}
```

- [ ] **Step 4: 修改物品删除路由（清理照片文件）**

`src/app/api/inventory/items/[itemId]/handlers.ts` 的 `DELETE` 改为：

```ts
    async DELETE(request: NextRequest, context: ItemRouteContext) {
      const { itemId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId }) => {
          const photoService =
            dependencies.recognitionService ??
            createRouteRecognitionService();
          await photoService.deleteItemPhoto({ userId, itemId });
          await service.deleteItemForCurrentUser({ userId, itemId });
          return null;
        },
        dependencies,
      );
    },
```

并更新 imports 与类型：

```ts
import {
  createRouteRecognitionService,
  type RecognitionDependencies,
} from "../../../recognition/handlers";

type ItemItemHandlersDependencies = InventoryMutationDependencies &
  RecognitionDependencies;
```

`createItemItemHandlers(dependencies: ItemItemHandlersDependencies = {})`。

- [ ] **Step 5: 创建图片读取路由**

`src/app/api/inventory/items/[itemId]/photo/handlers.ts`：

```ts
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../../../auth/route-helpers";
import {
  createRouteRecognitionService,
  type RecognitionDependencies,
} from "../../../../recognition/handlers";

type PhotoRouteContext = {
  params: Promise<{ itemId: string }>;
};

export function createItemPhotoHandlers(
  dependencies: RecognitionDependencies = {},
) {
  return {
    async GET(request: NextRequest, context: PhotoRouteContext) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const { itemId } = await context.params;
        const service =
          dependencies.recognitionService ??
          createRouteRecognitionService();
        const photo = await service.getItemPhoto({
          userId: currentUser.userId,
          itemId,
        });

        if (!photo) {
          return NextResponse.json(
            { ok: false, message: "Item photo not found" },
            { status: 404 },
          );
        }

        return new NextResponse(new Uint8Array(photo.buffer), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=3600",
          },
        });
      } catch (error) {
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
    },
  };
}
```

`src/app/api/inventory/items/[itemId]/photo/route.ts`：

```ts
import { createItemPhotoHandlers } from "./handlers";

export const { GET } = createItemPhotoHandlers();
```

- [ ] **Step 6: 写失败测试**

`src/app/api/inventory/items/photo-attach.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createItemHandlers } from "./handlers";
import { createItemPhotoHandlers } from "./[itemId]/photo/handlers";

describe("item photo attach", () => {
  it("attaches a valid photoKey after creating an item", async () => {
    let attached: { userId: string; itemId: string; photoKey: string } | null =
      null;
    const handlers = createItemHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      inventoryService: {
        createItemForCurrentUser: async () => ({
          id: "item-1",
          name: "牛奶",
          note: "",
          expire_date: null,
          location_id: null,
        }),
      } as never,
      recognitionService: {
        attachPhotoToItem: async (input) => {
          attached = input;
          return true;
        },
      } as never,
    });

    const response = await handlers.POST(
      new NextRequest("http://localhost/api/inventory/items", {
        method: "POST",
        headers: { cookie: "home_inventory_session=session-token" },
        body: JSON.stringify({
          name: "牛奶",
          note: "",
          expireDate: null,
          locationId: null,
          photoKey: "photo_1.jpg",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(attached).toEqual({
      userId: "user-1",
      itemId: "item-1",
      photoKey: "photo_1.jpg",
    });
  });

  it("returns the photo only to the item household member", async () => {
    const handlers = createItemPhotoHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      recognitionService: {
        getItemPhoto: async () => null,
      } as never,
    });

    const response = await handlers.GET(
      new NextRequest("http://localhost/api/inventory/items/item-1/photo", {
        headers: { cookie: "home_inventory_session=session-token" },
      }),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 for the photo route without a session", async () => {
    const handlers = createItemPhotoHandlers();
    const response = await handlers.GET(
      new NextRequest("http://localhost/api/inventory/items/item-1/photo"),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 7: 运行确认通过**

Run: `npm test -- src/app/api/inventory/items/photo-attach.test.ts`
Expected: PASS（3 个测试）。

Run: `npm test -- src/app/api/inventory/dashboard/route.test.ts src/app/api/inventory/inventory-routes-permissions.test.ts`
Expected: PASS（回归不破坏）。

- [ ] **Step 8: 提交**

```bash
git add src/features/inventory/dashboard-data.ts src/features/inventory/inventory-repository.ts src/app/api/inventory
git commit -m "feat: attach item photo on create, serve photo with auth, clean on delete"
```

---

## Task 10: Android 基础（依赖、FileProvider、版本）

**Files:**
- Modify: `android/app/build.gradle.kts`、`android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/xml/file_paths.xml`

- [ ] **Step 1: 加依赖与版本号**

`android/app/build.gradle.kts`：

```diff
        versionCode = 5
        versionName = "0.4.0"
+        versionCode = 6
+        versionName = "0.5.0"
```

`dependencies` 中追加：

```kotlin
    implementation("androidx.core:core-ktx:1.13.1")
```

- [ ] **Step 2: FileProvider 声明**

`android/app/src/main/AndroidManifest.xml` 的 `<application>` 内追加：

```xml
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
```

`android/app/src/main/res/xml/file_paths.xml`：

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="camera" path="camera/" />
</paths>
```

- [ ] **Step 3: 构建验证**

Run（`android` 目录下）: `gradle :app:assembleDebug --no-daemon --quiet`
Expected: BUILD SUCCESSFUL。

- [ ] **Step 4: 提交**

```bash
git add android/app/build.gradle.kts android/app/src/main/AndroidManifest.xml android/app/src/main/res/xml/file_paths.xml
git commit -m "feat(android): file provider and version 0.5.0 for photo recognition"
```

---

## Task 11: Android DTO 与 API 接口

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Modify: `android/app/src/test/java/com/homeinventory/app/data/repository/TestApiStub.kt`

- [ ] **Step 1: 修改 DTO**

`dto.kt`：

```diff
 data class RemoteItemDto(
     val id: String,
     val name: String,
     val note: String,
     @SerializedName("expire_date")
     val expireDate: String? = null,
     @SerializedName("location_id")
     val locationId: String? = null,
+    @SerializedName("photo_key")
+    val photoKey: String? = null,
     val updatedAt: String? = null,
 )
```

```diff
 data class ItemCreateRequest(
     val name: String,
     val note: String = "",
     val expireDate: String? = null,
     val locationId: String? = null,
+    val photoKey: String? = null,
 )
```

文件末尾追加：

```kotlin
data class RecognitionResponseDto(
    val mode: String,
    val recognized: Boolean,
    val name: String? = null,
    val expireDate: String? = null,
    val thumbnailId: String? = null,
)
```

- [ ] **Step 2: 修改 API 接口**

`HomeInventoryApi.kt` 追加：

```kotlin
    @Multipart
    @POST("api/recognition")
    suspend fun recognize(
        @Part file: MultipartBody.Part,
        @Query("mode") mode: String,
    ): Response<ApiEnvelope<RecognitionResponseDto>>

    @GET("api/inventory/items/{itemId}/photo")
    suspend fun itemPhoto(@Path("itemId") itemId: String): Response<ResponseBody>
```

imports 追加：`com.homeinventory.app.data.remote.RecognitionResponseDto`、`okhttp3.ResponseBody`。

- [ ] **Step 3: 更新 TestApiStub**

`TestApiStub.kt` 追加两个 override：

```kotlin
    override suspend fun recognize(
        file: MultipartBody.Part,
        mode: String,
    ): Response<ApiEnvelope<RecognitionResponseDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = RecognitionResponseDto(
                    mode = mode,
                    recognized = true,
                    name = "牛奶",
                    expireDate = null,
                    thumbnailId = "photo_1.jpg",
                ),
            ),
        )

    override suspend fun itemPhoto(itemId: String): Response<ResponseBody> =
        Response.success("not-a-real-jpeg".toResponseBody("image/jpeg".toMediaType()))
```

imports 追加：`com.homeinventory.app.data.remote.RecognitionResponseDto`、`okhttp3.ResponseBody`、`okhttp3.ResponseBody.Companion.toResponseBody`、`okhttp3.MediaType.Companion.toMediaType`。

- [ ] **Step 4: 编译验证**

Run（`android` 目录下）: `gradle :app:compileDebugKotlin --no-daemon --quiet`
Expected: BUILD SUCCESSFUL。

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt android/app/src/test/java/com/homeinventory/app/data/repository/TestApiStub.kt
git commit -m "feat(android): recognition and item photo api contracts"
```

---

## Task 12: Android 图片压缩与仓库识别/取图

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/data/media/ImageCompressor.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Modify: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`

- [ ] **Step 1: 实现 ImageCompressor**

`android/app/src/main/java/com/homeinventory/app/data/media/ImageCompressor.kt`：

```kotlin
package com.homeinventory.app.data.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.ByteArrayOutputStream

object ImageCompressor {
    fun compressToJpeg(
        context: Context,
        uri: Uri,
        maxDimension: Int = 1280,
        quality: Int = 80,
    ): ByteArray? {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)

        val sampleSize = computeSampleSize(bounds.outWidth, bounds.outHeight, maxDimension)
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
        val scaled = scaleDown(decoded, maxDimension)
        if (scaled !== decoded) {
            decoded.recycle()
        }

        val output = ByteArrayOutputStream()
        if (!scaled.compress(Bitmap.CompressFormat.JPEG, quality, output)) {
            scaled.recycle()
            return null
        }
        if (scaled !== decoded) {
            scaled.recycle()
        }
        return output.toByteArray()
    }

    private fun computeSampleSize(width: Int, height: Int, maxDimension: Int): Int {
        var sampleSize = 1
        while (width / sampleSize > maxDimension * 2 || height / sampleSize > maxDimension * 2) {
            sampleSize *= 2
        }
        return sampleSize
    }

    private fun scaleDown(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val largest = maxOf(bitmap.width, bitmap.height)
        if (largest <= maxDimension) {
            return bitmap
        }
        val scale = maxDimension.toFloat() / largest
        return Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * scale).toInt().coerceAtLeast(1),
            (bitmap.height * scale).toInt().coerceAtLeast(1),
            true,
        )
    }
}
```

- [ ] **Step 2: 修改仓库**

`InventoryRepository.kt` 文件顶部追加：

```kotlin
data class RecognitionDraft(
    val mode: String,
    val name: String? = null,
    val expireDate: String? = null,
    val thumbnailId: String? = null,
)
```

imports 追加：

```kotlin
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.homeinventory.app.data.remote.RecognitionResponseDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
```

新增方法：

```kotlin
    suspend fun recognizeItemPhoto(
        mode: String,
        jpegBytes: ByteArray,
    ): Result<RecognitionDraft> {
        val body = jpegBytes.toRequestBody("image/jpeg".toMediaType())
        val part = MultipartBody.Part.createFormData("file", "photo.jpg", body)
        val response = try {
            api.recognize(part, mode)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val envelope = response.body()

        if (!response.isSuccessful || envelope?.ok != true || envelope.data == null) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody()) ?: envelope?.message ?: "识别失败",
                ),
            )
        }

        val data = envelope.data
        return Result.success(
            RecognitionDraft(
                mode = data.mode,
                name = data.name,
                expireDate = data.expireDate,
                thumbnailId = data.thumbnailId,
            ),
        )
    }

    suspend fun loadItemPhoto(itemId: String): Result<Bitmap> {
        val response = try {
            api.itemPhoto(itemId)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val bytes = response.body()?.bytes()

        if (!response.isSuccessful || bytes == null) {
            return Result.failure(IllegalStateException("加载物品图片失败"))
        }

        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: return Result.failure(IllegalStateException("图片数据无效"))
        return Result.success(bitmap)
    }
```

`createItemOnline` 增加参数并透传：

```kotlin
    suspend fun createItemOnline(
        name: String,
        note: String,
        expireDate: String?,
        locationId: String?,
        photoKey: String? = null,
    ): Result<Unit> = runOnlineMutation<RemoteItemDto>(
        request = { api.createItem(ItemCreateRequest(name, note, expireDate, locationId, photoKey)) },
        onSuccess = { remoteItem ->
            itemDao.upsert(
                ItemEntity(
                    id = remoteItem.id,
                    serverId = remoteItem.id,
                    locationId = remoteItem.locationId,
                    name = remoteItem.name,
                    note = remoteItem.note,
                    expireDate = DateNormalizer.normalizeExpireDate(remoteItem.expireDate),
                    photoKey = remoteItem.photoKey,
                    serverUpdatedAt = remoteItem.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )
```

`replaceServerData` 的 items map 中加入 `photoKey = item.photoKey,`。

- [ ] **Step 3: 写失败测试**

`InventoryRepositoryTest.kt` 追加：

```kotlin
    @Test
    fun recognizeItemPhotoReturnsDraftOnSuccess() = runTest {
        val repository = repositoryWith(api = FakeRecognizeApi())

        val result = repository.recognizeItemPhoto("name", byteArrayOf(1, 2, 3))

        assertTrue(result.isSuccess)
        assertEquals("牛奶", result.getOrNull()?.name)
        assertEquals("photo_1.jpg", result.getOrNull()?.thumbnailId)
    }

    @Test
    fun recognizeItemPhotoFailsWhenServerRejects() = runTest {
        val repository = repositoryWith(
            api = object : TestApiStub() {
                override suspend fun recognize(
                    file: MultipartBody.Part,
                    mode: String,
                ): Response<ApiEnvelope<RecognitionResponseDto>> =
                    Response.error(
                        429,
                        "{\"ok\":false,\"message\":\"识别太频繁，请稍后再试\"}"
                            .toResponseBody("application/json".toMediaType()),
                    )
            },
        )

        val result = repository.recognizeItemPhoto("name", byteArrayOf(1))

        assertTrue(result.isFailure)
        assertEquals("识别太频繁，请稍后再试", result.exceptionOrNull()?.message)
    }
```

文件末尾追加 fake：

```kotlin
private class FakeRecognizeApi : TestApiStub() {
    override suspend fun recognize(
        file: MultipartBody.Part,
        mode: String,
    ): Response<ApiEnvelope<RecognitionResponseDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = RecognitionResponseDto(
                    mode = mode,
                    recognized = true,
                    name = "牛奶",
                    expireDate = null,
                    thumbnailId = "photo_1.jpg",
                ),
            ),
        )
}
```

imports 追加：`com.homeinventory.app.data.remote.RecognitionResponseDto`、`okhttp3.MediaType.Companion.toMediaType`、`okhttp3.ResponseBody.Companion.toResponseBody`。

- [ ] **Step 4: 运行确认失败→通过**

Run（`android` 目录下）: `gradle :app:testDebugUnitTest --no-daemon --quiet`
Expected: 先因新增方法/字段编译失败，实现后全部通过（仓库现有 26 个测试 + 新增 2 个）。

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/media/ImageCompressor.kt android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt
git commit -m "feat(android): image compression, recognition and photo loading in repository"
```

---

## Task 13: Android Room 迁移（photoKey 列）

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt`

- [ ] **Step 1: 修改实体**

`entities.kt` 的 `ItemEntity` 加入字段（放在 `note` 之后）：

```kotlin
    val photoKey: String? = null,
```

- [ ] **Step 2: 修改数据库版本与迁移**

`AppDatabase.kt`：

```diff
-    version = 2,
+    version = 3,
```

imports 追加：

```kotlin
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
```

`companion object` 内追加：

```kotlin
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE items ADD COLUMN photoKey TEXT")
            }
        }
```

`Room.databaseBuilder` 链上追加：

```kotlin
                    .addMigrations(MIGRATION_2_3)
```

- [ ] **Step 3: 构建验证**

Run（`android` 目录下）: `gradle :app:compileDebugKotlin --no-daemon --quiet`
Expected: BUILD SUCCESSFUL。

- [ ] **Step 4: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/local/entities.kt android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt
git commit -m "feat(android): room migration adds photoKey to items"
```

---

## Task 14: Android ViewModel、表单识别入口与缩略图展示

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/FormValues.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/ItemFormDialog.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/ItemList.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardScreen.kt`、`DashboardHost.kt`、`ui/AppRoot.kt`
- Modify: `android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt`

- [ ] **Step 1: FormValues 增加 photoKey**

`FormValues.kt` 的 `ItemFormValues` 增加：

```kotlin
    val photoKey: String? = null,
```

- [ ] **Step 2: ViewModel 增加识别与取图**

`DashboardViewModel.kt` 的 `DashboardUiItem` 增加 `photoKey`：

```kotlin
data class DashboardUiItem(
    ...
    val syncStatus: String,
    val expirationStatus: String,
    val photoKey: String? = null,
)
```

构造参数追加（带默认值，不破坏现有测试）：

```kotlin
    private val recognizePhoto: suspend (mode: String, bytes: ByteArray) -> Result<RecognitionDraft> = { _, _ ->
        Result.failure(IllegalStateException("拍照识别不可用"))
    },
    private val loadPhoto: suspend (itemId: String) -> Result<Bitmap> = {
        Result.failure(IllegalStateException("图片加载不可用"))
    },
```

`state` combine 的 items map 中加入 `photoKey = item.photoKey,`，并新增两个方法：

```kotlin
    suspend fun recognizeItemPhoto(mode: String, bytes: ByteArray): Result<RecognitionDraft> =
        recognizePhoto(mode, bytes)

    suspend fun itemPhoto(itemId: String): Result<Bitmap> = loadPhoto(itemId)
```

imports 追加：`android.graphics.Bitmap`、`com.homeinventory.app.data.repository.RecognitionDraft`。

`InventorySnapshot.ItemView` 增加 `photoKey`（`InventorySnapshot.kt`），`observeInventory` 的 items map 传入 `photoKey = it.photoKey`。

- [ ] **Step 3: 表单弹窗加入拍照识别**

`ItemFormDialog.kt` 签名追加参数：

```kotlin
    onRecognize: suspend (mode: String, bytes: ByteArray) -> Result<RecognitionDraft>,
```

内部状态追加：

```kotlin
    val scope = rememberCoroutineScope()
    var photoKey by remember { mutableStateOf(initial.photoKey) }
    var recognizing by remember { mutableStateOf<String?>(null) }
    var recognitionError by remember { mutableStateOf<String?>(null) }
    var pendingMode by remember { mutableStateOf<String?>(null) }
    var sourceDialogVisible by remember { mutableStateOf(false) }
    val cameraFile = remember {
        File(context.cacheDir, "camera").apply { mkdirs() }
        File(context.cacheDir, "camera/photo_${System.currentTimeMillis()}.jpg")
    }
    val cameraUri = remember {
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            cameraFile,
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success) {
            val bytes = cameraFile.readBytes()
            cameraFile.delete()
            runRecognition(pendingMode, bytes)
        } else {
            pendingMode = null
        }
    }
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val bytes = ImageCompressor.compressToJpeg(context, uri)
            runRecognition(pendingMode, bytes ?: ByteArray(0))
        } else {
            pendingMode = null
        }
    }

    fun runRecognition(mode: String?, bytes: ByteArray) {
        val targetMode = mode ?: return
        pendingMode = null
        if (bytes.isEmpty()) {
            recognitionError = "读取照片失败，请重试"
            return
        }
        scope.launch {
            recognizing = targetMode
            recognitionError = null
            onRecognize(targetMode, bytes)
                .onSuccess { draft ->
                    if (draft.name != null) {
                        name = draft.name
                    }
                    if (draft.expireDate != null) {
                        expireDate = draft.expireDate
                    }
                    if (draft.thumbnailId != null) {
                        photoKey = draft.thumbnailId
                    }
                }
                .onFailure { error ->
                    recognitionError = error.message ?: "识别失败，请重试或手动填写"
                }
            recognizing = null
        }
    }
```

在「备注」字段上方插入识别入口 UI：

```kotlin
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        pendingMode = "name"
                        recognitionError = null
                        sourceDialogVisible = true
                    },
                    enabled = recognizing == null,
                ) {
                    Text(if (recognizing == "name") "识别中..." else "拍照识别名称")
                }
                OutlinedButton(
                    onClick = {
                        pendingMode = "expiry"
                        recognitionError = null
                        sourceDialogVisible = true
                    },
                    enabled = recognizing == null,
                ) {
                    Text(if (recognizing == "expiry") "识别中..." else "拍摄有效期")
                }
            }
            if (sourceDialogVisible) {
                AlertDialog(
                    onDismissRequest = {
                        sourceDialogVisible = false
                        pendingMode = null
                    },
                    title = { Text(if (pendingMode == "expiry") "选择有效期照片来源" else "选择物品照片来源") },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(
                                onClick = {
                                    sourceDialogVisible = false
                                    cameraLauncher.launch(cameraUri)
                                },
                            ) {
                                Text("拍照")
                            }
                            TextButton(
                                onClick = {
                                    sourceDialogVisible = false
                                    galleryLauncher.launch(
                                        PickVisualMediaRequest(
                                            ActivityResultContracts.PickVisualMedia.ImageOnly,
                                        ),
                                    )
                                },
                            ) {
                                Text("从相册选择")
                            }
                        }
                    },
                    confirmButton = {},
                )
            }
            recognitionError?.let {
                Text(text = it, color = Danger, fontSize = 13.sp)
            }
```

保存时 `photoKey` 传入 `ItemFormValues`：

```kotlin
                        onSave(
                            ItemFormValues(
                                name = name,
                                areaId = areaId,
                                locationId = locationId,
                                note = note,
                                expireDate = expireDate,
                                photoKey = photoKey,
                            ),
                        )
```

imports 追加：

```kotlin
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.rememberCoroutineScope
import androidx.core.content.FileProvider
import com.homeinventory.app.data.media.ImageCompressor
import com.homeinventory.app.data.repository.RecognitionDraft
import java.io.File
import kotlinx.coroutines.launch
```

- [ ] **Step 4: 列表缩略图**

`ItemList.kt` 签名追加：

```kotlin
    loadPhoto: suspend (itemId: String) -> Result<Bitmap>,
```

`ItemRow` 调用处传入 `loadPhoto`；`ItemRow` 签名追加 `loadPhoto: suspend (String) -> Result<Bitmap>`，头像 Box 改为：

```kotlin
    val thumbnail by produceState<Bitmap?>(initialValue = null, item.id) {
        if (item.photoKey != null) {
            value = loadPhoto(item.id).getOrNull()
        }
    }
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(SurfaceMuted),
        contentAlignment = Alignment.Center,
    ) {
        if (thumbnail != null) {
            Image(
                bitmap = thumbnail.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = item.name.take(1),
                color = Primary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
```

imports 追加：`android.graphics.Bitmap`、`androidx.compose.foundation.Image`、`androidx.compose.foundation.layout.fillMaxSize`、`androidx.compose.runtime.produceState`、`androidx.compose.ui.graphics.asImageBitmap`、`androidx.compose.ui.layout.ContentScale`。

`DashboardScreen.kt` 签名追加 `loadPhoto: suspend (String) -> Result<Bitmap>` 并传给 `ItemList`。

- [ ] **Step 5: 接线**

`DashboardHost.kt`：

- `DashboardScreen(...)` 调用追加 `loadPhoto = viewModel::itemPhoto`。
- `ItemFormDialog(...)` 调用追加 `onRecognize = viewModel::recognizeItemPhoto`。
- `initial = ItemFormValues(...)` 追加 `photoKey = editingItem?.photoKey ?: ""`。
- `repository.createItemOnline(values.name, values.note, values.expireDate, locationId, values.photoKey)`。

`AppRoot.kt` 的 `DashboardViewModel` 工厂追加：

```kotlin
                    recognizePhoto = repository::recognizeItemPhoto,
                    loadPhoto = repository::loadItemPhoto,
```

- [ ] **Step 6: ViewModel 测试**

`DashboardViewModelTest.kt` 追加：

```kotlin
    @Test
    fun recognizeItemPhotoDelegatesToRepository() = runTest {
        val viewModel = DashboardViewModel(
            inventory = MutableStateFlow(InventorySnapshot()),
            recognizePhoto = { mode, _ ->
                Result.success(
                    RecognitionDraft(
                        mode = mode,
                        name = "牛奶",
                        thumbnailId = "photo_1.jpg",
                    ),
                )
            },
        )

        val result = viewModel.recognizeItemPhoto("name", byteArrayOf(1))

        assertTrue(result.isSuccess)
        assertEquals("牛奶", result.getOrNull()?.name)
        assertEquals("photo_1.jpg", result.getOrNull()?.thumbnailId)
    }

    @Test
    fun recognizeItemPhotoSurfacesFailure() = runTest {
        val viewModel = DashboardViewModel(
            inventory = MutableStateFlow(InventorySnapshot()),
            recognizePhoto = { _, _ ->
                Result.failure(IllegalStateException("识别失败"))
            },
        )

        val result = viewModel.recognizeItemPhoto("name", byteArrayOf(1))

        assertTrue(result.isFailure)
        assertEquals("识别失败", result.exceptionOrNull()?.message)
    }
```

imports 追加：`com.homeinventory.app.data.repository.RecognitionDraft`、`kotlinx.coroutines.flow.MutableStateFlow`。

- [ ] **Step 7: 运行确认通过**

Run（`android` 目录下）: `gradle :app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet`
Expected: BUILD SUCCESSFUL，全部单测通过。

- [ ] **Step 8: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt
git commit -m "feat(android): photo recognition entry in item form and item thumbnails"
```

---

## Task 15: 全量验证、文档与收口

**Files:**
- Modify: `dev-docs/acceptance.md`、`dev-docs/README.md`

- [ ] **Step 1: 服务器全量验证**

Run: `npm test`
Expected: 全部通过（本机无 PostgreSQL 时 2 个集成占位跳过）。

Run: `npm run lint`
Expected: exit code 0。

Run: `npm run build`
Expected: exit code 0，构建路由包含 `/api/recognition` 与 `/api/inventory/items/[itemId]/photo`。

- [ ] **Step 2: Android 全量验证**

Run（`android` 目录下）: `gradle :app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet`
Expected: BUILD SUCCESSFUL，全部单测通过。

- [ ] **Step 3: 更新真源文档（证据）**

`dev-docs/acceptance.md` 追加「2026-08-07 拍照识别实施证据」段，记录：迁移 SQL 路径、识别接口行为、限频、缩略图/photoKey 权限负例测试结果、Android 单测/构建结果、未验证项（豆包真实识别需 API key、真机点击验收、服务器部署 migration 与 env）。

`dev-docs/README.md` 当前阶段句尾的「实施计划待编写」改为「实施计划见 `docs/superpowers/plans/2026-08-07-photo-recognition.md`」。

- [ ] **Step 4: 提交**

```bash
git add dev-docs/acceptance.md dev-docs/README.md
git commit -m "docs: photo recognition implementation evidence"
```

---

## 部署注意（写代码后、上线前）

- 服务器执行 `dev-docs/sql/photo_recognition_self_hosted.sql`。
- `/etc/home-inventory-app/app.env` 增加 `DOUBAO_API_KEY`、`DOUBAO_VISION_MODEL`（如开通的是 pro 档则改为对应模型）、`DOUBAO_VISION_BASE_URL`、`PHOTO_STORAGE_DIR=/opt/home-inventory-app/data/photos`。
- 服务器 `data/photos` 目录需可写（`deploy` 用户），并加入备份范围；缩略图属家庭数据，删除物品时文件会被清理。
- 公开推广前在隐私政策中写明「拍照识别会把照片发送给火山引擎处理」。
