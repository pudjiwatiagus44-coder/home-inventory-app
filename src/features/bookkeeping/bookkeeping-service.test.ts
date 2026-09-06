import { describe, expect, it } from "vitest";
import { createBookkeepingSyncService } from "./bookkeeping-service";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type { BookkeepingOperation } from "./bookkeeping-types";

/**
 * 可编程 fake PG client：接收一个按 SQL 片段返回行集的处理器表。
 */
function makeClient(config: {
  rowsByContains: Array<{ contains: string; rows: Record<string, unknown>[] }>;
}): PostgresQueryClient & { calls: string[]; callValues: unknown[][] } {
  const calls: string[] = [];
  const callValues: unknown[][] = [];
  return {
    calls,
    callValues,
    async query<Row>(text: string, values?: unknown[]): Promise<{ rows: Row[] }> {
      calls.push(text);
      callValues.push(values ?? []);
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
    const client = makeClient({ rowsByContains: [{ contains: "select id, deleted_at", rows: [{ id: "tx-purge", deleted_at: "2026-09-01T00:00:00Z" }] }, { contains: "permanently_deleted=false", rows: [{ server_id: "tx-purge" }] }, { contains: "delete from bookkeeping_transactions", rows: [{ id: "tx-purge" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const purgeOp = { op: "PURGE", entityType: "transaction", localId: "purge-1", serverId: "tx-purge" } as unknown as BookkeepingOperation;

    const result = await svc.syncForCurrentUser({ userId: "uid-purge", operations: [purgeOp], since: null });

    expect(result.data.results[0].status).toBe("applied");
    expect(client.calls.some((sql) => sql.includes("delete from bookkeeping_transactions"))).toBe(true);
    expect(client.calls.some((sql) => sql.includes("bookkeeping_delete_tombstones"))).toBe(true);
    expect(client.calls).toContain("begin");
    expect(client.calls).toContain("commit");
    expect(client.calls.some((sql) => sql.includes("account_id=$2::uuid") && sql.includes("deleted_at is not null"))).toBe(true);
  });

  it("永久删除墓碑会拒绝旧 UPSERT，防止交易复活", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "bookkeeping_delete_tombstones", rows: [{ server_id: "tx-purged" }] }] });
    const svc = createBookkeepingSyncService({ client });

    const result = await svc.syncForCurrentUser({ userId: "uid-no-resurrection", operations: [upsertOp({ serverId: "tx-purged" })], since: null });

    expect(result.data.results[0]).toMatchObject({ status: "rejected", reason: "permanently_deleted" });
    expect(client.calls.some((sql) => sql.includes("insert into bookkeeping_transactions"))).toBe(false);
  });

  it("PURGE 找不到当前账号的交易时 rejected，且不执行物理删除", async () => {
    const client = makeClient({ rowsByContains: [] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-other", operations: [{ op: "PURGE", entityType: "transaction", localId: "p", serverId: "tx-other" }], since: null });
    expect(result.data.results[0]).toMatchObject({ status: "rejected", reason: "not_found_or_not_deleted" });
    expect(client.calls.some((sql) => sql.startsWith("delete from bookkeeping_transactions"))).toBe(false);
  });

  it("PURGE 仅允许已软删除交易，并使用当前账号参数", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "select id, deleted_at", rows: [{ id: "tx-soft", deleted_at: "2026-09-01T00:00:00Z" }] }, { contains: "permanently_deleted=false", rows: [{ server_id: "tx-soft", account_id: "acct-default", permanently_deleted: false }] }, { contains: "delete from bookkeeping_transactions", rows: [{ id: "tx-soft" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-purge-check", operations: [{ op: "PURGE", entityType: "transaction", localId: "p", serverId: "tx-soft" }], since: null });
    expect(result.data.results[0].status).toBe("applied");
    expect(client.callValues.some((values) => values.includes("acct-default") && values.includes("tx-soft"))).toBe(true);
  });

  it("已有永久墓碑的重复 PURGE 幂等 applied，并可再次消费墓碑变更", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "permanently_deleted=true", rows: [{ server_id: "tx-purged" }] }, { contains: "select server_id, deleted_at, updated_at", rows: [{ server_id: "tx-purged", updated_at: "2026-09-02T00:00:00Z" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-repeat", operations: [{ op: "PURGE", entityType: "transaction", localId: "p", serverId: "tx-purged" }], since: null });
    expect(result.data.results[0].status).toBe("applied");
    expect(result.data.changes).toContainEqual(expect.objectContaining({ serverId: "tx-purged", deleted: true, payload: null }));
    expect(client.calls.some((sql) => sql.startsWith("delete from bookkeeping_transactions"))).toBe(false);
  });

  it("跨账号 DELETE 和恢复都 rejected，并携带账号隔离参数", async () => {
    const client = makeClient({ rowsByContains: [] });
    const svc = createBookkeepingSyncService({ client });
    const deleteResult = await svc.syncForCurrentUser({ userId: "uid-cross", operations: [{ op: "DELETE", entityType: "transaction", localId: "d", serverId: "tx-owned-by-other" }], since: null });
    const restoreResult = await svc.syncForCurrentUser({ userId: "uid-cross", operations: [upsertOp({ localId: "r", serverId: "tx-owned-by-other" })], since: null });
    expect(deleteResult.data.results[0]).toMatchObject({ status: "rejected", reason: "not_found" });
    expect(restoreResult.data.results[0].status).toBe("applied");
    expect(client.callValues.some((values) => values.includes("acct-default") && values.includes("tx-owned-by-other"))).toBe(true);
  });

  it("永久删除墓碑出现在 pullChanges 增量中且不包含账单正文", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "select server_id, deleted_at, updated_at", rows: [{ server_id: "tx-purged", updated_at: "2026-09-01T00:00:00Z" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-pull", operations: [], since: null });
    expect(result.data.changes).toContainEqual({ entityType: "transaction", serverId: "tx-purged", deleted: true, payload: null, serverUpdatedAt: "2026-09-01T00:00:00Z" });
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

  it("客户端提供的不存在 serverId 不得被当作新交易插入", async () => {
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

    expect(client.calls.some((sql) => sql.includes("insert into bookkeeping_transactions"))).toBe(true);
    expect(result.data.results).toEqual([
      {
        localId: "42",
        serverId: "11111111-1111-4111-8111-111111111111",
        entityType: "transaction",
        status: "applied",
      },
    ]);
  });

  it("已属于其他账号的 serverId 在 UPSERT/恢复时 rejected 且不插入", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "select id, account_id from bookkeeping_transactions", rows: [{ id: "tx-owned", account_id: "acct-other" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-current", operations: [upsertOp({ localId: "u", serverId: "tx-owned" }), upsertOp({ localId: "r", serverId: "tx-owned" })], since: null });
    expect(result.data.results).toEqual([
      expect.objectContaining({ localId: "u", status: "rejected", reason: "server_id_owned_by_other_account" }),
      expect.objectContaining({ localId: "r", status: "rejected", reason: "server_id_owned_by_other_account" }),
    ]);
    expect(client.calls.some((sql) => sql.includes("insert into bookkeeping_transactions"))).toBe(false);
  });

  it("全新 serverId 仍能插入并 applied", async () => {
    const client = makeClient({ rowsByContains: [] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-new", operations: [upsertOp({ serverId: "tx-new" })], since: null });
    expect(result.data.results[0].status).toBe("applied");
    expect(client.calls.some((sql) => sql.includes("insert into bookkeeping_transactions") && sql.includes("id, account_id"))).toBe(true);
  });

  it("PURGE 缺少普通删除墓碑时 rejected，即使交易已软删除", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "select id, deleted_at", rows: [{ id: "tx-no-tombstone", deleted_at: "2026-09-01T00:00:00Z" }] }] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-purge-no-tombstone", operations: [{ op: "PURGE", entityType: "transaction", localId: "p", serverId: "tx-no-tombstone" }], since: null });
    expect(result.data.results[0]).toMatchObject({ status: "rejected", reason: "not_found_or_not_deleted" });
  });

  it("仅存在其他账号永久墓碑的 serverId 在 UPSERT/恢复时 rejected 且不插入", async () => {
    const client = makeClient({ rowsByContains: [{ contains: "entity_type='transaction' and server_id=$1::uuid", rows: [{ account_id: "acct-other", permanently_deleted: true }] }] });
    const svc = createBookkeepingSyncService({ client });
    const result = await svc.syncForCurrentUser({ userId: "uid-permanent-other", operations: [upsertOp({ serverId: "tx-permanent-other" })], since: null });
    expect(result.data.results[0]).toMatchObject({ status: "rejected", reason: "server_id_owned_by_other_account" });
    expect(client.calls.some((sql) => sql.includes("insert into bookkeeping_transactions"))).toBe(false);
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
