import { describe, expect, it, vi } from "vitest";

import { createPostgresDeepSeekCredentialRepository } from "./deepseek-credential-repository";

function client(rows: unknown[][] = []) {
  let index = 0;
  const query = vi.fn(async () => ({ rows: rows[index++] ?? [] }));
  return { client: { query }, query };
}

const row = {
  ciphertext: Buffer.from("encrypted"), nonce: Buffer.alloc(12), authentication_tag: Buffer.alloc(16),
  key_version: 1, last_four: "1234", last_verified_at: null,
};

describe("Postgres DeepSeek credential repository", () => {
  it("loads and writes only through the server-trusted user scope", async () => {
    const db = client([[row], [row]]);
    const repository = createPostgresDeepSeekCredentialRepository(db.client);
    await repository.findForTrustedServerUser("user-a");
    await repository.saveForTrustedServerUser("user-a", {
      ciphertext: Buffer.from("encrypted"), nonce: Buffer.alloc(12), tag: Buffer.alloc(16),
      keyVersion: 1, lastFour: "1234", lastVerifiedAt: null,
    });

    for (const [sql, values] of db.query.mock.calls) {
      expect(sql).toMatch(/bookkeeping_deepseek_credentials/i);
      expect(sql).toMatch(/user_id\s*(?:=|,|\)\s*values\s*\(\$1)/i);
      expect(values?.[0]).toBe("user-a");
    }
  });

  it("physically deletes only the authenticated user's row", async () => {
    const db = client([[{ user_id: "user-a" }]]);
    const repository = createPostgresDeepSeekCredentialRepository(db.client);
    await expect(repository.deleteForTrustedServerUser("user-a")).resolves.toBe(true);
    const [sql, values] = db.query.mock.calls[0]!;
    expect(sql).toMatch(/delete\s+from\s+bookkeeping_deepseek_credentials/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(values).toEqual(["user-a"]);
  });
});
