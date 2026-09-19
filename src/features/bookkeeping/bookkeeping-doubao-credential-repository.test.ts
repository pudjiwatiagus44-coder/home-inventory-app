import { describe, expect, it, vi } from "vitest";

import { createPostgresBookkeepingDoubaoCredentialRepository } from "./bookkeeping-doubao-credential-repository";

function makeClient(rowsByCall: unknown[][] = []) {
  let callIndex = 0;
  const query = vi.fn(async () => ({ rows: rowsByCall[callIndex++] ?? [] }));
  return { client: { query }, query };
}

const storedRow = {
  encrypted_api_key: Buffer.from("ciphertext"),
  encryption_nonce: Buffer.alloc(12, 1),
  encryption_tag: Buffer.alloc(16, 2),
  key_version: 3,
  enabled: true,
  status: "ACTIVE" as const,
  last_four: "1234",
  last_verified_at: new Date("2026-09-12T01:02:03.000Z"),
  last_success_at: "2026-09-12T01:02:03.000Z",
  last_error_code: null,
};

describe("PostgresBookkeepingDoubaoCredentialRepository", () => {
  it("loads a credential only through the current user's bookkeeping account", async () => {
    const { client, query } = makeClient([[storedRow]]);
    const repository = createPostgresBookkeepingDoubaoCredentialRepository(client);

    await expect(repository.findForUser("user-a")).resolves.toMatchObject({
      encryptedApiKey: storedRow.encrypted_api_key,
      keyVersion: 3,
      enabled: true,
      status: "ACTIVE",
      lastFour: "1234",
      lastVerifiedAt: "2026-09-12T01:02:03.000Z",
    });

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/join\s+bookkeeping_accounts/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(values).toEqual(["user-a"]);
  });

  it("upserts only encrypted material into the account selected by user_id", async () => {
    const { client, query } = makeClient([[storedRow]]);
    const repository = createPostgresBookkeepingDoubaoCredentialRepository(client);
    const encrypted = {
      ciphertext: Buffer.from("encrypted-only"),
      nonce: Buffer.alloc(12, 4),
      tag: Buffer.alloc(16, 5),
      keyVersion: 2,
    };

    await repository.saveValidatedForUser("user-a", {
      encrypted,
      lastFour: "9876",
    });

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/insert\s+into\s+bookkeeping_doubao_credentials/i);
    expect(sql).toMatch(/select\s+id/i);
    expect(sql).toMatch(/from\s+bookkeeping_accounts/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(values).toEqual([
      "user-a",
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.tag,
      2,
      "9876",
    ]);
    expect(values).not.toContain("ark-plaintext-secret");
  });

  it("disables a configured credential without deleting it", async () => {
    const { client, query } = makeClient([[{ ...storedRow, enabled: false }]]);
    const repository = createPostgresBookkeepingDoubaoCredentialRepository(client);

    await repository.setEnabledForUser("user-a", false);

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/update\s+bookkeeping_doubao_credentials/i);
    expect(sql).toMatch(/from\s+bookkeeping_accounts/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(values).toEqual(["user-a", false]);
  });

  it("records provider health only for the current user's credential", async () => {
    const { client, query } = makeClient([[]]);
    const repository = createPostgresBookkeepingDoubaoCredentialRepository(client);

    await repository.recordFailureForUser(
      "user-b",
      "2026-09-12T01:02:03.000Z",
      "QUOTA_EXHAUSTED",
      "rate_limit",
    );

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/update\s+bookkeeping_doubao_credentials/i);
    expect(sql).toMatch(/from\s+bookkeeping_accounts/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(sql).toMatch(/last_verified_at\s*=\s*\$2/i);
    expect(sql).toMatch(/enabled\s*=\s*true/i);
    expect(sql).not.toMatch(/enabled\s*=\s*false/i);
    expect(values).toEqual([
      "user-b",
      "2026-09-12T01:02:03.000Z",
      "QUOTA_EXHAUSTED",
      "rate_limit",
    ]);
  });

  it("records provider success only for the matching enabled credential revision", async () => {
    const { client, query } = makeClient([[{ account_id: "account-a" }]]);
    const repository = createPostgresBookkeepingDoubaoCredentialRepository(client);

    await expect(
      repository.recordSuccessForUser(
        "user-a",
        "2026-09-12T01:02:03.000Z",
      ),
    ).resolves.toBe(true);

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/status\s*=\s*'ACTIVE'/i);
    expect(sql).toMatch(/last_error_code\s*=\s*null/i);
    expect(sql).toMatch(/last_success_at\s*=\s*now\(\)/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(sql).toMatch(/last_verified_at\s*=\s*\$2/i);
    expect(sql).toMatch(/enabled\s*=\s*true/i);
    expect(values).toEqual(["user-a", "2026-09-12T01:02:03.000Z"]);
  });

  it("physically deletes by user_id and is idempotent", async () => {
    const { client, query } = makeClient([[{ account_id: "account-a" }], []]);
    const repository = createPostgresBookkeepingDoubaoCredentialRepository(client);

    await expect(repository.deleteForUser("user-a")).resolves.toBe(true);
    await expect(repository.deleteForUser("user-a")).resolves.toBe(false);

    for (const [sql, values] of query.mock.calls) {
      expect(sql).toMatch(/delete\s+from\s+bookkeeping_doubao_credentials/i);
      expect(sql).toMatch(/using\s+bookkeeping_accounts/i);
      expect(sql).toMatch(/user_id\s*=\s*\$1/i);
      expect(values).toEqual(["user-a"]);
    }
  });
});
