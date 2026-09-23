import { describe, expect, it, vi } from "vitest";

import { SESSION_EXPIRED_EVENT } from "./auth-aware-fetch";
import { setupAuthSessionExpiryListener } from "./AuthSessionExpiryBoundary";

describe("AuthSessionExpiryBoundary", () => {
  it("replaces the route when the global session-expired event fires", () => {
    const browserWindow = new EventTarget();
    const replace = vi.fn();
    const cleanup = setupAuthSessionExpiryListener(browserWindow, replace);

    browserWindow.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));

    expect(replace).toHaveBeenCalledWith("/login?expired=1");
    cleanup();
  });

  it("removes its global listener on cleanup", () => {
    const browserWindow = new EventTarget();
    const replace = vi.fn();
    const cleanup = setupAuthSessionExpiryListener(browserWindow, replace);

    cleanup();
    browserWindow.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));

    expect(replace).not.toHaveBeenCalled();
  });
});
