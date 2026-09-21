import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export type StoredDeepSeekCredential = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  keyVersion: number;
  lastFour: string;
  lastVerifiedAt: string | null;
};

export type DeepSeekCredentialStatus = {
  configured: boolean;
  maskedKey: string | null;
  lastVerifiedAt: string | null;
};

export type DeepSeekCredentialDatabase = {
  // 调用方必须从服务器会话推导此标识，绝不可传入客户端 body/query 中的 userId。
  findForTrustedServerUser(
    trustedServerUserId: string,
  ): Promise<StoredDeepSeekCredential | null>;
  saveForTrustedServerUser(
    trustedServerUserId: string,
    credential: StoredDeepSeekCredential,
  ): Promise<StoredDeepSeekCredential>;
  recordSuccessfulValidationForTrustedServerUser(
    trustedServerUserId: string,
    lastVerifiedAt: string,
  ): Promise<StoredDeepSeekCredential | null>;
  deleteForTrustedServerUser(trustedServerUserId: string): Promise<boolean>;
};

type Dependencies = {
  database: DeepSeekCredentialDatabase;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  validationTimeoutMs?: number;
};

export type DeepSeekValidationResult =
  | { ok: true; status: DeepSeekCredentialStatus; elapsedMs: number }
  | { ok: false; code: DeepSeekValidationCode; elapsedMs: number };

export type DeepSeekValidationCode =
  | "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED"
  | "DEEPSEEK_AUTH_INVALID"
  | "DEEPSEEK_TIMEOUT"
  | "DEEPSEEK_INVALID_JSON"
  | "DEEPSEEK_VALIDATION_FAILED";

export function createDeepSeekCredentialService({
  database,
  env = process.env,
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
  validationTimeoutMs = 10_000,
}: Dependencies) {
  const masterKey = parseMasterKey(env.BOOKKEEPING_CREDENTIAL_MASTER_KEY);

  return {
    // 此参数只能来自服务端已认证会话；路由不得接受客户端提供的 userId。
    async saveForUser(
      trustedServerUserId: string,
      apiKey: string,
    ): Promise<DeepSeekCredentialStatus> {
      const plaintext = validateApiKey(apiKey);
      const nonce = randomBytes(NONCE_LENGTH);
      const cipher = createCipheriv(ALGORITHM, masterKey, nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const lastFour = plaintext.slice(-4);
      const saved = await database.saveForTrustedServerUser(trustedServerUserId, {
        ciphertext,
        nonce,
        tag: cipher.getAuthTag(),
        keyVersion: 1,
        lastFour,
        lastVerifiedAt: null,
      });
      return publicStatus(saved);
    },

    async getStatusForUser(
      trustedServerUserId: string,
    ): Promise<DeepSeekCredentialStatus> {
      return publicStatus(
        await database.findForTrustedServerUser(trustedServerUserId),
      );
    },

    // 此方法仅供实际 DeepSeek provider 请求路径使用；绝不用于状态接口或日志。
    async decryptForProvider(trustedServerUserId: string): Promise<string | null> {
      const stored = await database.findForTrustedServerUser(trustedServerUserId);
      if (!stored) return null;

      const decipher = createDecipheriv(ALGORITHM, masterKey, stored.nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(stored.tag);
      return Buffer.concat([
        decipher.update(stored.ciphertext),
        decipher.final(),
      ]).toString("utf8");
    },

    async recordSuccessfulValidationForUser(
      trustedServerUserId: string,
    ): Promise<DeepSeekCredentialStatus> {
      const updated = await database.recordSuccessfulValidationForTrustedServerUser(
        trustedServerUserId,
        now().toISOString(),
      );
      return publicStatus(updated);
    },

    async validateConnectivityForUser(
      trustedServerUserId: string,
    ): Promise<DeepSeekValidationResult> {
      const startedAt = Date.now();
      const stored = await database.findForTrustedServerUser(trustedServerUserId);
      if (!stored) {
        return validationFailure("DEEPSEEK_CREDENTIAL_NOT_CONFIGURED", startedAt);
      }

      let apiKey: string;
      try {
        apiKey = decrypt(masterKey, stored);
      } catch {
        return validationFailure("DEEPSEEK_VALIDATION_FAILED", startedAt);
      }

      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          fetchImpl("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "deepseek-flash",
              thinking: { type: "disabled" },
              temperature: 0,
              stream: false,
              response_format: { type: "json_object" },
              messages: [{ role: "user", content: "Return exactly the JSON object {\"ok\":true}." }],
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
        if (response.status === 401) {
          return validationFailure("DEEPSEEK_AUTH_INVALID", startedAt);
        }
        if (!response.ok) {
          return validationFailure("DEEPSEEK_VALIDATION_FAILED", startedAt);
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !isValidationJson(content)) {
          return validationFailure("DEEPSEEK_INVALID_JSON", startedAt);
        }
        const updated = await database.recordSuccessfulValidationForTrustedServerUser(
          trustedServerUserId,
          now().toISOString(),
        );
        if (!updated) return validationFailure("DEEPSEEK_CREDENTIAL_NOT_CONFIGURED", startedAt);
        return { ok: true, status: publicStatus(updated), elapsedMs: Date.now() - startedAt };
      } catch (error) {
        return validationFailure(
          controller.signal.aborted || error instanceof Error && error.message === "timeout"
            ? "DEEPSEEK_TIMEOUT"
            : "DEEPSEEK_INVALID_JSON",
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

function decrypt(masterKey: Buffer, stored: StoredDeepSeekCredential): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey, stored.nonce, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(stored.tag);
  return Buffer.concat([
    decipher.update(stored.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function isValidationJson(content: string): boolean {
  try {
    const value = JSON.parse(content) as { ok?: unknown };
    return value.ok === true;
  } catch {
    return false;
  }
}

function validationFailure(
  code: DeepSeekValidationCode,
  startedAt: number,
): DeepSeekValidationResult {
  return { ok: false, code, elapsedMs: Date.now() - startedAt };
}

function publicStatus(
  stored: StoredDeepSeekCredential | null,
): DeepSeekCredentialStatus {
  if (!stored) {
    return { configured: false, maskedKey: null, lastVerifiedAt: null };
  }
  return {
    configured: true,
    maskedKey: `****${stored.lastFour}`,
    lastVerifiedAt: stored.lastVerifiedAt,
  };
}

function validateApiKey(value: string): string {
  const apiKey = value.trim();
  if (apiKey.length < 4 || apiKey.length > 512) {
    throw new Error("DeepSeek API key must contain 4 to 512 characters");
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
