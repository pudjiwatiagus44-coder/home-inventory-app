import { afterEach, describe, expect, it, vi } from "vitest";

import { authAwareFetch, SESSION_EXPIRED_EVENT } from "./auth-aware-fetch";

describe("authAwareFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches the session-expired event for a protected 401 response", async () => {
    const browserWindow = new EventTarget();
    const listener = vi.fn();
    browserWindow.addEventListener(SESSION_EXPIRED_EVENT, listener);
    vi.stubGlobal("window", browserWindow);

    const response = await authAwareFetch(
      "/api/inventory/dashboard",
      undefined,
      async () => new Response(null, { status: 401 }),
    );

    expect(response.status).toBe(401);
    expect(listener).toHaveBeenCalledOnce();
  });

  it.each(["/api/auth/login", "/api/auth/register"])(
    "does not expire the session when %s rejects credentials",
    async (url) => {
      const browserWindow = new EventTarget();
      const listener = vi.fn();
      browserWindow.addEventListener(SESSION_EXPIRED_EVENT, listener);
      vi.stubGlobal("window", browserWindow);

      await authAwareFetch(
        url,
        { method: "POST" },
        async () => new Response(null, { status: 401 }),
      );

      expect(listener).not.toHaveBeenCalled();
    },
  );

  it("is safe during SSR when window is unavailable", async () => {
    vi.stubGlobal("window", undefined);

    await expect(
      authAwareFetch("/api/family/households", undefined, async () =>
        new Response(null, { status: 401 }),
      ),
    ).resolves.toHaveProperty("status", 401);
  });
});
