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

  it("returns a thumbnail id for photo mode", async () => {
    const handlers = createRecognitionHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      recognitionService: {
        recognizeForCurrentUser: async ({ mode }) => ({
          mode,
          recognized: true,
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
    const response = await handlers.POST(requestWithFormData(form, "photo"));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        mode: "photo",
        recognized: true,
        thumbnailId: "photo_1.jpg",
      },
    });
    expect(response.status).toBe(200);
  });
});
