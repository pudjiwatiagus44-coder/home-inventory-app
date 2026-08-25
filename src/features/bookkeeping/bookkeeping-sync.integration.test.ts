import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAuthService } from "../../server/auth/auth-service";
import { createPostgresAuthRepository } from "../../server/auth/postgres-auth-repository";
import { getPostgresIntegrationConfig } from "../../server/db/postgres-integration-config";
import { createBookkeepingSyncService } from "./bookkeeping-service";
import type { BookkeepingOperation } from "./bookkeeping-types";

const integrationConfig = getPostgresIntegrationConfig();

type IntegrationQueryResult<Row = unknown> = { rows: Row[] };
type IntegrationPool = {
  query: <Row = unknown>(
    text: string,
    values?: unknown[],
  ) => Promise<IntegrationQueryResult<Row>>;
  end: () => Promise<void>;
};

function txnOp(overrides: Partial<BookkeepingOperation> = {}): BookkeepingOperation {
  return {
    op: "UPSERT",
    entityType: "transaction",
    localId: "42",
    payload: {
      amount: "32.50",
      direction: "Expense",
      currency: "人民币",
      merchant: "拼多多",
      description: "日用品",
      transactionTime: "2026-08-22T10:00:00Z",
      source: "Manual",
      status: "ManualEdited",
      payerPayee: "",
      account: "",
      participant: "",
      tag: "",
      property: "",
      categoryName: "购物",
    },
    ...overrides,
  };
}

describe("PostgreSQL bookkeeping sync integration", () => {
  let pool: IntegrationPool | null = null;

  beforeAll(async () => {
    if (!integrationConfig.enabled) {
      return;
    }

    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: integrationConfig.connectionString });

    const main = await readFile(
      path.join(process.cwd(), "dev-docs/sql/mainland_initial_schema.sql"),
      "utf8",
    );
    const bookkeeping = await readFile(
      path.join(process.cwd(), "dev-docs/sql/bookkeeping_sync_self_hosted.sql"),
      "utf8",
    );

    await pool.query("drop schema public cascade");
    await pool.query("create schema public");
    await pool.query(main);
    await pool.query(bookkeeping);
  });

  afterAll(async () => {
    await pool?.end();
  });

  test.skipIf(!integrationConfig.enabled)(
    "同步新增交易并按 user 隔离（A 可见、B 不可见）",
    async () => {
      if (!pool) {
        throw new Error("PostgreSQL integration pool was not initialized");
      }

      const authService = createAuthService({
        repository: createPostgresAuthRepository(pool),
        hashPassword: async (password) => `hash:${password}`,
        verifyPassword: async (password, passwordHash) =>
          passwordHash === `hash:${password}`,
        createSessionToken: createTokenSequence([
          "a-token",
          "b-token",
        ]),
        hashSessionToken: (token) => `hashed:${token}`,
        createSessionExpiry: () => new Date("2030-01-01T00:00:00.000Z"),
      });
      const service = createBookkeepingSyncService({ client: pool as never });

      const userA = await authService.register({
        email: "bk-a@example.com",
        password: "valid-password",
      });
      const userB = await authService.register({
        email: "bk-b@example.com",
        password: "valid-password",
      });

      // A 上传一笔新交易
      const resultA = await service.syncForCurrentUser({
        userId: userA.userId,
        operations: [txnOp()],
        since: null,
      });
      expect(resultA.accountId).toBeTruthy();

      // A 再拉一次增量应包含刚才那笔（非软删）
      const pullA = await service.syncForCurrentUser({
        userId: userA.userId,
        operations: [],
        since: null,
      });
      const tx = pullA.data.changes.find(
        (c) => c.entityType === "transaction" && !c.deleted,
      );
      expect(tx).toBeDefined();
      expect(tx?.payload?.amount).toBe("32.50");

      // B 拉取自己的增量：不应看到 A 的数据（隔离负例）
      const pullB = await service.syncForCurrentUser({
        userId: userB.userId,
        operations: [],
        since: null,
      });
      expect(pullB.data.changes.filter((c) => c.entityType === "transaction"))
        .toHaveLength(0);
    },
  );

  test.skipIf(integrationConfig.enabled)(
    `skips until ${integrationConfig.enabled ? "" : integrationConfig.reason}`,
    () => {
      expect(integrationConfig.enabled).toBe(false);
    },
  );
});

function createTokenSequence(tokens: string[]) {
  return () => tokens.shift() ?? "unexpected-token";
}
