/**
 * 一键记账 云同步：服务层 + PostgreSQL 存储。
 *
 * 只读写 bookkeeping_* 表，按 user_id 强制隔离（服务端权限，不只靠前端）。
 * 冲突规则：后改覆盖 —— 若更新的 baseUpdatedAt 早于服务端现有 updated_at，视为服务端较新，
 * 记入 conflicts 让客户端采纳服务器版本。
 */
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type {
  BookkeepingChange,
  BookkeepingConflict,
  BookkeepingOperation,
  BookkeepingSyncData,
  BookkeepingSyncRequest,
  BookkeepingTransactionPayload,
} from "./bookkeeping-types";

type BookkeepingServiceDeps = {
  client: PostgresQueryClient;
};

export class UserHasNoBookkeepingAccountError extends Error {
  constructor() {
    super("No bookkeeping account for current user");
    this.name = "UserHasNoBookkeepingAccountError";
  }
}

export class BookkeepingAccountNotOwnedError extends Error {
  constructor() {
    super("Bookkeeping account does not belong to current user");
    this.name = "BookkeepingAccountNotOwnedError";
  }
}

export function createBookkeepingSyncService({ client }: BookkeepingServiceDeps) {
  async function ensureAccountId(userId: string): Promise<string> {
    const existing = await client.query<{ id: string }>(
      `select id from bookkeeping_accounts where user_id = $1 limit 1`,
      [userId],
    );
    if (existing.rows[0]) {
      return existing.rows[0].id;
    }
    const created = await client.query<{ id: string }>(
      `insert into bookkeeping_accounts (user_id, name) values ($1, '默认账本') returning id`,
      [userId],
    );
    return created.rows[0].id;
  }

  async function accountBelongsToUser(
    accountId: string,
    userId: string,
  ): Promise<boolean> {
    const res = await client.query<{ id: string }>(
      `select id from bookkeeping_accounts where id = $1 and user_id = $2 limit 1`,
      [accountId, userId],
    );
    return res.rows.length > 0;
  }

  async function syncForCurrentUser(input: {
    userId: string;
    request?: BookkeepingSyncRequest;
    operations: BookkeepingOperation[];
    since?: string | null;
    accountId?: string | null;
  }): Promise<{
    accountId: string;
    data: BookkeepingSyncData;
  }> {
    const accountId = await ensureAccountId(input.userId);
    const now = new Date().toISOString();
    const conflicts: BookkeepingConflict[] = [];

    for (const op of input.operations) {
      await applyOperation(accountId, op, now, conflicts);
    }

    const changes: BookkeepingChange[] = await pullChanges(accountId, input.since ?? null);
    return { accountId, data: { cursor: now, changes, conflicts } };
  }

  async function applyOperation(
    accountId: string,
    op: BookkeepingOperation,
    now: string,
    conflicts: BookkeepingConflict[],
  ): Promise<void> {
    if (op.entityType === "transaction") {
      if (op.op === "DELETE") {
        await client.query(
          `update bookkeeping_transactions
             set deleted_at = coalesce(deleted_at, $3), updated_at = $2
             where id = $1::uuid and account_id = $4::uuid and deleted_at is null`,
          [op.serverId, now, now, accountId],
        );
        return;
      }
      const p = op.payload as BookkeepingTransactionPayload | undefined;
      if (!p) {
        return;
      }
      if (op.serverId) {
        const serverRow = await client.query<{ updated_at?: unknown }>(
          `select updated_at from bookkeeping_transactions where id = $1::uuid and account_id = $2::uuid`,
          [op.serverId, accountId],
        );
        const serverUpdatedAt = serverRow.rows[0];
        if (
          serverUpdatedAt &&
          op.baseUpdatedAt &&
          serverUpdatedAt.updated_at &&
          String(serverUpdatedAt.updated_at) > op.baseUpdatedAt
        ) {
          conflicts.push({
            localId: op.localId,
            serverId: op.serverId,
            entityType: "transaction",
            serverEntity: {
              transactionId: op.serverId,
              amount: p.amount,
              direction: p.direction,
              currency: p.currency,
              merchant: p.merchant,
              description: p.description,
              transactionTime: p.transactionTime,
              source: p.source,
              status: p.status,
              payerPayee: p.payerPayee,
              account: p.account,
              participant: p.participant,
              tag: p.tag,
              property: p.property,
              categoryName: p.categoryName,
              updatedAt: String(serverUpdatedAt.updated_at),
            },
            baseServerUpdatedAt: String(serverUpdatedAt.updated_at),
          });
          return;
        }
        await client.query(
          `update bookkeeping_transactions set
             amount=$2, direction=$3, currency=$4, merchant=$5, description=$6,
             transaction_time=$7, source=$8, status=$9, payer_payee=$10, account_label=$11,
             participant=$12, tag=$13, property=$14, category_name=$15,
             deleted_at=null, updated_at=$1
           where id = $16::uuid and account_id = $17::uuid`,
          [
            now, p.amount, p.direction, p.currency, p.merchant, p.description,
            p.transactionTime, p.source, p.status, p.payerPayee, p.account,
            p.participant, p.tag, p.property, p.categoryName, op.serverId, accountId,
          ],
        );
        return;
      }
      await client.query(
        `insert into bookkeeping_transactions (
           account_id, amount, direction, currency, merchant, description,
           transaction_time, source, status, payer_payee, account_label,
           participant, tag, property, category_name, updated_at, created_at
         ) values (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16
         )`,
        [
          accountId, p.amount, p.direction, p.currency, p.merchant, p.description,
          p.transactionTime, p.source, p.status, p.payerPayee, p.account,
          p.participant, p.tag, p.property, p.categoryName, now,
        ],
      );
      return;
    }

    // category
    if (op.op === "DELETE") {
      await client.query(
        `update bookkeeping_categories
           set deleted_at = coalesce(deleted_at, $3), updated_at = $2
           where id = $1::uuid and account_id = $4::uuid and deleted_at is null`,
        [op.serverId, now, now, accountId],
      );
      return;
    }
    const cp = op.categoryPayload;
    if (!cp) {
      return;
    }
    if (op.serverId) {
      const serverRow = await client.query<{ updated_at?: unknown }>(
        `select updated_at from bookkeeping_categories where id = $1::uuid and account_id = $2::uuid`,
        [op.serverId, accountId],
      );
      const serverUpdatedAt = serverRow.rows[0];
      if (
        serverUpdatedAt &&
        op.baseUpdatedAt &&
        serverUpdatedAt.updated_at &&
        String(serverUpdatedAt.updated_at) > op.baseUpdatedAt
      ) {
        conflicts.push({
          localId: op.localId,
          serverId: op.serverId,
          entityType: "category",
          serverCategory: {
            categoryId: op.serverId,
            name: cp.name,
            type: cp.type,
            keywords: cp.keywords,
            isBuiltin: cp.isBuiltin,
            isActive: cp.isActive,
            updatedAt: String(serverUpdatedAt.updated_at),
          },
          baseServerUpdatedAt: String(serverUpdatedAt.updated_at),
        });
        return;
      }
      await client.query(
        `update bookkeeping_categories set
           name=$2, type=$3, keywords=$4, is_builtin=$5, is_active=$6,
           deleted_at=null, updated_at=$1
         where id = $7::uuid and account_id = $8::uuid`,
        [now, cp.name, cp.type, cp.keywords, cp.isBuiltin, cp.isActive, op.serverId, accountId],
      );
      return;
    }
    await client.query(
      `insert into bookkeeping_categories (
         account_id, name, type, keywords, is_builtin, is_active, updated_at, created_at
       ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $7)`,
      [accountId, cp.name, cp.type, cp.keywords, cp.isBuiltin, cp.isActive, now],
    );
  }

  async function pullChanges(
    accountId: string,
    since: string | null,
  ): Promise<BookkeepingChange[]> {
    const changes: BookkeepingChange[] = [];
    const txRows = await client.query<Record<string, unknown>>(
      `select id, amount, direction, currency, merchant, description,
              transaction_time, source, status, payer_payee, account_label,
              participant, tag, property, category_name,
              deleted_at, updated_at
         from bookkeeping_transactions
        where account_id = $1::uuid
          and ($2::timestamptz is null or updated_at > $2::timestamptz)
        order by updated_at asc`,
      [accountId, since],
    );
    for (const row of txRows.rows) {
      changes.push({
        entityType: "transaction",
        serverId: String(row.id),
        deleted: !!row.deleted_at,
        payload: {
          transactionId: String(row.id),
          amount: String(row.amount ?? ""),
          direction: String(row.direction ?? ""),
          currency: String(row.currency ?? "人民币"),
          merchant: String(row.merchant ?? ""),
          description: String(row.description ?? ""),
          transactionTime: String(row.transaction_time ?? ""),
          source: String(row.source ?? ""),
          status: String(row.status ?? ""),
          payerPayee: String(row.payer_payee ?? ""),
          account: String(row.account_label ?? ""),
          participant: String(row.participant ?? ""),
          tag: String(row.tag ?? ""),
          property: String(row.property ?? ""),
          categoryName: String(row.category_name ?? ""),
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        },
        serverUpdatedAt: row.updated_at ? String(row.updated_at) : undefined,
      });
    }

    const catRows = await client.query<Record<string, unknown>>(
      `select id, name, type, keywords, is_builtin, is_active, deleted_at, updated_at
         from bookkeeping_categories
        where account_id = $1::uuid
          and ($2::timestamptz is null or updated_at > $2::timestamptz)
        order by updated_at asc`,
      [accountId, since],
    );
    for (const row of catRows.rows) {
      changes.push({
        entityType: "category",
        serverId: String(row.id),
        deleted: !!row.deleted_at,
        categoryPayload: {
          categoryId: String(row.id),
          name: String(row.name ?? ""),
          type: String(row.type ?? ""),
          keywords: String(row.keywords ?? ""),
          isBuiltin: !!row.is_builtin,
          isActive: !!row.is_active,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        },
        serverUpdatedAt: row.updated_at ? String(row.updated_at) : undefined,
      });
    }

    return changes;
  }

  return {
    syncForCurrentUser,
    accountBelongsToUser,
    ensureAccountId,
  };
}
