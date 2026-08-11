import { describe, expect, it } from "vitest";
import { encode } from "jpeg-js";

import { createRecognitionService } from "./recognition-service";
import { DoubaoApiKeyMissingError } from "./doubao-vision";
import type { PhotoRepository } from "../photos/photo-repository";
import type { PhotoStore } from "../photos/photo-store";
import type { DoubaoVisionClient } from "./doubao-vision";

function makeJpeg() {
  const data = new Uint8Array(8 * 6 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200;
    data[i + 1] = 100;
    data[i + 2] = 50;
    data[i + 3] = 255;
  }
  const encoded = encode({ data, width: 8, height: 6 }, 80);
  return Buffer.from(encoded.data);
}

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
    recognizeItemDetails: async () => ({
      ok: true,
      value: { name: "牛奶", note: "常温保存" },
    }),
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
      jpegBuffer: makeJpeg(),
    });

    expect(result.mode).toBe("name");
    expect(result.recognized).toBe(true);
    expect(result.name).toBe("牛奶");
    expect(result.note).toBe("常温保存");
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

  it("stores a thumbnail in photo mode without calling the vision api", async () => {
    let visionCalls = 0;
    const fakes = createFakes({ householdId: "household-1" });
    const service = createRecognitionService({
      loadHouseholdIdForUser: async () => fakes.householdId,
      photoRepository: fakes.photoRepository,
      photoStore: fakes.photoStore,
      doubaoVision: {
        recognizeName: async () => {
          visionCalls += 1;
          return { ok: true, value: "x" };
        },
        recognizeExpireDate: async () => {
          visionCalls += 1;
          return { ok: true, value: "2026-01-01" };
        },
      },
    });

    const result = await service.recognizeForCurrentUser({
      userId: "user-1",
      mode: "photo",
      jpegBuffer: makeJpeg(),
    });

    expect(result.mode).toBe("photo");
    expect(result.recognized).toBe(true);
    expect(result.thumbnailId).toMatch(/^photo_/);
    expect(fakes.pending).toHaveLength(1);
    expect(visionCalls).toBe(0);
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

  it("uses the selected household for photo operations", async () => {
    const fakes = createFakes({ householdId: "household-1" });
    const selected: Array<{ userId: string; householdId?: string }> = [];
    const service = createRecognitionService({
      loadHouseholdIdForUser: async (userId, householdId) => {
        selected.push({ userId, householdId });
        return householdId ?? fakes.householdId;
      },
      ...fakes,
    });

    await service.recognizeForCurrentUser({
      userId: "user-1",
      mode: "name",
      jpegBuffer: makeJpeg(),
      householdId: "household-2",
    });
    await service.attachPhotoToItem({
      userId: "user-1",
      itemId: "item-1",
      photoKey: "photo_1.jpg",
      householdId: "household-2",
    });
    await service.getItemPhoto({
      userId: "user-1",
      itemId: "item-1",
      householdId: "household-2",
    });
    await service.deleteItemPhoto({
      userId: "user-1",
      itemId: "item-1",
      householdId: "household-2",
    });

    expect(selected).toEqual([
      { userId: "user-1", householdId: "household-2" },
      { userId: "user-1", householdId: "household-2" },
      { userId: "user-1", householdId: "household-2" },
      { userId: "user-1", householdId: "household-2" },
    ]);
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
      jpegBuffer: makeJpeg(),
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
      jpegBuffer: makeJpeg(),
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
        recognizeItemDetails: async () => ({
          ok: false,
          reason: "api_key_missing",
        }),
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
      jpegBuffer: makeJpeg(),
      }),
    ).rejects.toBeInstanceOf(DoubaoApiKeyMissingError);
  });
});
