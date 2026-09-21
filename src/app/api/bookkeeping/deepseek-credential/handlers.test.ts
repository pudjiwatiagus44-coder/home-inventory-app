import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createDeepSeekCredentialHandlers } from "./handlers";

describe("/api/bookkeeping/deepseek-credential", () => {
  it("returns 401 before accessing credentials when the session is absent", async () => {
    const service = serviceStub();
    const handlers = createDeepSeekCredentialHandlers({ authService: { getCurrentUser: async () => null }, service });

    const response = await handlers.GET(request("GET", undefined, false));

    expect(response.status).toBe(401);
    expect(service.getStatusForUser).not.toHaveBeenCalled();
  });

  it("authenticates PUT before parsing an untrusted request body", async () => {
    const handlers = createDeepSeekCredentialHandlers({
      authService: { getCurrentUser: async () => null },
      service: serviceStub(),
    });

    const response = await handlers.PUT(request("PUT", { userId: "user-b" }, false));

    expect(response.status).toBe(401);
  });

  it("ignores a body userId and saves only for the session user", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);
    const response = await handlers.PUT(request("PUT", { apiKey: "sk-key-1234", userId: "user-b" }));

    expect(response.status).toBe(200);
    expect(service.saveForUser).toHaveBeenCalledWith("user-a", "sk-key-1234");
    expect(JSON.stringify(await response.json())).not.toContain("sk-key-1234");
  });

  it("reads and physically deletes only the session user's credential", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    await handlers.GET(request("GET"));
    await handlers.DELETE(request("DELETE"));

    expect(service.getStatusForUser).toHaveBeenCalledWith("user-a");
    expect(service.deleteForUser).toHaveBeenCalledWith("user-a");
  });

  it("keeps POST protected while provider validation remains unimplemented", async () => {
    const handlers = authenticatedHandlers(serviceStub());
    const response = await handlers.POST(request("POST"));
    expect(response.status).toBe(501);
  });
});

function authenticatedHandlers(service: ReturnType<typeof serviceStub>) {
  return createDeepSeekCredentialHandlers({
    authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
    service,
  });
}

function serviceStub() {
  const status = { configured: true, maskedKey: "****1234", lastVerifiedAt: null };
  return {
    getStatusForUser: vi.fn(async () => status),
    saveForUser: vi.fn(async () => status),
    deleteForUser: vi.fn(async () => true),
  };
}

function request(method: string, body?: unknown, authenticated = true) {
  return new NextRequest("http://localhost/api/bookkeeping/deepseek-credential", {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authenticated ? { Cookie: "home_inventory_session=session-token" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
