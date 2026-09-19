import { describe, expect, it, vi } from "vitest";
import jpeg from "jpeg-js";

import type { CredentialKeyring } from "./bookkeeping-doubao-credential-crypto";
import type {
  BookkeepingDoubaoCredentialRepository,
  StoredDoubaoCredential,
} from "./bookkeeping-doubao-credential-repository";
import { createBookkeepingDoubaoCredentialService } from "./bookkeeping-doubao-credential-service";

function stored(
  overrides: Partial<StoredDoubaoCredential> = {},
): StoredDoubaoCredential {
  return {
    encryptedApiKey: Buffer.from("ciphertext"),
    encryptionNonce: Buffer.alloc(12, 1),
    encryptionTag: Buffer.alloc(16, 2),
    keyVersion: 1,
    enabled: true,
    status: "ACTIVE",
    lastFour: "1234",
    lastVerifiedAt: "2026-09-12T01:00:00.000Z",
    lastSuccessAt: "2026-09-12T01:00:00.000Z",
    lastErrorCode: null,
    ...overrides,
  };
}

function dependencies(current: StoredDoubaoCredential | null = null) {
  const repository: BookkeepingDoubaoCredentialRepository = {
    findForUser: vi.fn(async () => current),
    saveValidatedForUser: vi.fn(async (_userId, input) =>
      stored({
        encryptedApiKey: input.encrypted.ciphertext,
        encryptionNonce: input.encrypted.nonce,
        encryptionTag: input.encrypted.tag,
        keyVersion: input.encrypted.keyVersion,
        enabled: true,
        status: "ACTIVE",
        lastFour: input.lastFour,
      }),
    ),
    setEnabledForUser: vi.fn(async (_userId, enabled) =>
      current ? { ...current, enabled } : null,
    ),
    recordFailureForUser: vi.fn(async () => true),
    recordSuccessForUser: vi.fn(async () => true),
    deleteForUser: vi.fn(async () => current !== null),
  };
  const keyring: CredentialKeyring = {
    encrypt: vi.fn((apiKey) => ({
      ciphertext: Buffer.from(`encrypted:${apiKey}`),
      nonce: Buffer.alloc(12, 3),
      tag: Buffer.alloc(16, 4),
      keyVersion: 7,
    })),
    decrypt: vi.fn(() => "ark-personal-secret"),
  };
  return { repository, keyring };
}

const env = {
  DOUBAO_API_KEY: "ark-platform-secret",
  DOUBAO_TEXT_MODEL: "doubao-text-test",
  DOUBAO_TEXT_BASE_URL: "https://text.invalid/chat/completions",
  DOUBAO_VISION_MODEL: "doubao-vision-test",
  DOUBAO_VISION_BASE_URL: "https://vision.invalid/chat/completions",
};

describe("bookkeeping Doubao credential service", () => {
  it("returns only the public status fields", async () => {
    const deps = dependencies(stored({ status: "AUTH_INVALID", lastErrorCode: "invalid_api_key" }));
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    const status = await service.getStatus("user-a");

    expect(status).toEqual({
      configured: true,
      enabled: true,
      status: "AUTH_INVALID",
      lastFour: "1234",
      lastVerifiedAt: "2026-09-12T01:00:00.000Z",
      lastSuccessAt: "2026-09-12T01:00:00.000Z",
      lastErrorCode: "invalid_api_key",
    });
    expect(Object.keys(status).sort()).toEqual([
      "configured",
      "enabled",
      "lastErrorCode",
      "lastFour",
      "lastSuccessAt",
      "lastVerifiedAt",
      "status",
    ]);
  });

  it("reports an unconfigured credential without exposing private fields", async () => {
    const deps = dependencies(null);
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await expect(service.getStatus("user-a")).resolves.toEqual({
      configured: false,
      enabled: false,
      status: null,
      lastFour: null,
      lastVerifiedAt: null,
      lastSuccessAt: null,
      lastErrorCode: null,
    });
  });

  it("validates text then vision with fixed non-sensitive inputs before encrypting and saving", async () => {
    const deps = dependencies(null);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response("provider content that must be ignored", { status: 200 });
    });
    const service = createBookkeepingDoubaoCredentialService({
      ...deps,
      env,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await service.validateAndSave("user-a", "ark-personal-9876");

    expect(result).toMatchObject({ ok: true, status: { configured: true, enabled: true, lastFour: "9876" } });
    expect(requests.map((request) => request.url)).toEqual([
      env.DOUBAO_TEXT_BASE_URL,
      env.DOUBAO_VISION_BASE_URL,
    ]);
    expect(requests.every((request) => request.init?.signal instanceof AbortSignal)).toBe(true);
    const textBody = JSON.parse(String(requests[0]!.init?.body));
    const visionBody = JSON.parse(String(requests[1]!.init?.body));
    expect(textBody.model).toBe(env.DOUBAO_TEXT_MODEL);
    expect(JSON.stringify(textBody)).not.toContain("ark-personal-9876");
    expect(visionBody.model).toBe(env.DOUBAO_VISION_MODEL);
    const imageUrl = visionBody.messages[0].content[1].image_url.url as string;
    expect(imageUrl).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    const validationImage = jpeg.decode(
      Buffer.from(imageUrl.replace(/^data:image\/jpeg;base64,/, ""), "base64"),
    );
    expect({ width: validationImage.width, height: validationImage.height }).toEqual({
      width: 1,
      height: 1,
    });
    expect(deps.keyring.encrypt).toHaveBeenCalledWith("ark-personal-9876");
    expect(deps.repository.saveValidatedForUser).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({
        encrypted: expect.objectContaining({ keyVersion: 7 }),
        lastFour: "9876",
      }),
    );
  });

  it("returns TEXT_VALIDATION_FAILED without vision, encryption, or persistence", async () => {
    const deps = dependencies(stored());
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 401 }));
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env, fetchImpl: fetchImpl as typeof fetch });

    await expect(service.validateAndSave("user-a", "ark-new-secret")).resolves.toEqual({
      ok: false,
      errorCode: "TEXT_VALIDATION_FAILED",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(deps.keyring.encrypt).not.toHaveBeenCalled();
    expect(deps.repository.saveValidatedForUser).not.toHaveBeenCalled();
    expect(deps.repository.deleteForUser).not.toHaveBeenCalled();
  });

  it("logs only safe provider metadata when text validation fails", async () => {
    const deps = dependencies(stored());
    const validationLogger = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "ModelNotOpen",
            message: "secret-bearing provider detail must not be logged",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    const service = createBookkeepingDoubaoCredentialService({
      ...deps,
      env,
      fetchImpl: fetchImpl as typeof fetch,
      validationLogger,
    });

    await service.validateAndSave("user-a", "ark-new-secret");

    expect(validationLogger).toHaveBeenCalledWith({
      capability: "TEXT",
      endpointHost: "text.invalid",
      model: "doubao-text-test",
      providerCode: "ModelNotOpen",
      status: 400,
      transportError: null,
    });
    const logged = JSON.stringify(validationLogger.mock.calls);
    expect(logged).not.toContain("ark-new-secret");
    expect(logged).not.toContain("secret-bearing provider detail");
  });

  it("returns VISION_VALIDATION_FAILED and preserves the old record", async () => {
    const deps = dependencies(stored());
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env, fetchImpl: fetchImpl as typeof fetch });

    await expect(service.validateAndSave("user-a", "ark-new-secret")).resolves.toEqual({
      ok: false,
      errorCode: "VISION_VALIDATION_FAILED",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(deps.repository.saveValidatedForUser).not.toHaveBeenCalled();
    expect(deps.repository.setEnabledForUser).not.toHaveBeenCalled();
    expect(deps.repository.deleteForUser).not.toHaveBeenCalled();
  });

  it("keeps a configured key while switching to the platform key", async () => {
    const deps = dependencies(stored());
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await expect(service.usePlatform("user-a")).resolves.toMatchObject({
      configured: true,
      enabled: false,
    });
    expect(deps.repository.setEnabledForUser).toHaveBeenCalledWith("user-a", false);

    vi.mocked(deps.repository.findForUser).mockResolvedValueOnce(stored({ enabled: false }));
    await expect(service.resolveForUser("user-a")).resolves.toEqual({
      source: "PLATFORM",
      apiKey: "ark-platform-secret",
      revision: null,
    });
    expect(deps.keyring.decrypt).not.toHaveBeenCalled();
  });

  it("decrypts an enabled personal key even when its health status is unhealthy", async () => {
    const deps = dependencies(stored({ status: "QUOTA_EXHAUSTED", lastErrorCode: "rate_limit" }));
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await expect(service.resolveForUser("user-a")).resolves.toEqual({
      source: "PERSONAL",
      apiKey: "ark-personal-secret",
      revision: "2026-09-12T01:00:00.000Z",
    });
    expect(deps.keyring.decrypt).toHaveBeenCalledOnce();
  });

  it.each([
    ["rate_limit", "QUOTA_EXHAUSTED"],
    ["quota_exhausted", "QUOTA_EXHAUSTED"],
    ["invalid_api_key", "AUTH_INVALID"],
    ["auth_invalid", "AUTH_INVALID"],
  ] as const)("records %s without disabling or deleting the personal key", async (reason, status) => {
    const deps = dependencies(stored());
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await service.recordProviderFailure(
      "user-a",
      "2026-09-12T01:00:00.000Z",
      reason,
    );

    expect(deps.repository.recordFailureForUser).toHaveBeenCalledWith(
      "user-a",
      "2026-09-12T01:00:00.000Z",
      status,
      reason,
    );
    expect(deps.repository.setEnabledForUser).not.toHaveBeenCalled();
    expect(deps.repository.deleteForUser).not.toHaveBeenCalled();
  });

  it("ignores provider failures while the personal credential is disabled", async () => {
    const deps = dependencies(stored({ enabled: false }));
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await service.recordProviderFailure(
      "user-a",
      "2026-09-12T01:00:00.000Z",
      "rate_limit",
    );

    expect(deps.repository.recordFailureForUser).not.toHaveBeenCalled();
  });

  it("restores ACTIVE for a successful call from the current credential revision", async () => {
    const deps = dependencies(stored({ status: "AUTH_INVALID", lastErrorCode: "invalid_api_key" }));
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await service.recordProviderSuccess(
      "user-a",
      "2026-09-12T01:00:00.000Z",
    );

    expect(deps.repository.recordSuccessForUser).toHaveBeenCalledWith(
      "user-a",
      "2026-09-12T01:00:00.000Z",
    );
  });

  it("does not let an expired request revise health after the key is replaced", async () => {
    const deps = dependencies(
      stored({
        lastVerifiedAt: "2026-09-12T02:00:00.000Z",
        status: "ACTIVE",
      }),
    );
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await service.recordProviderFailure(
      "user-a",
      "2026-09-12T01:00:00.000Z",
      "rate_limit",
    );
    await service.recordProviderSuccess(
      "user-a",
      "2026-09-12T01:00:00.000Z",
    );

    expect(deps.repository.recordFailureForUser).not.toHaveBeenCalled();
    expect(deps.repository.recordSuccessForUser).not.toHaveBeenCalled();
  });

  it("times out a hanging text validation with a deterministic failure", async () => {
    let signal: AbortSignal | null = null;
    const deps = dependencies(stored());
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const service = createBookkeepingDoubaoCredentialService({
      ...deps,
      env,
      fetchImpl: fetchImpl as typeof fetch,
      validationTimeoutMs: 5,
    });

    await expect(service.validateAndSave("user-a", "ark-new-secret")).resolves.toEqual({
      ok: false,
      errorCode: "TEXT_VALIDATION_FAILED",
    });
    expect(signal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses a separate timeout signal for a hanging vision validation", async () => {
    const signals: AbortSignal[] = [];
    const deps = dependencies(stored());
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) throw new Error("missing signal");
      signals.push(signal);
      if (signals.length === 1) return new Response("", { status: 200 });
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const service = createBookkeepingDoubaoCredentialService({
      ...deps,
      env,
      fetchImpl: fetchImpl as typeof fetch,
      validationTimeoutMs: 5,
    });

    await expect(service.validateAndSave("user-a", "ark-new-secret")).resolves.toEqual({
      ok: false,
      errorCode: "VISION_VALIDATION_FAILED",
    });
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]?.aborted).toBe(true);
  });

  it("physically deletes idempotently and then reports platform usage", async () => {
    const deps = dependencies(stored());
    vi.mocked(deps.repository.deleteForUser)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const service = createBookkeepingDoubaoCredentialService({ ...deps, env });

    await expect(service.deleteCredential("user-a")).resolves.toBe(true);
    await expect(service.deleteCredential("user-a")).resolves.toBe(false);
    expect(deps.repository.deleteForUser).toHaveBeenNthCalledWith(1, "user-a");
    expect(deps.repository.deleteForUser).toHaveBeenNthCalledWith(2, "user-a");
  });
});
