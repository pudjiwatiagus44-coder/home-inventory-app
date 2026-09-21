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
  lastVerifiedAt: string;
};

export type DeepSeekCredentialStatus = {
  configured: boolean;
  maskedKey: string | null;
  lastVerifiedAt: string | null;
};

export type DeepSeekCredentialDatabase = {
  findForUser(userId: string): Promise<StoredDeepSeekCredential | null>;
  saveForUser(
    userId: string,
    credential: StoredDeepSeekCredential,
  ): Promise<StoredDeepSeekCredential>;
  deleteForUser(userId: string): Promise<boolean>;
};

type Dependencies = {
  database: DeepSeekCredentialDatabase;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export function createDeepSeekCredentialService({
  database,
  env = process.env,
  now = () => new Date(),
}: Dependencies) {
  const masterKey = parseMasterKey(env.BOOKKEEPING_CREDENTIAL_MASTER_KEY);

  return {
    async saveForUser(
      userId: string,
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
      const saved = await database.saveForUser(userId, {
        ciphertext,
        nonce,
        tag: cipher.getAuthTag(),
        keyVersion: 1,
        lastFour,
        lastVerifiedAt: now().toISOString(),
      });
      return publicStatus(saved);
    },

    async getStatusForUser(userId: string): Promise<DeepSeekCredentialStatus> {
      return publicStatus(await database.findForUser(userId));
    },

    // 此方法仅供实际 DeepSeek provider 请求路径使用；绝不用于状态接口或日志。
    async decryptForProvider(userId: string): Promise<string | null> {
      const stored = await database.findForUser(userId);
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

    async deleteForUser(userId: string): Promise<boolean> {
      return database.deleteForUser(userId);
    },
  };
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
  if (!apiKey || apiKey.length > 512) {
    throw new Error("DeepSeek API key must contain 1 to 512 characters");
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
