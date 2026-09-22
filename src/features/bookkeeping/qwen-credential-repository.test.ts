import { describe, expect, it } from "vitest";

import { createPostgresQwenCredentialRepository } from "./qwen-credential-repository";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";

describe("PostgreSQL Qwen credential repository", () => {
  it("holds a transaction-scoped advisory lock on the same client as user mutations", async () => {
    const rootQueries: string[] = [];
    const transactionQueries: string[] = [];
    let commits = 0;
    const transactionClient: PostgresQueryClient = {
      query: async <Row = unknown>(text: string) => {
        transactionQueries.push(text);
        if (text.startsWith("delete")) return { rows: [{ user_id: "user-a" } as Row] };
        return { rows: [] as Row[] };
      },
    };
    const rootClient: PostgresQueryClient = {
      query: async (text) => { rootQueries.push(text); return { rows: [] }; },
      transaction: async (operation) => {
        const result = await operation(transactionClient);
        commits += 1;
        return result;
      },
    };
    const repository = createPostgresQwenCredentialRepository(rootClient);

    await expect(repository.withUserMutationLock?.("user-a", (locked) => locked.deleteForTrustedServerUser("user-a")))
      .resolves.toBe(true);

    expect(transactionQueries[0]).toContain("pg_advisory_xact_lock");
    expect(transactionQueries[0]).toContain("hashtextextended");
    expect(transactionQueries[1]).toContain("delete from bookkeeping_qwen_credentials");
    expect(rootQueries).toEqual([]);
    expect(commits).toBe(1);
  });
});
