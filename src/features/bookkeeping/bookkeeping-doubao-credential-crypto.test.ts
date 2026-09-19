import { describe, expect, it } from "vitest";
import {
  createCredentialKeyring,
  type EncryptedCredential,
} from "./bookkeeping-doubao-credential-crypto";

const KEY_1 = Buffer.alloc(32, 1).toString("base64");
const KEY_2 = Buffer.alloc(32, 2).toString("base64");

function credentialEnv(
  activeKeyVersion = "1",
  keys: Record<string, string> = { "1": KEY_1 },
): NodeJS.ProcessEnv {
  return {
    BOOKKEEPING_CREDENTIAL_ACTIVE_KEY_VERSION: activeKeyVersion,
    BOOKKEEPING_CREDENTIAL_MASTER_KEYS: JSON.stringify(keys),
  };
}

describe("bookkeeping Doubao credential crypto", () => {
  it("encrypts and decrypts a credential with AES-256-GCM metadata", () => {
    const keyring = createCredentialKeyring(credentialEnv());

    const encrypted = keyring.encrypt("doubao-test-凭据");

    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.tag).toHaveLength(16);
    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.ciphertext.equals(Buffer.from("doubao-test-凭据"))).toBe(
      false,
    );
    expect(keyring.decrypt(encrypted)).toBe("doubao-test-凭据");
  });

  it("uses a fresh random nonce for every encryption", () => {
    const keyring = createCredentialKeyring(credentialEnv());

    const first = keyring.encrypt("same credential");
    const second = keyring.encrypt("same credential");

    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it.each(["ciphertext", "nonce", "tag"] as const)(
    "rejects a tampered %s",
    (field) => {
      const keyring = createCredentialKeyring(credentialEnv());
      const encrypted = keyring.encrypt("credential");
      const tampered: EncryptedCredential = {
        ...encrypted,
        [field]: Buffer.from(encrypted[field]),
      };
      tampered[field][0] ^= 1;

      expect(() => keyring.decrypt(tampered)).toThrow();
    },
  );

  it("rejects ciphertext encrypted with an unavailable key version", () => {
    const keyring = createCredentialKeyring(credentialEnv());
    const encrypted = keyring.encrypt("credential");

    expect(() =>
      keyring.decrypt({ ...encrypted, keyVersion: 2 }),
    ).toThrow(/key version/i);
  });

  it("requires an active key version that exists in the key map", () => {
    expect(() =>
      createCredentialKeyring({
        BOOKKEEPING_CREDENTIAL_MASTER_KEYS: JSON.stringify({ "1": KEY_1 }),
      }),
    ).toThrow(/active key version/i);

    expect(() => createCredentialKeyring(credentialEnv("2"))).toThrow(
      /key version/i,
    );
  });

  it("rejects master keys that are not exactly 32 bytes", () => {
    const shortKey = Buffer.alloc(31, 1).toString("base64");

    expect(() =>
      createCredentialKeyring(credentialEnv("1", { "1": shortKey })),
    ).toThrow(/32 bytes/i);
  });

  it("decrypts an old version while encrypting with the active new version", () => {
    const oldKeyring = createCredentialKeyring(credentialEnv());
    const oldEncrypted = oldKeyring.encrypt("credential");
    const rotatedKeyring = createCredentialKeyring(
      credentialEnv("2", { "1": KEY_1, "2": KEY_2 }),
    );

    expect(rotatedKeyring.decrypt(oldEncrypted)).toBe("credential");
    expect(rotatedKeyring.encrypt("credential").keyVersion).toBe(2);
  });
});
