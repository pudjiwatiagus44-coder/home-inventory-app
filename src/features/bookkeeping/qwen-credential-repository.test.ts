import { describe, expect, it, vi } from "vitest";

import { createPostgresQwenCredentialRepository } from "./qwen-credential-repository";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";

function client(rows: unknown[][] = []) {
  let index = 0;
  const calls: Array<[string, unknown[] | undefined]> = [];
  const query = vi.fn(async <Row = unknown>(sql: string, values?: unknown[]) => {
    calls.push([sql, values]);
    return { rows: (rows[index++] ?? []) as Row[] };
  });
  return { client: { query: query as unknown as PostgresQueryClient["query"] }, query, calls };
}

const row = {
  ciphertext: Buffer.from("encrypted"),
  nonce: Buffer.alloc(12),
  authentication_tag: Buffer.alloc(16),
  key_version: 1,
  last_four: "1234",
  last_verified_at: null,
};

describe("Postgres Qwen credential repository", () => {
  it("reads and upserts only within the trusted user account scope", async () => {
    const db = client([[row], [row]]);
    const repository = createPostgresQwenCredentialRepository(db.client);
    await repository.findForTrustedServerUser("user-a");
    await repository.saveForTrustedServerUser("user-a", {
      ciphertext: Buffer.from("encrypted"), nonce: Buffer.alloc(12), tag: Buffer.alloc(16),
      keyVersion: 1, lastFour: "1234", lastVerifiedAt: null,
    });

    for (const [sql, values] of db.calls) {
      expect(sql).toMatch(/bookkeeping_qwen_credentials/i);
      expect(sql).toMatch(/user_id\s*(?:=|,|\)\s*values\s*\(\$1)/i);
      expect(values?.[0]).toBe("user-a");
    }
  });

  it("maps successful validation and physically deletes only that user", async () => {
    const db = client([[row], [{ user_id: "user-a" }]]);
    const repository = createPostgresQwenCredentialRepository(db.client);
    await repository.recordSuccessfulValidationForTrustedServerUser("user-a", "2026-09-23T01:00:00.000Z");
    await expect(repository.deleteForTrustedServerUser("user-a")).resolves.toBe(true);

    const [updateSql, updateValues] = db.calls[0]!;
    expect(updateSql).toMatch(/update\s+bookkeeping_qwen_credentials/i);
    expect(updateSql).toMatch(/where\s+user_id\s*=\s*\$1/i);
    expect(updateValues).toEqual(["user-a", "2026-09-23T01:00:00.000Z"]);
    const [deleteSql, deleteValues] = db.calls[1]!;
    expect(deleteSql).toMatch(/delete\s+from\s+bookkeeping_qwen_credentials/i);
    expect(deleteSql).toMatch(/where\s+user_id\s*=\s*\$1/i);
    expect(deleteValues).toEqual(["user-a"]);
  });
});
