import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AreaLocationPhotoPermissionError } from "../../../server/photos/area-location-photo-service";
import { createEntityPhotoHandlers } from "./photo-route-helpers";

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

function authedRequest(url: string, init: RequestInit = {}) {
  return request(url, {
    ...init,
    headers: {
      ...init.headers,
      cookie: "home_inventory_session=test-session",
    },
  });
}

function jpegBlob() {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3])], {
    type: "image/jpeg",
  });
}

describe("area/location photo routes", () => {
  const authService = {
    getCurrentUser: async () => ({ userId: "user-1", email: "a@example.com" }),
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
    form.append("file", jpegBlob(), "photo.jpg");
    const response = await handlers.PUT(
      authedRequest("http://localhost/api/inventory/areas/area-1/photo", {
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
    form.append("file", jpegBlob(), "photo.jpg");
    const response = await handlers.PUT(
      authedRequest("http://localhost/api/inventory/areas/area-1/photo", {
        method: "PUT",
        body: form,
      }),
      { params: Promise.resolve({ areaId: "area-1" }) },
    );
    expect(response.status).toBe(403);
  });

  it("returns a location photo", async () => {
    const photoService = {
      getLocationPhoto: async () => ({
        photoKey: "location_1.jpg",
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      }),
    };
    const handlers = createEntityPhotoHandlers("location", {
      authService,
      photoService,
    });
    const response = await handlers.GET(
      authedRequest("http://localhost/api/inventory/locations/location-1/photo"),
      { params: Promise.resolve({ locationId: "location-1" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });
});
