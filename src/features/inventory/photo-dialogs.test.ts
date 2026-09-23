import { afterEach, describe, expect, it, vi } from "vitest";

import { SESSION_EXPIRED_EVENT } from "../auth/auth-aware-fetch";
import { loadPhotoBlob } from "./photo-dialogs";

describe("loadPhotoBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signals an expired session when a photo request returns 401", async () => {
    const browserWindow = new EventTarget();
    const listener = vi.fn();
    browserWindow.addEventListener(SESSION_EXPIRED_EVENT, listener);
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("Authentication required", { status: 401 }),
      ),
    );

    await expect(loadPhotoBlob("/api/inventory/areas/area-1/photo")).resolves.toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("returns a photo blob and preserves fetch injection", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Blob(["jpeg-bytes"]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );

    const blob = await loadPhotoBlob(
      "/api/inventory/locations/location-1/photo",
      fetchImpl,
    );

    expect(await blob?.text()).toBe("jpeg-bytes");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/inventory/locations/location-1/photo",
    );
  });
});
