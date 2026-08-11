import { describe, expect, it } from "vitest";
import { encode } from "jpeg-js";

import { createAreaLocationPhotoService } from "./area-location-photo-service";

function jpegBuffer() {
  const data = new Uint8Array(64 * 48 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 180;
    data[i + 1] = 120;
    data[i + 2] = 80;
    data[i + 3] = 255;
  }
  const encoded = encode({ data, width: 64, height: 48 }, 80);
  return Buffer.from(encoded.data);
}

describe("area location photo service", () => {
  it("uploads an area photo, saves file and updates photo key", async () => {
    const saved = new Map<string, Buffer>();
    const service = createAreaLocationPhotoService({
      loadDashboardForUser: async () => ({
        householdId: "household-1",
        role: "member",
        areaIds: ["area-1"],
        locationIds: [],
      }),
      photoRepository: {
        updateAreaPhotoKey: async () => ({
          photoKey: "area_1.jpg",
          previousPhotoKey: null,
        }),
      },
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
    ).rejects.toThrow("只读成员不能修改照片");
  });
});
