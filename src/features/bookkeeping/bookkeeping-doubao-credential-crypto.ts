import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedCredential {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  keyVersion: number;
}

export interface CredentialKeyring {
  encrypt(plaintext: string): EncryptedCredential;
  decrypt(encrypted: EncryptedCredential): string;
}

export function createCredentialKeyring(
  env: NodeJS.ProcessEnv = process.env,
): CredentialKeyring {
  const activeKeyVersion = parseActiveKeyVersion(
    env.BOOKKEEPING_CREDENTIAL_ACTIVE_KEY_VERSION,
  );
  const keys = parseMasterKeys(env.BOOKKEEPING_CREDENTIAL_MASTER_KEYS);

  if (!keys.has(activeKeyVersion)) {
    throw new Error("Active key version is unavailable");
  }

  return {
    encrypt(plaintext) {
      const key = keys.get(activeKeyVersion);
      if (!key) {
        throw new Error("Active key version is unavailable");
      }

      const nonce = randomBytes(NONCE_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);

      return {
        ciphertext,
        nonce,
        tag: cipher.getAuthTag(),
        keyVersion: activeKeyVersion,
      };
    },

    decrypt(encrypted) {
      const key = keys.get(encrypted.keyVersion);
      if (!key) {
        throw new Error("Credential key version is unavailable");
      }

      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        encrypted.nonce,
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAuthTag(encrypted.tag);

      return Buffer.concat([
        decipher.update(encrypted.ciphertext),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

function parseActiveKeyVersion(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error("Active key version must be a positive integer");
  }

  const version = Number(value);
  if (!Number.isSafeInteger(version)) {
    throw new Error("Active key version must be a positive integer");
  }

  return version;
}

function parseMasterKeys(value: string | undefined): Map<number, Buffer> {
  if (!value) {
    throw new Error("Credential master keys are required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Credential master keys must be a JSON object");
  }

  if (!isStringRecord(parsed)) {
    throw new Error("Credential master keys must be a JSON object");
  }

  const keys = new Map<number, Buffer>();
  for (const [rawVersion, encodedKey] of Object.entries(parsed)) {
    if (!/^[1-9]\d*$/.test(rawVersion)) {
      throw new Error("Credential key versions must be positive integers");
    }

    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version)) {
      throw new Error("Credential key versions must be positive integers");
    }

    const key = decodeBase64Key(encodedKey);
    if (key.length !== KEY_LENGTH) {
      throw new Error("Credential master keys must decode to exactly 32 bytes");
    }

    keys.set(version, key);
  }

  return keys;
}

function decodeBase64Key(encodedKey: string): Buffer {
  if (
    encodedKey.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encodedKey,
    )
  ) {
    throw new Error("Credential master keys must be valid base64");
  }

  return Buffer.from(encodedKey, "base64");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}
