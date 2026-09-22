import { describe, expect, it, vi } from "vitest";

import {
  consumeAndClearPlaintextBuffer,
  createQwenCredentialService,
  type QwenCredentialDatabase,
  type StoredQwenCredential,
} from "./qwen-credential-service";

const MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "sk-qwen-secret-account-a-1234";

function database(): QwenCredentialDatabase & { rows: Map<string, StoredQwenCredential> } {
  const rows = new Map<string, StoredQwenCredential>();
  const lockTails = new Map<string, Promise<void>>();
  const store = {
    rows,
    findForTrustedServerUser: vi.fn(async (userId: string) => rows.get(userId) ?? null),
    saveForTrustedServerUser: vi.fn(async (userId: string, value: StoredQwenCredential) => {
      rows.set(userId, value);
      return value;
    }),
    recordSuccessfulValidationForTrustedServerUser: vi.fn(async (userId: string, at: string) => {
      const current = rows.get(userId);
      if (!current) return null;
      const value = { ...current, lastVerifiedAt: at };
      rows.set(userId, value);
      return value;
    }),
    deleteForTrustedServerUser: vi.fn(async (userId: string) => rows.delete(userId)),
    withUserMutationLock: async <T>(userId: string, operation: (lockedDatabase: QwenCredentialDatabase) => Promise<T>) => {
      const previous = lockTails.get(userId) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => { release = resolve; });
      lockTails.set(userId, previous.then(() => current));
      await previous;
      try { return await operation(store); } finally { release(); }
    },
  } as QwenCredentialDatabase & {
    rows: Map<string, StoredQwenCredential>;
    withUserMutationLock: <T>(userId: string, operation: (lockedDatabase: QwenCredentialDatabase) => Promise<T>) => Promise<T>;
  };
  return store;
}

describe("Qwen credential service", () => {
  it("clears decrypted plaintext bytes after successful consumption", () => {
    const plaintext = Buffer.from("temporary secret");
    expect(consumeAndClearPlaintextBuffer(plaintext, (bytes) => bytes.toString("utf8")))
      .toBe("temporary secret");
    expect(plaintext.every((byte) => byte === 0)).toBe(true);
  });

  it("clears decrypted plaintext bytes when consumption throws", () => {
    const plaintext = Buffer.from("temporary secret");
    expect(() => consumeAndClearPlaintextBuffer(plaintext, () => {
      throw new Error("consumer failed");
    })).toThrow("consumer failed");
    expect(plaintext.every((byte) => byte === 0)).toBe(true);
  });

  it("stores only AES-256-GCM ciphertext and isolates users", async () => {
    const store = database();
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
    });

    await service.saveForUser("user-a", API_KEY);
    const row = store.rows.get("user-a");
    expect(row).toBeDefined();
    expect(Buffer.isBuffer(row?.ciphertext)).toBe(true);
    expect(row?.ciphertext.toString("utf8")).not.toContain(API_KEY);
    expect(row).toMatchObject({ keyVersion: 1, lastFour: "1234", lastVerifiedAt: null });
    expect(row?.nonce).toHaveLength(12);
    expect(row?.tag).toHaveLength(16);
    await expect(service.decryptForProvider("user-a")).resolves.toBe(API_KEY);
    await expect(service.decryptForProvider("user-b")).resolves.toBeNull();
    await expect(service.getStatusForUser("user-a")).resolves.toEqual({
      configured: true,
      maskedKey: "****1234",
      lastVerifiedAt: null,
    });
    expect(JSON.stringify(await service.getStatusForUser("user-a"))).not.toContain(API_KEY);
  });

  it("rejects a master key that does not decode to exactly 32 bytes", () => {
    expect(() => createQwenCredentialService({ database: database(), env: {
      ...process.env,
      BOOKKEEPING_CREDENTIAL_MASTER_KEY: Buffer.alloc(31, 2).toString("base64"),
    } })).toThrow("BOOKKEEPING_CREDENTIAL_MASTER_KEY must decode to 32 bytes");
  });

  it("physically deletes only the requested account credential", async () => {
    const store = database();
    const service = createQwenCredentialService({ database: store, env: {
      ...process.env,
      BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY,
    } });
    await service.saveForUser("user-a", API_KEY);
    await service.saveForUser("user-b", "sk-qwen-secret-account-b-5678");

    await expect(service.deleteForUser("user-a")).resolves.toBe(true);
    await expect(service.decryptForProvider("user-a")).resolves.toBeNull();
    await expect(service.decryptForProvider("user-b")).resolves.toBe("sk-qwen-secret-account-b-5678");
  });

  it("sends a minimal DashScope validation request and records success", async () => {
    const store = database();
    const fetchCalls: Array<{ url: string; request?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, request?: RequestInit) => {
      fetchCalls.push({ url, request });
      return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      }), { status: 200 });
    });
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-09-23T01:00:00.000Z"),
    });
    await service.saveForUser("user-a", API_KEY);

    await expect(service.validateConnectivityForUser("user-a")).resolves.toMatchObject({
      ok: true,
      status: { configured: true, maskedKey: "****1234", lastVerifiedAt: "2026-09-23T01:00:00.000Z" },
    });
    const [{ url, request }] = fetchCalls;
    if (!request) throw new Error("expected provider request options");
    expect(url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(new Headers(request.headers).get("Authorization")).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(String(request.body))).toEqual({
      model: "qwen3.7-flash",
      messages: [{ role: "user", content: 'Return exactly {"ok":true}.' }],
      temperature: 0,
      stream: false,
    });
    expect(JSON.stringify(await service.getStatusForUser("user-a"))).not.toContain(API_KEY);
  });

  it("validates a replacement candidate before saving it and keeps the previous key on failure", async () => {
    const store = database();
    const fetchImpl = vi.fn(async (_url: string, _request?: RequestInit) => {
      void _url;
      void _request;
      return new Response("invalid key", { status: 401 });
    });
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
    });
    await service.saveForUser("user-a", API_KEY);
    const previous = store.rows.get("user-a");

    const result = await service.validateAndSaveForUser("user-a", "sk-qwen-new-secret-9876");

    expect(result).toMatchObject({ ok: false, code: "QWEN_AUTH_INVALID" });
    expect(store.rows.get("user-a")).toBe(previous);
    expect(store.saveForTrustedServerUser).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("Authorization"))
      .toBe("Bearer sk-qwen-new-secret-9876");
    expect(JSON.stringify(result)).not.toContain("sk-qwen-new-secret-9876");
  });

  it("saves a candidate only after DashScope confirms it", async () => {
    const store = database();
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }), { status: 200 })) as typeof fetch,
      now: () => new Date("2026-09-23T01:00:00.000Z"),
    });

    const result = await service.validateAndSaveForUser("user-a", "sk-qwen-candidate-4321");

    expect(result).toMatchObject({
      ok: true,
      status: { configured: true, maskedKey: "****4321", lastVerifiedAt: "2026-09-23T01:00:00.000Z" },
    });
    expect(await service.decryptForProvider("user-a")).toBe("sk-qwen-candidate-4321");
  });

  it("rejects malformed candidate keys without making a provider request or saving", async () => {
    const store = database();
    const fetchImpl = vi.fn();
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(service.validateAndSaveForUser("user-a", "x")).resolves.toMatchObject({
      ok: false,
      code: "QWEN_INVALID_REQUEST",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.saveForTrustedServerUser).not.toHaveBeenCalled();
  });

  it.each([
    [401, "QWEN_AUTH_INVALID"],
    [429, "QWEN_QUOTA_EXHAUSTED"],
    [500, "QWEN_VALIDATION_FAILED"],
  ] as const)("maps upstream status %s to %s without exposing key", async (status, code) => {
    const store = database();
    const fetchImpl = vi.fn(async () => new Response("upstream secret response", { status }));
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
    });
    await service.saveForUser("user-a", API_KEY);

    const result = await service.validateConnectivityForUser("user-a");
    expect(result).toMatchObject({ ok: false, code });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toContain("upstream secret response");
  });

  it("returns stable timeout and invalid JSON codes", async () => {
    const store = database();
    const hangingFetch = vi.fn(async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const timeoutService = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: hangingFetch as typeof fetch,
      validationTimeoutMs: 1,
    });
    await timeoutService.saveForUser("user-a", API_KEY);
    await expect(timeoutService.validateConnectivityForUser("user-a")).resolves.toMatchObject({
      ok: false,
      code: "QWEN_TIMEOUT",
    });

    const invalidJsonService = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: vi.fn(async () => new Response("not json", { status: 200 })) as typeof fetch,
    });
    await expect(invalidJsonService.validateConnectivityForUser("user-a")).resolves.toMatchObject({
      ok: false,
      code: "QWEN_INVALID_JSON",
    });
  });

  it("serializes PUT validation and DELETE so deletion cannot be undone by an earlier pending PUT", async () => {
    const store = database();
    const providerResponse = deferred<Response>();
    const fetchImpl = vi.fn(async () => providerResponse.promise);
    const service = createQwenCredentialService({
      database: store,
      env: { ...process.env, BOOKKEEPING_CREDENTIAL_MASTER_KEY: MASTER_KEY },
      fetchImpl: fetchImpl as typeof fetch,
    });
    const put = service.validateAndSaveForUser("user-a", "sk-qwen-race-key-1234");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const deletion = service.deleteForUser("user-a");
    await Promise.resolve();
    providerResponse.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));

    await Promise.all([put, deletion]);

    await expect(service.decryptForProvider("user-a")).resolves.toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
