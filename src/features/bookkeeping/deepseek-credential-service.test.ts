import { describe, expect, it, vi } from "vitest";

import {
  createDeepSeekCredentialService,
  type DeepSeekCredentialDatabase,
  type StoredDeepSeekCredential,
} from "./deepseek-credential-service";

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const API_KEY = "sk-this-must-never-be-stored-in-plaintext-1234";

function database(): DeepSeekCredentialDatabase & {
  rows: Map<string, StoredDeepSeekCredential>;
} {
  const rows = new Map<string, StoredDeepSeekCredential>();
  return {
    rows,
    findForTrustedServerUser: vi.fn(async (userId: string) => rows.get(userId) ?? null),
    saveForTrustedServerUser: vi.fn(async (userId: string, record: StoredDeepSeekCredential) => {
      rows.set(userId, record);
      return record;
    }),
    recordSuccessfulValidationForTrustedServerUser: vi.fn(
      async (userId: string, lastVerifiedAt: string) => {
        const record = rows.get(userId);
        if (!record) return null;
        const updated = { ...record, lastVerifiedAt };
        rows.set(userId, updated);
        return updated;
      },
    ),
    deleteForTrustedServerUser: vi.fn(async (userId: string) => rows.delete(userId)),
  };
}

describe("DeepSeek credential service", () => {
  it("encrypts a user credential with AES-256-GCM and stores no plaintext", async () => {
    const store = database();
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      now: () => new Date("2026-09-21T08:00:00.000Z"),
    });

    const status = await service.saveForUser("user-a", API_KEY);
    const record = store.rows.get("user-a");

    expect(status).toEqual({
      configured: true,
      maskedKey: "****1234",
      lastVerifiedAt: null,
    });
    expect(JSON.stringify(record)).not.toContain(API_KEY);
    expect(record).toMatchObject({ keyVersion: 1, lastFour: "1234" });
    expect(Buffer.isBuffer(record?.ciphertext)).toBe(true);
    expect(record?.nonce.length).toBe(12);
    expect(record?.tag.length).toBe(16);
    await expect(service.decryptForProvider("user-a")).resolves.toBe(API_KEY);
  });

  it("keeps each user isolated and exposes only masked public status", async () => {
    const store = database();
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      now: () => new Date("2026-09-21T08:00:00.000Z"),
    });

    await service.saveForUser("user-a", "sk-user-a-1111");
    await service.saveForUser("user-b", "sk-user-b-2222");

    await expect(service.getStatusForUser("user-a")).resolves.toEqual({
      configured: true,
      maskedKey: "****1111",
      lastVerifiedAt: null,
    });
    await expect(service.decryptForProvider("user-b")).resolves.toBe("sk-user-b-2222");
    expect(await service.getStatusForUser("missing-user")).toEqual({
      configured: false,
      maskedKey: null,
      lastVerifiedAt: null,
    });
  });

  it("physically deletes only the requested user's encrypted credential", async () => {
    const store = database();
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
    });
    await service.saveForUser("user-a", "sk-user-a-1111");
    await service.saveForUser("user-b", "sk-user-b-2222");

    await expect(service.deleteForUser("user-a")).resolves.toBe(true);
    await expect(service.decryptForProvider("user-a")).resolves.toBeNull();
    await expect(service.decryptForProvider("user-b")).resolves.toBe("sk-user-b-2222");
    expect(store.rows.has("user-a")).toBe(false);
  });

  it("sets lastVerifiedAt only after a successful provider validation", async () => {
    const store = database();
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      now: () => new Date("2026-09-21T09:00:00.000Z"),
    });
    await service.saveForUser("user-a", "sk-user-a-1111");

    await expect(service.recordSuccessfulValidationForUser("user-a")).resolves.toEqual({
      configured: true,
      maskedKey: "****1111",
      lastVerifiedAt: "2026-09-21T09:00:00.000Z",
    });
  });

  it("rejects an API key shorter than the four-character persisted suffix", async () => {
    const service = createDeepSeekCredentialService({
      database: database(),
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
    });

    await expect(service.saveForUser("user-a", "abc")).rejects.toThrow(
      "DeepSeek API key must contain 4 to 512 characters",
    );
  });

  it("decrypts only for a minimal DeepSeek JSON validation and records success", async () => {
    const store = database();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 }));
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-09-21T10:00:00.000Z"),
    });
    await service.saveForUser("user-a", "sk-user-a-1111");

    await expect(service.validateConnectivityForUser("user-a")).resolves.toMatchObject({
      ok: true,
      status: { configured: true, maskedKey: "****1111", lastVerifiedAt: "2026-09-21T10:00:00.000Z" },
    });
    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-user-a-1111");
    expect(JSON.parse(request.body).model).toBe("deepseek-flash");
    expect(JSON.parse(request.body).thinking).toEqual({ type: "disabled" });
    expect(JSON.stringify(request.body)).not.toContain("user-a");
  });

  it.each([
    [null, "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED"],
    [new Response("", { status: 401 }), "DEEPSEEK_AUTH_INVALID"],
    [new Response("not json", { status: 200 }), "DEEPSEEK_INVALID_JSON"],
  ] as const)("returns %s without exposing the key", async (response, code) => {
    const store = database();
    const fetchImpl = vi.fn(async () => response ?? new Response("", { status: 200 }));
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
    });
    if (response) await service.saveForUser("user-a", "sk-user-a-1111");

    const result = await service.validateConnectivityForUser("user-a");
    expect(result).toMatchObject({ ok: false, code });
    expect(JSON.stringify(result)).not.toContain("sk-user-a-1111");
  });

  it("returns a stable timeout code and aborts the provider request", async () => {
    const store = database();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const service = createDeepSeekCredentialService({
      database: store,
      env: { BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
      validationTimeoutMs: 1,
    });
    await service.saveForUser("user-a", "sk-user-a-1111");

    await expect(service.validateConnectivityForUser("user-a")).resolves.toMatchObject({
      ok: false,
      code: "DEEPSEEK_TIMEOUT",
    });
  });
});
