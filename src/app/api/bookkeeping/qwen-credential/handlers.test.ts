import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createQwenCredentialHandlers } from "./handlers";
import { createQwenCredentialService, type QwenCredentialDatabase, type StoredQwenCredential } from "../../../../features/bookkeeping/qwen-credential-service";

describe("/api/bookkeeping/qwen-credential", () => {
  it("requires the home_inventory_session account before touching credentials", async () => {
    const service = serviceStub();
    const handlers = createQwenCredentialHandlers({
      authService: { getCurrentUser: async () => null },
      service,
    });

    const response = await handlers.GET(request("GET", undefined, false));

    expect(response.status).toBe(401);
    expect(service.getStatusForUser).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT", "POST", "DELETE"] as const)("rejects unauthenticated %s requests", async (method) => {
    const service = serviceStub();
    const handlers = createQwenCredentialHandlers({ authService: { getCurrentUser: async () => null }, service });
    const response = await handlers[method](request(method, method === "PUT" ? { apiKey: "unused" } : undefined, false));

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("apiKey");
    expect(service.validateAndSaveForUser).not.toHaveBeenCalled();
    expect(service.validateConnectivityForUser).not.toHaveBeenCalled();
    expect(service.deleteForUser).not.toHaveBeenCalled();
  });

  it("ignores body identity and validates/saves the candidate only for the session user", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const response = await handlers.PUT(request("PUT", {
      apiKey: "sk-qwen-secret-9876",
      userId: "user-b",
      trustedServerUserId: "user-b",
    }));

    expect(response.status).toBe(200);
    expect(service.validateAndSaveForUser).toHaveBeenCalledWith("user-a", "sk-qwen-secret-9876");
    expect(JSON.stringify(await response.json())).not.toContain("sk-qwen-secret-9876");
  });

  it("does not report success or persist when candidate validation fails", async () => {
    const service = serviceStub();
    service.validateAndSaveForUser.mockResolvedValue({
      ok: false,
      code: "QWEN_AUTH_INVALID",
      elapsedMs: 12,
    });
    const handlers = authenticatedHandlers(service);

    const response = await handlers.PUT(request("PUT", { apiKey: "sk-qwen-invalid-secret-1234" }));

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload).toEqual({ ok: false, code: "invalid_key" });
    expect(JSON.stringify(payload)).not.toContain("sk-qwen-invalid-secret-1234");
  });

  it("gets, verifies, and deletes only the session account credential", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const get = await handlers.GET(request("GET"));
    const post = await handlers.POST(request("POST", { userId: "user-b" }));
    const remove = await handlers.DELETE(request("DELETE", { userId: "user-b" }));

    expect(get.status).toBe(200);
    expect(post.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(service.getStatusForUser).toHaveBeenCalledWith("user-a");
    expect(service.validateConnectivityForUser).toHaveBeenCalledWith("user-a");
    expect(service.deleteForUser).toHaveBeenCalledWith("user-a");
    for (const response of [get, post, remove]) {
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(JSON.stringify(await response.clone().json())).not.toContain("sk-qwen-secret");
    }
  });

  it("keeps session account A credentials invisible to session account B", async () => {
    const rows = new Map<string, StoredQwenCredential>();
    const database: QwenCredentialDatabase = {
      findForTrustedServerUser: async (userId) => rows.get(userId) ?? null,
      saveForTrustedServerUser: async (userId, credential) => {
        rows.set(userId, credential);
        return credential;
      },
      recordSuccessfulValidationForTrustedServerUser: async (userId, verifiedAt) => {
        const current = rows.get(userId);
        if (!current) return null;
        const updated = { ...current, lastVerifiedAt: verifiedAt };
        rows.set(userId, updated);
        return updated;
      },
      deleteForTrustedServerUser: async (userId) => rows.delete(userId),
    };
    const service = createQwenCredentialService({
      database,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: Buffer.alloc(32, 8).toString("base64") },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })) as typeof fetch,
    });
    const handlers = createQwenCredentialHandlers({
      authService: { getCurrentUser: async (token) => ({ userId: token === "session-a" ? "user-a" : "user-b", email: "test@example.com" }) },
      service,
    });

    const saved = await handlers.PUT(request("PUT", { apiKey: "sk-qwen-account-a-secret-1234" }, true, "session-a"));
    const readByB = await handlers.GET(request("GET", undefined, true, "session-b"));

    expect(saved.status).toBe(200);
    expect(await readByB.json()).toEqual({ ok: true, data: { configured: false, maskedKey: null, lastVerifiedAt: null } });
    expect(JSON.stringify(await saved.clone().json())).not.toContain("sk-qwen-account-a-secret-1234");
  });

  it("returns stable validation codes without provider details", async () => {
    const service = serviceStub();
    service.validateConnectivityForUser.mockResolvedValue({
      ok: false,
      code: "QWEN_TIMEOUT",
      elapsedMs: 10_000,
    });
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(request("POST"));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ ok: false, code: "timeout" });
  });
});

function authenticatedHandlers(service: ReturnType<typeof serviceStub>) {
  return createQwenCredentialHandlers({
    authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
    service,
  });
}

function serviceStub() {
  const status = { configured: true, maskedKey: "****1234", lastVerifiedAt: null };
  return {
    getStatusForUser: vi.fn(async () => status),
    validateAndSaveForUser: vi.fn(async () => ({ ok: true as const, status, elapsedMs: 5 })),
    validateConnectivityForUser: vi.fn(async () => ({ ok: true as const, status, elapsedMs: 5 })),
    deleteForUser: vi.fn(async () => true),
  };
}

function request(method: string, body?: unknown, authenticated = true, sessionToken = "session-token") {
  return new NextRequest("http://localhost/api/bookkeeping/qwen-credential", {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authenticated ? { Cookie: `home_inventory_session=${sessionToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
