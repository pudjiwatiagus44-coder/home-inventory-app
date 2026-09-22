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

  it("uses a locked PostgreSQL transaction for atomic rolling-window admission and release", async () => {
    const statements: string[] = [];
    let requestCount = 0;
    let activeCount = 0;
    const tx: PostgresQueryClient = {
      query: async <Row = unknown>(text: string) => {
        statements.push(text);
        if (text.includes("count(*)")) {
          return { rows: [{ request_count: requestCount, active_count: activeCount } as Row] };
        }
        if (text.startsWith("insert into bookkeeping_qwen_credential_rate_limits")) {
          requestCount += 1;
          activeCount += 1;
        }
        if (text.startsWith("update bookkeeping_qwen_credential_rate_limits")) activeCount -= 1;
        return { rows: [] as Row[] };
      },
    };
    const client: PostgresQueryClient = {
      query: async () => ({ rows: [] }),
      transaction: async (operation) => operation(tx),
    };
    const repository = createPostgresQwenCredentialRepository(client);

    await expect(repository.acquireValidationSlotForTrustedServerUser(
      "user-a", "request-a", "2026-09-23T01:00:00.000Z", 60_000, 2, 1,
    )).resolves.toBe(true);
    await repository.releaseValidationSlotForTrustedServerUser("user-a", "request-a", "2026-09-23T01:00:01.000Z");
    await expect(repository.acquireValidationSlotForTrustedServerUser(
      "user-a", "request-b", "2026-09-23T01:00:02.000Z", 60_000, 1, 1,
    )).resolves.toBe(false);

    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements[1]).toContain("delete from bookkeeping_qwen_credential_rate_limits");
    expect(statements[2]).toContain("count(*) filter");
    expect(statements[3]).toContain("insert into bookkeeping_qwen_credential_rate_limits");
    expect(statements[4]).toContain("pg_advisory_xact_lock");
    expect(statements[5]).toContain("update bookkeeping_qwen_credential_rate_limits");
    expect(requestCount).toBe(1);
    expect(activeCount).toBe(0);
    expect(statements.filter((statement) => statement.startsWith("insert into bookkeeping_qwen_credential_rate_limits"))).toHaveLength(1);
  });

  it("shares rolling-window and active-lease limits across repository workers", async () => {
    const sharedClient = createSharedRateLimitPostgresHarness();
    const workerA = createPostgresQwenCredentialRepository(sharedClient);
    const workerB = createPostgresQwenCredentialRepository(sharedClient);
    const input = { userId: "user-a", startedAt: "2026-09-23T01:00:00.000Z", windowMs: 60_000, maxRequests: 2, maxConcurrent: 1 };

    const admissions = await Promise.all([
      workerA.acquireValidationSlotForTrustedServerUser(input.userId, "request-a", input.startedAt, input.windowMs, input.maxRequests, input.maxConcurrent),
      workerB.acquireValidationSlotForTrustedServerUser(input.userId, "request-b", input.startedAt, input.windowMs, input.maxRequests, input.maxConcurrent),
    ]);
    expect(admissions.filter(Boolean)).toHaveLength(1);
    const firstRequest = admissions[0] ? "request-a" : "request-b";
    await workerA.releaseValidationSlotForTrustedServerUser(input.userId, firstRequest, "2026-09-23T01:00:01.000Z");

    await expect(workerB.acquireValidationSlotForTrustedServerUser(
      input.userId, "request-c", input.startedAt, input.windowMs, input.maxRequests, input.maxConcurrent,
    )).resolves.toBe(true);
    await workerB.releaseValidationSlotForTrustedServerUser(input.userId, "request-c", "2026-09-23T01:00:02.000Z");
    await expect(workerA.acquireValidationSlotForTrustedServerUser(
      input.userId, "request-d", input.startedAt, input.windowMs, input.maxRequests, input.maxConcurrent,
    )).resolves.toBe(false);
    await expect(workerA.acquireValidationSlotForTrustedServerUser(
      "user-b", "request-e", input.startedAt, input.windowMs, input.maxRequests, input.maxConcurrent,
    )).resolves.toBe(true);
  });
});

function createSharedRateLimitPostgresHarness(): PostgresQueryClient {
  const events = new Map<string, Array<{ requestId: string; startedAt: number; completedAt: number | null }>>();
  const lockTails = new Map<string, Promise<void>>();
  return {
    query: async () => ({ rows: [] }),
    transaction: async (operation) => {
      let releaseLock: () => void = () => undefined;
      const transactionClient: PostgresQueryClient = {
        query: async <Row = unknown>(text: string, values: unknown[] = []) => {
          if (text.includes("pg_advisory_xact_lock")) {
            const lockName = String(values[0]);
            const previous = lockTails.get(lockName) ?? Promise.resolve();
            let release!: () => void;
            const current = new Promise<void>((resolve) => { release = resolve; });
            lockTails.set(lockName, previous.then(() => current));
            await previous;
            releaseLock = release;
            return { rows: [] as Row[] };
          }
          if (text.startsWith("delete from bookkeeping_qwen_credential_rate_limits")) {
            const userId = String(values[0]);
            const cutoff = Date.parse(String(values[1])) - Number(values[2]);
            events.set(userId, (events.get(userId) ?? []).filter((event) => event.startedAt >= cutoff));
            return { rows: [] as Row[] };
          }
          if (text.includes("count(*) filter")) {
            const list = events.get(String(values[0])) ?? [];
            const counts = {
              request_count: list.length,
              active_count: list.filter((event) => event.completedAt === null && event.startedAt >= Date.parse(String(values[1])) - 2 * 60 * 1000).length,
            };
            return { rows: [counts as Row] };
          }
          if (text.startsWith("insert into bookkeeping_qwen_credential_rate_limits")) {
            const userId = String(values[0]);
            const list = events.get(userId) ?? [];
            list.push({ requestId: String(values[1]), startedAt: Date.parse(String(values[2])), completedAt: null });
            events.set(userId, list);
            return { rows: [] as Row[] };
          }
          if (text.startsWith("update bookkeeping_qwen_credential_rate_limits")) {
            const [userId, requestId, completedAt] = values.map(String);
            const event = events.get(userId)?.find((item) => item.requestId === requestId);
            if (event) event.completedAt = Date.parse(completedAt);
            return { rows: [] as Row[] };
          }
          throw new Error(`unexpected query: ${text}`);
        },
      };
      try {
        return await operation(transactionClient);
      } finally {
        releaseLock();
      }
    },
  };
}
