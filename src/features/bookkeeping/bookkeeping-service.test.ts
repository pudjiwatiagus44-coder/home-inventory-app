import { describe, expect, it } from "vitest";
import { createBookkeepingSyncService } from "./bookkeeping-service";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type { BookkeepingOperation } from "./bookkeeping-types";

/**
 * 可编程 fake PG client：接收一个按 SQL 片段返回行集的处理器表。
 */
function makeClient(config: {
  rowsByContains: Array<{ contains: string; rows: Record<string, unknown>[] }>;
}): PostgresQueryClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query<Row>(text: string, values?: unknown[]): Promise<{ rows: Row[] }> {
      calls.push(text);
      // 默认处理"查找/创建账本"，返回固定 account，避免插入路径依赖
      if (text.includes("select id from bookkeeping_accounts where user_id")) {
        return { rows: [{ id: "acct-default" }] as Row[] };
      }
      if (text.includes("insert into bookkeeping_accounts")) {
        return { rows: [{ id: "acct-default" }] as Row[] };
      }
      for (const cfg of config.rowsByContains) {
        if (text.includes(cfg.contains)) {
          return { rows: cfg.rows as Row[] };
        }
      }
      return { rows: [] };
    },
  };
}

const upsertOp = (overrides: Partial<BookkeepingOperation> = {}): BookkeepingOperation => ({
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
});

const categoryUpsertOp = (overrides: Partial<BookkeepingOperation> = {}): BookkeepingOperation => ({
  op: "UPSERT",
  entityType: "category",
  localId: "category-local-1",
  serverId: "22222222-2222-4222-8222-222222222222",
  categoryPayload: {
    categoryId: "22222222-2222-4222-8222-222222222222",
    name: "早餐",
    type: "Expense",
    keywords: "早餐,早饭",
    isBuiltin: true,
    isActive: true,
  },
  ...overrides,
});

describe("bookkeeping sync service", () => {
  it("当前账号 DELETE 会软删并写入删除墓碑，重复 DELETE 仍幂等 applied", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "returning id", rows: [{ id: "tx-delete" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const deleteOp = { op: "DELETE", entityType: "transaction", localId: "delete-1", serverId: "tx-delete" } as BookkeepingOperation;

    const result = await svc.syncForCurrentUser({ userId: "uid-delete", operations: [deleteOp, deleteOp], since: null });

    expect(result.data.results.map((item) => item.status)).toEqual(["applied", "applied"]);
    expect(client.calls.some((sql) => sql.includes("bookkeeping_delete_tombstones"))).toBe(true);
  });

  it("UPSERT 恢复已删除交易时会清除墓碑并清除 deleted_at", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "select updated_at from bookkeeping_transactions", rows: [{ updated_at: "2026-09-01T00:00:00Z" }] }] });
    const svc = createBookkeepingSyncService({ client });

    await svc.syncForCurrentUser({ userId: "uid-restore", operations: [upsertOp({ serverId: "tx-restore" })], since: null });

    expect(client.calls.some((sql) => sql.includes("delete from bookkeeping_delete_tombstones"))).toBe(true);
  });

  it("永久删除会物理删除交易并保留永久删除墓碑", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "bookkeeping_transactions", rows: [{ id: "tx-purge" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const purgeOp = { op: "PURGE", entityType: "transaction", localId: "purge-1", serverId: "tx-purge" } as unknown as BookkeepingOperation;

    const result = await svc.syncForCurrentUser({ userId: "uid-purge", operations: [purgeOp], since: null });

    expect(result.data.results[0].status).toBe("applied");
    expect(client.calls.some((sql) => sql.includes("delete from bookkeeping_transactions"))).toBe(true);
    expect(client.calls.some((sql) => sql.includes("bookkeeping_delete_tombstones"))).toBe(true);
  });

  it("永久删除墓碑会拒绝旧 UPSERT，防止交易复活", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "bookkeeping_delete_tombstones", rows: [{ server_id: "tx-purged" }] }] });
    const svc = createBookkeepingSyncService({ client });

    const result = await svc.syncForCurrentUser({ userId: "uid-no-resurrection", operations: [upsertOp({ serverId: "tx-purged" })], since: null });

    expect(result.data.results[0]).toMatchObject({ status: "rejected", reason: "permanently_deleted" });
    expect(client.calls.some((sql) => sql.includes("insert into bookkeeping_transactions"))).toBe(false);
  });

  it("accountBelongsToUser 在账号归属当前用户时返回 true", async () => {
    const client = makeClient({
      rowsByContains: [
        {
          contains: "and user_id = $2",
          rows: [{ id: "acct-default" }],
        },
      ],
    });
    const svc = createBookkeepingSyncService({ client });
    const owned = await svc.accountBelongsToUser("acct-1", "uid-1");
    expect(owned).toBe(true);
  });

  it("accountBelongsToUser 在账号不归属当前用户时返回 false", async () => {
    const client = makeClient({ rowsByContains: [] });
    const svc = createBookkeepingSyncService({ client });
    const owned = await svc.accountBelongsToUser("acct-other", "uid-x");
    expect(owned).toBe(false);
  });

  it("复用已有账本并同步新增交易", async () => {
    const client = makeClient({
      rowsByContains: [],
    });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({
      userId: "uid-1",
      operations: [upsertOp()],
      since: null,
    });

    expect(result.accountId).toBe("acct-default");
    // ensureAccountId 会先 select 已存在账号
    const selectCalls = client.calls.filter((c) =>
      c.includes("select id from bookkeeping_accounts where user_id"),
    );
    expect(selectCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("客户端提供的新交易 UUID 不存在时按该 UUID 插入并返回 applied", async () => {
    const client = makeClient({ rowsByContains: [] });
    const svc = createBookkeepingSyncService({ client });

    const result = await svc.syncForCurrentUser({
      userId: "uid-new-id",
      operations: [
        upsertOp({
          serverId: "11111111-1111-4111-8111-111111111111",
        }),
      ],
      since: null,
    });

    expect(
      client.calls.some(
        (sql) =>
          sql.includes("insert into bookkeeping_transactions") &&
          sql.includes("id, account_id"),
      ),
    ).toBe(true);
    expect(result.data.results).toEqual([
      {
        localId: "42",
        serverId: "11111111-1111-4111-8111-111111111111",
        entityType: "transaction",
        status: "applied",
      },
    ]);
  });

  it("服务器更新于本地时返回 conflict", async () => {
    const client = makeClient({
      rowsByContains: [
        {
          contains: "select updated_at from bookkeeping_transactions",
          rows: [{ updated_at: "2026-08-22T11:00:00Z" }],
        },
      ],
    });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({
      userId: "uid-2",
      operations: [
        upsertOp({
          serverId: "tx-server-1",
          baseUpdatedAt: "2026-08-22T09:00:00Z", // 早于服务器 11:00 => 服务器较新
        }),
      ],
      since: null,
    });

    expect(result.data.conflicts).toHaveLength(1);
    expect(result.data.conflicts[0].entityType).toBe("transaction");
    expect(result.data.conflicts[0].serverId).toBe("tx-server-1");
  });

  it("本地更新于服务器时不返回 conflict（后改覆盖）", async () => {
    const client = makeClient({
      rowsByContains: [
        {
          contains: "select updated_at from bookkeeping_transactions",
          rows: [{ updated_at: "2026-08-22T08:00:00Z" }],
        },
      ],
    });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({
      userId: "uid-3",
      operations: [
        upsertOp({
          serverId: "tx-server-2",
          baseUpdatedAt: "2026-08-22T09:00:00Z", // 晚于服务器 08:00 => 本地较新，覆盖
        }),
      ],
      since: null,
    });

    expect(result.data.conflicts).toHaveLength(0);
    expect(result.data.results).toEqual([
      {
        localId: "42",
        serverId: "tx-server-2",
        entityType: "transaction",
        status: "applied",
      },
    ]);
    expect(
      client.calls.some((sql) => sql.includes("update bookkeeping_transactions set")),
    ).toBe(true);
    expect(
      client.calls.some(
        (sql) =>
          sql.includes("insert into bookkeeping_transactions") &&
          sql.includes("id, account_id"),
      ),
    ).toBe(false);
  });

  it("交易 UPSERT 缺少 payload 时返回 rejected", async () => {
    const client = makeClient({ rowsByContains: [] });
    const svc = createBookkeepingSyncService({ client });

    const result = await svc.syncForCurrentUser({
      userId: "uid-rejected",
      operations: [
        {
          op: "UPSERT",
          entityType: "transaction",
          localId: "99",
          serverId: "99999999-9999-4999-8999-999999999999",
        },
      ],
      since: null,
    });

    expect(result.data.results).toEqual([
      {
        localId: "99",
        serverId: "99999999-9999-4999-8999-999999999999",
        entityType: "transaction",
        status: "rejected",
        reason: "missing_payload",
      },
    ]);
  });

  it("分类 UUID 不存在但同账号已有同名分类时复用已有服务器 ID", async () => {
    const existingServerId = "33333333-3333-4333-8333-333333333333";
    const client = makeClient({
      rowsByContains: [
        {
          contains: "where account_id = $1::uuid and name = $2",
          rows: [{ id: existingServerId, updated_at: "2026-08-30T10:00:00Z" }],
        },
      ],
    });
    const svc = createBookkeepingSyncService({ client });

    const result = await svc.syncForCurrentUser({
      userId: "uid-category-merge",
      operations: [categoryUpsertOp()],
      since: null,
    });

    expect(result.data.results).toEqual([
      {
        localId: "category-local-1",
        serverId: existingServerId,
        entityType: "category",
        status: "applied",
      },
    ]);
    expect(
      client.calls.some((sql) => sql.includes("update bookkeeping_categories set")),
    ).toBe(true);
    expect(
      client.calls.some((sql) => sql.includes("insert into bookkeeping_categories")),
    ).toBe(false);
  });
});
