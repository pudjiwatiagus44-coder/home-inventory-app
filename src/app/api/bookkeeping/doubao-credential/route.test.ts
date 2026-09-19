import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createDoubaoCredentialHandlers } from "./handlers";

function request(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://example.test/api/bookkeeping/doubao-credential", {
    method,
    headers: { "content-type": "application/json", Cookie: "home_inventory_session=session-1", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Doubao credential routes", () => {
  it("requires an authenticated user and disables caching", async () => {
    const handlers = createDoubaoCredentialHandlers({
      authService: { getCurrentUser: vi.fn().mockResolvedValue(null) },
    });
    const response = await handlers.GET(request("GET"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("returns status without a submitted key and supports explicit platform switch", async () => {
    const service = {
      getStatus: vi.fn().mockResolvedValue({ configured: true, enabled: true, status: "ACTIVE", lastFour: "1234", lastVerifiedAt: null, lastSuccessAt: null, lastErrorCode: null }),
      validateAndSave: vi.fn(),
      usePlatform: vi.fn().mockResolvedValue({ configured: true, enabled: false, status: "ACTIVE", lastFour: "1234", lastVerifiedAt: null, lastSuccessAt: null, lastErrorCode: null }),
      deleteCredential: vi.fn().mockResolvedValue(true),
    };
    const authService = { getCurrentUser: vi.fn().mockResolvedValue({ userId: "user-1" }) };
    const handlers = createDoubaoCredentialHandlers({ authService, service });
    const getResponse = await handlers.GET(request("GET"));
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(expect.objectContaining({ ok: true }));
    expect(JSON.stringify(await (await handlers.POST(request("POST"))).json())).not.toContain("sk-");
    expect(service.usePlatform).toHaveBeenCalledWith("user-1");
  });

  it("rejects extra fields and never echoes the submitted key", async () => {
    const service = {
      getStatus: vi.fn(),
      validateAndSave: vi.fn().mockResolvedValue({ ok: true, status: { configured: true, enabled: true, status: "ACTIVE", lastFour: "1234", lastVerifiedAt: null, lastSuccessAt: null, lastErrorCode: null } }),
      usePlatform: vi.fn(),
      deleteCredential: vi.fn(),
    };
    const handlers = createDoubaoCredentialHandlers({
      authService: { getCurrentUser: vi.fn().mockResolvedValue({ userId: "user-1" }) },
      service,
    });
    const invalid = await handlers.PUT(request("PUT", { apiKey: "secret", extra: true }));
    expect(invalid.status).toBe(400);
    const valid = await handlers.PUT(request("PUT", { apiKey: "secret" }));
    expect(valid.status).toBe(200);
    expect(JSON.stringify(await valid.json())).not.toContain("secret");
  });
});
