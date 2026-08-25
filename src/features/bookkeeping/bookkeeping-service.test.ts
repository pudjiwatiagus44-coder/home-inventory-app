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

describe("bookkeeping sync service", () => {
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
  });
});
