import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VALIDATION_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

export type StoredQwenCredential = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  keyVersion: number;
  lastFour: string;
  lastVerifiedAt: string | null;
};

export type QwenCredentialStatus = {
  configured: boolean;
  maskedKey: string | null;
  lastVerifiedAt: string | null;
};

export type QwenCredentialDatabase = {
  // trustedServerUserId must come only from the authenticated server session.
  findForTrustedServerUser(trustedServerUserId: string): Promise<StoredQwenCredential | null>;
  saveForTrustedServerUser(
    trustedServerUserId: string,
    credential: StoredQwenCredential,
  ): Promise<StoredQwenCredential>;
  recordSuccessfulValidationForTrustedServerUser(
    trustedServerUserId: string,
    lastVerifiedAt: string,
  ): Promise<StoredQwenCredential | null>;
  deleteForTrustedServerUser(trustedServerUserId: string): Promise<boolean>;
  acquireValidationSlotForTrustedServerUser(
    trustedServerUserId: string,
    requestId: string,
    startedAt: string,
    windowMs: number,
    maxRequests: number,
    maxConcurrent: number,
  ): Promise<boolean>;
  releaseValidationSlotForTrustedServerUser(
    trustedServerUserId: string,
    requestId: string,
    completedAt: string,
  ): Promise<void>;
  // Implemented by PostgreSQL with a transaction-scoped advisory lock; never replace with a process mutex.
  withUserMutationLock<T>(
    trustedServerUserId: string,
    operation: (lockedDatabase: QwenCredentialDatabase) => Promise<T>,
  ): Promise<T>;
};

type Dependencies = {
  database: QwenCredentialDatabase;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  validationTimeoutMs?: number;
  validationRateLimit?: { maxRequests: number; windowMs: number; maxConcurrent: number };
};

export type QwenValidationCode =
  | "QWEN_CREDENTIAL_NOT_CONFIGURED"
  | "QWEN_AUTH_INVALID"
  | "QWEN_QUOTA_EXHAUSTED"
  | "QWEN_TIMEOUT"
  | "QWEN_INVALID_JSON"
  | "QWEN_INVALID_REQUEST"
  | "QWEN_VALIDATION_FAILED";

export type QwenValidationResult =
  | { ok: true; status: QwenCredentialStatus; elapsedMs: number }
  | { ok: false; code: QwenValidationCode; elapsedMs: number };

export function createQwenCredentialService({
  database,
  env = process.env,
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
  validationTimeoutMs = 10_000,
  validationRateLimit = { maxRequests: 5, windowMs: 10 * 60 * 1000, maxConcurrent: 1 },
}: Dependencies) {
  const masterKey = parseMasterKey(env.BOOKKEEPING_CREDENTIAL_MASTER_KEY);

  async function storeCredential(lockedDatabase: QwenCredentialDatabase, trustedServerUserId: string, value: string, lastVerifiedAt: string | null) {
    const plaintext = validateApiKey(value);
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, masterKey, nonce, { authTagLength: AUTH_TAG_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const saved = await lockedDatabase.saveForTrustedServerUser(trustedServerUserId, {
      ciphertext,
      nonce,
      tag: cipher.getAuthTag(),
      keyVersion: 1,
      lastFour: plaintext.slice(-4),
      lastVerifiedAt,
    });
    return publicStatus(saved);
  }

  return {
    async acquireValidationSlotForUser(trustedServerUserId: string, requestId: string): Promise<boolean> {
      return database.acquireValidationSlotForTrustedServerUser(
        trustedServerUserId,
        requestId,
        now().toISOString(),
        validationRateLimit.windowMs,
        validationRateLimit.maxRequests,
        validationRateLimit.maxConcurrent,
      );
    },

    async releaseValidationSlotForUser(trustedServerUserId: string, requestId: string): Promise<void> {
      await database.releaseValidationSlotForTrustedServerUser(
        trustedServerUserId,
        requestId,
        now().toISOString(),
      );
    },

    async saveForUser(
      trustedServerUserId: string,
      apiKey: string,
    ): Promise<QwenCredentialStatus> {
      return withMutationLock(trustedServerUserId, (lockedDatabase) =>
        storeCredential(lockedDatabase, trustedServerUserId, apiKey, null));
    },

    async getStatusForUser(trustedServerUserId: string): Promise<QwenCredentialStatus> {
      return publicStatus(await database.findForTrustedServerUser(trustedServerUserId));
    },

    // Only the authenticated provider request path may call this; never for status/logging.
    async decryptForProvider(trustedServerUserId: string): Promise<string | null> {
      const stored = await database.findForTrustedServerUser(trustedServerUserId);
      return stored ? decrypt(masterKey, stored) : null;
    },

    async validateConnectivityForUser(
      trustedServerUserId: string,
    ): Promise<QwenValidationResult> {
      return withMutationLock(trustedServerUserId, async (lockedDatabase) => {
        const startedAt = Date.now();
        const stored = await lockedDatabase.findForTrustedServerUser(trustedServerUserId);
        if (!stored) return validationFailure("QWEN_CREDENTIAL_NOT_CONFIGURED", startedAt);
        let apiKey: string;
        try {
          apiKey = decrypt(masterKey, stored);
        } catch {
          return validationFailure("QWEN_VALIDATION_FAILED", startedAt);
        }
        return validateCredential(trustedServerUserId, apiKey, startedAt, true, lockedDatabase);
      });
    },

    async validateAndSaveForUser(
      trustedServerUserId: string,
      candidateApiKey: string,
    ): Promise<QwenValidationResult> {
      return withMutationLock(trustedServerUserId, async (lockedDatabase) => {
        const startedAt = Date.now();
        let apiKey: string;
        try {
          apiKey = validateApiKey(candidateApiKey);
        } catch {
          return validationFailure("QWEN_INVALID_REQUEST", startedAt);
        }
        const validation = await validateCredential(trustedServerUserId, apiKey, startedAt, false, lockedDatabase);
        if (!validation.ok) return validation;
        const status = await storeCredential(lockedDatabase, trustedServerUserId, apiKey, now().toISOString());
        return { ok: true, status, elapsedMs: validation.elapsedMs };
      });
    },

    async deleteForUser(trustedServerUserId: string): Promise<boolean> {
      return withMutationLock(trustedServerUserId, (lockedDatabase) =>
        lockedDatabase.deleteForTrustedServerUser(trustedServerUserId));
    },
  };

  async function validateCredential(
    trustedServerUserId: string,
    apiKey: string,
    startedAt: number,
    recordSuccess = true,
    lockedDatabase: QwenCredentialDatabase = database,
  ): Promise<QwenValidationResult> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        fetchImpl(VALIDATION_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen3.7-flash",
            messages: [{ role: "user", content: 'Return exactly {"ok":true}.' }],
            temperature: 0,
            stream: false,
          }),
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("timeout"));
          }, validationTimeoutMs);
        }),
      ]);

      if (response.status === 401) return validationFailure("QWEN_AUTH_INVALID", startedAt);
      if (response.status === 429) return validationFailure("QWEN_QUOTA_EXHAUSTED", startedAt);
      if (!response.ok) return validationFailure("QWEN_VALIDATION_FAILED", startedAt);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return validationFailure("QWEN_INVALID_JSON", startedAt);
      }
      if (!hasSuccessfulValidationContent(payload)) {
        return validationFailure("QWEN_INVALID_JSON", startedAt);
      }

      if (!recordSuccess) {
        return {
          ok: true,
          status: { configured: false, maskedKey: null, lastVerifiedAt: null },
          elapsedMs: Date.now() - startedAt,
        };
      }
      const updated = await lockedDatabase.recordSuccessfulValidationForTrustedServerUser(
        trustedServerUserId,
        now().toISOString(),
      );
      if (!updated) return validationFailure("QWEN_CREDENTIAL_NOT_CONFIGURED", startedAt);
      return { ok: true, status: publicStatus(updated), elapsedMs: Date.now() - startedAt };
    } catch (error) {
      return validationFailure(
        controller.signal.aborted || (error instanceof Error && error.message === "timeout")
          ? "QWEN_TIMEOUT"
          : "QWEN_VALIDATION_FAILED",
        startedAt,
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function withMutationLock<T>(
    trustedServerUserId: string,
    operation: (lockedDatabase: QwenCredentialDatabase) => Promise<T>,
  ): Promise<T> {
    return database.withUserMutationLock(trustedServerUserId, operation);
  }
}

function decrypt(masterKey: Buffer, stored: StoredQwenCredential): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey, stored.nonce, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(stored.tag);
  const decryptedChunk = decipher.update(stored.ciphertext);
  let finalChunk: Buffer | undefined;
  try {
    finalChunk = decipher.final();
    const plaintextBuffer = Buffer.concat([decryptedChunk, finalChunk]);
    return consumeAndClearPlaintextBuffer(plaintextBuffer, (plaintext) => plaintext.toString("utf8"));
  } finally {
    decryptedChunk.fill(0);
    finalChunk?.fill(0);
  }
}

/** @internal Exposed so zeroing can be verified without relying on garbage collection. */
export function consumeAndClearPlaintextBuffer<T>(
  plaintextBuffer: Buffer,
  consume: (plaintext: Buffer) => T,
): T {
  try {
    return consume(plaintextBuffer);
  } finally {
    plaintextBuffer.fill(0);
  }
}

function hasSuccessfulValidationContent(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return false;
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
    return false;
  }
  try {
    const content: unknown = JSON.parse(first.message.content);
    return isRecord(content) && content.ok === true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationFailure(
  code: QwenValidationCode,
  startedAt: number,
): QwenValidationResult {
  return { ok: false, code, elapsedMs: Date.now() - startedAt };
}

function publicStatus(stored: StoredQwenCredential | null): QwenCredentialStatus {
  if (!stored) return { configured: false, maskedKey: null, lastVerifiedAt: null };
  return {
    configured: true,
    maskedKey: `****${stored.lastFour}`,
    lastVerifiedAt: stored.lastVerifiedAt,
  };
}

function validateApiKey(value: string): string {
  const apiKey = value.trim();
  if (apiKey.length < 4 || apiKey.length > 512) {
    throw new Error("Qwen API key must contain 4 to 512 characters");
  }
  return apiKey;
}

function parseMasterKey(value: string | undefined): Buffer {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("BOOKKEEPING_CREDENTIAL_MASTER_KEY must be valid base64");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("BOOKKEEPING_CREDENTIAL_MASTER_KEY must decode to 32 bytes");
  }
  return key;
}
