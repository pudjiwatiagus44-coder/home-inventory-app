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
    findForUser: vi.fn(async (userId: string) => rows.get(userId) ?? null),
    saveForUser: vi.fn(async (userId: string, record: StoredDeepSeekCredential) => {
      rows.set(userId, record);
      return record;
    }),
    deleteForUser: vi.fn(async (userId: string) => rows.delete(userId)),
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
      lastVerifiedAt: "2026-09-21T08:00:00.000Z",
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
      lastVerifiedAt: "2026-09-21T08:00:00.000Z",
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
});
