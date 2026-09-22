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
};

type Dependencies = {
  database: QwenCredentialDatabase;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  validationTimeoutMs?: number;
};

export type QwenValidationCode =
  | "QWEN_CREDENTIAL_NOT_CONFIGURED"
  | "QWEN_AUTH_INVALID"
  | "QWEN_QUOTA_EXHAUSTED"
  | "QWEN_TIMEOUT"
  | "QWEN_INVALID_JSON"
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
}: Dependencies) {
  const masterKey = parseMasterKey(env.BOOKKEEPING_CREDENTIAL_MASTER_KEY);

  return {
    async saveForUser(
      trustedServerUserId: string,
      apiKey: string,
    ): Promise<QwenCredentialStatus> {
      const plaintext = validateApiKey(apiKey);
      const nonce = randomBytes(NONCE_LENGTH);
      const cipher = createCipheriv(ALGORITHM, masterKey, nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const saved = await database.saveForTrustedServerUser(trustedServerUserId, {
        ciphertext,
        nonce,
        tag: cipher.getAuthTag(),
        keyVersion: 1,
        lastFour: plaintext.slice(-4),
        lastVerifiedAt: null,
      });
      return publicStatus(saved);
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
      const startedAt = Date.now();
      const stored = await database.findForTrustedServerUser(trustedServerUserId);
      if (!stored) return validationFailure("QWEN_CREDENTIAL_NOT_CONFIGURED", startedAt);

      let apiKey: string;
      try {
        apiKey = decrypt(masterKey, stored);
      } catch {
        return validationFailure("QWEN_VALIDATION_FAILED", startedAt);
      }

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

        const updated = await database.recordSuccessfulValidationForTrustedServerUser(
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
    },

    async deleteForUser(trustedServerUserId: string): Promise<boolean> {
      return database.deleteForTrustedServerUser(trustedServerUserId);
    },
  };
}

function decrypt(masterKey: Buffer, stored: StoredQwenCredential): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey, stored.nonce, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(stored.tag);
  return Buffer.concat([
    decipher.update(stored.ciphertext),
    decipher.final(),
  ]).toString("utf8");
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
