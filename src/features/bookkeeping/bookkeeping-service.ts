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
  BookkeepingOperationResult,
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
    const cursor = new Date(Math.max(Date.now(), Date.parse(now) + 1)).toISOString();
    const conflicts: BookkeepingConflict[] = [];

    const results: BookkeepingOperationResult[] = [];
    for (const op of input.operations) {
      results.push(await applyOperation(accountId, op, now, conflicts));
    }

    const changes: BookkeepingChange[] = await pullChanges(accountId, input.since ?? null);
    return { accountId, data: { cursor, changes, conflicts, results } };
  }

  async function applyOperation(
    accountId: string,
    op: BookkeepingOperation,
    now: string,
    conflicts: BookkeepingConflict[],
  ): Promise<BookkeepingOperationResult> {
    if (op.entityType === "transaction") {
      if (op.op === "DELETE") {
        await client.query("begin");
        try {
        const deleted = await client.query<{ id: string }>(
          `update bookkeeping_transactions
             set deleted_at = coalesce(deleted_at, $3), updated_at = $2
             where id = $1::uuid and account_id = $4::uuid
             returning id`,
          [op.serverId, now, now, accountId],
        );
        if (!deleted.rows[0]) { await client.query("rollback"); return operationResult(op, "rejected", op.serverId ?? "", "not_found"); }
        const tombstone = await client.query<{ server_id: string }>(
          `insert into bookkeeping_delete_tombstones (account_id, entity_type, server_id, deleted_at, updated_at, permanently_deleted)
           values ($1::uuid, 'transaction', $2::uuid, $3, $3, false)
           on conflict (account_id, entity_type, server_id) do update set deleted_at=excluded.deleted_at, updated_at=excluded.updated_at, permanently_deleted=false returning server_id`,
          [accountId, op.serverId, now],
        );
        if (!tombstone.rows[0]) { await client.query("rollback"); return operationResult(op, "rejected", op.serverId ?? "", "tombstone_not_written"); }
        await client.query("commit");
        return operationResult(op, "applied", op.serverId ?? "");
        } catch (error) { await client.query("rollback"); throw error; }
      }
      if (op.op === "PURGE") {
        await client.query("begin");
        try {
          const permanent = await client.query(
            `select server_id from bookkeeping_delete_tombstones where account_id=$1::uuid and entity_type='transaction' and server_id=$2::uuid and permanently_deleted=true`,
            [accountId, op.serverId],
          );
          if (permanent.rows.length > 0) {
            await client.query("commit");
            return operationResult(op, "applied", op.serverId ?? "");
          }
          const existing = await client.query<{ id: string; deleted_at?: unknown }>(
          `select id, deleted_at from bookkeeping_transactions where id=$1::uuid and account_id=$2::uuid limit 1`,
          [op.serverId, accountId],
          );
          const ordinaryTombstone = await client.query(
          `select server_id from bookkeeping_delete_tombstones where account_id=$1::uuid and entity_type='transaction' and server_id=$2::uuid and permanently_deleted=false`,
          [accountId, op.serverId],
          );
          if (!existing.rows[0] || !existing.rows[0].deleted_at || ordinaryTombstone.rows.length === 0) {
            await client.query("commit");
            return operationResult(op, "rejected", op.serverId ?? "", "not_found_or_not_deleted");
          }
          const deleted = await client.query<{ id: string }>(
            `delete from bookkeeping_transactions where id=$1::uuid and account_id=$2::uuid and deleted_at is not null returning id`,
            [op.serverId, accountId],
          );
          if (deleted.rows.length === 0) {
            await client.query("commit");
            return operationResult(op, "rejected", op.serverId ?? "", "not_found_or_not_deleted");
          }
          const restored = await client.query<{ id: string }>(
          `insert into bookkeeping_delete_tombstones (account_id, entity_type, server_id, deleted_at, updated_at, permanently_deleted)
           values ($1::uuid, 'transaction', $2::uuid, $3, $3, true)
           on conflict (account_id, entity_type, server_id) do update set updated_at=excluded.updated_at, permanently_deleted=true`,
          [accountId, op.serverId, now],
          );
          await client.query("commit");
          return operationResult(op, "applied", op.serverId ?? "");
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      }
      const p = op.payload as BookkeepingTransactionPayload | undefined;
      if (!p) {
        return operationResult(op, "rejected", op.serverId ?? "", "missing_payload");
      }
      if (op.serverId) {
        const globalRow = await client.query<{ id: string; account_id: string }>(
          `select id, account_id from bookkeeping_transactions where id = $1::uuid limit 1`,
          [op.serverId],
        );
        if (globalRow.rows[0] && globalRow.rows[0].account_id !== accountId) {
          return operationResult(op, "rejected", op.serverId, "server_id_owned_by_other_account");
        }
        const globalPermanentTombstone = await client.query<{ account_id: string }>(
          `select account_id from bookkeeping_delete_tombstones where entity_type='transaction' and server_id=$1::uuid and permanently_deleted=true limit 1`,
          [op.serverId],
        );
        if (globalPermanentTombstone.rows[0]?.account_id && globalPermanentTombstone.rows[0].account_id !== accountId) {
          return operationResult(op, "rejected", op.serverId, "server_id_owned_by_other_account");
        }
        const permanent = await client.query(
          `select server_id from bookkeeping_delete_tombstones
            where account_id=$1::uuid and entity_type='transaction' and server_id=$2::uuid and permanently_deleted=true`,
          [accountId, op.serverId],
        );
        if (permanent.rows.length > 0) {
          return operationResult(op, "rejected", op.serverId, "permanently_deleted");
        }
        const serverRow = await client.query<{ updated_at?: unknown; deleted_at?: unknown }>(
          `select updated_at, deleted_at from bookkeeping_transactions where id = $1::uuid and account_id = $2::uuid`,
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
          return operationResult(op, "conflict", op.serverId);
        }
        if (serverUpdatedAt) {
          await client.query("begin");
          let committed = false;
          try {
          const restored = await client.query<{ id: string }>(
            `update bookkeeping_transactions set
               amount=$2, direction=$3, currency=$4, merchant=$5, description=$6,
               transaction_time=$7, source=$8, status=$9, payer_payee=$10, account_label=$11,
               participant=$12, tag=$13, property=$14, category_name=$15,
               deleted_at=null, updated_at=$1
             where id = $16::uuid and account_id = $17::uuid returning id`,
            [
              now, p.amount, p.direction, p.currency, p.merchant, p.description,
              p.transactionTime, p.source, p.status, p.payerPayee, p.account,
              p.participant, p.tag, p.property, p.categoryName, op.serverId, accountId,
            ],
          );
          if (!restored.rows[0]) return operationResult(op, "rejected", op.serverId, "not_found");
          const tombstone = await client.query<{ server_id: string }>(
            `delete from bookkeeping_delete_tombstones where account_id=$1::uuid and entity_type='transaction' and server_id=$2::uuid returning server_id`,
            [accountId, op.serverId],
          );
          if ((tombstone.rowCount ?? tombstone.rows.length) !== 1 && serverUpdatedAt.deleted_at) return operationResult(op, "rejected", op.serverId, "tombstone_not_deleted");
          await client.query("commit");
          committed = true;
          } catch (error) { throw error; } finally { if (!committed) await client.query("rollback"); }
        } else {
          await client.query(
            `insert into bookkeeping_transactions (
               id, account_id, amount, direction, currency, merchant, description,
               transaction_time, source, status, payer_payee, account_label,
               participant, tag, property, category_name, updated_at, created_at
             ) values (
               $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17
             )`,
            [
              op.serverId, accountId, p.amount, p.direction, p.currency, p.merchant,
              p.description, p.transactionTime, p.source, p.status, p.payerPayee,
              p.account, p.participant, p.tag, p.property, p.categoryName, now,
            ],
          );
        }
        return operationResult(op, "applied", op.serverId);
      }
      // 内容去重（兜底）：同账号存在相同内容(金额/方向/时间/商户/描述)未软删记录时，复用更新，避免累积重复。
      const existing = await client.query<{ id: string }>(
        `select id from bookkeeping_transactions
          where account_id=$1::uuid and amount=$2 and direction=$3 and transaction_time=$4
            and coalesce(merchant,'')=$5 and coalesce(description,'')=$6 and deleted_at is null
          order by id limit 1`,
        [accountId, p.amount, p.direction, p.transactionTime, p.merchant, p.description],
      );
      if (existing.rows[0]) {
        const eid = existing.rows[0].id;
        const updated = await client.query<{ id: string }>(
          `update bookkeeping_transactions set
             currency=$2, merchant=$3, description=$4, source=$5, status=$6,
             payer_payee=$7, account_label=$8, participant=$9, tag=$10, property=$11,
             category_name=$12, deleted_at=null, updated_at=$1
           where id = $13::uuid and account_id = $14::uuid returning id`,
          [now, p.currency, p.merchant, p.description, p.source, p.status,
           p.payerPayee, p.account, p.participant, p.tag, p.property, p.categoryName, eid, accountId],
        );
        if ((updated.rowCount ?? updated.rows.length) !== 1 || !updated.rows[0]) return operationResult(op, "rejected", eid, "not_found");
        return operationResult(op, "applied", eid);
      }
      const inserted = await client.query<{ id: string }>(
        `insert into bookkeeping_transactions (
           account_id, amount, direction, currency, merchant, description,
           transaction_time, source, status, payer_payee, account_label,
           participant, tag, property, category_name, updated_at, created_at
         ) values (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16
         ) returning id`,
        [
          accountId, p.amount, p.direction, p.currency, p.merchant, p.description,
          p.transactionTime, p.source, p.status, p.payerPayee, p.account,
          p.participant, p.tag, p.property, p.categoryName, now,
        ],
      );
      return operationResult(op, "applied", inserted.rows[0]?.id ?? "");
    }

    // category
    if (op.op === "PURGE") {
      return operationResult(op, "rejected", op.serverId ?? "", "unsupported_operation");
    }
    if (op.op === "DELETE") {
      const deleted = await client.query<{ id: string }>(
        `update bookkeeping_categories
           set deleted_at = coalesce(deleted_at, $3), updated_at = $2
           where id = $1::uuid and account_id = $4::uuid and deleted_at is null
           returning id`,
        [op.serverId, now, now, accountId],
      );
      return operationResult(op, deleted.rows[0] ? "applied" : "rejected", op.serverId ?? "", "not_found");
    }
    const cp = op.categoryPayload;
    if (!cp) {
      return operationResult(op, "rejected", op.serverId ?? "", "missing_payload");
    }
    if (op.serverId) {
      const serverRow = await client.query<{ id?: string; updated_at?: unknown }>(
        `select updated_at from bookkeeping_categories where id = $1::uuid and account_id = $2::uuid`,
        [op.serverId, accountId],
      );
      let effectiveServerId = op.serverId;
      let serverUpdatedAt = serverRow.rows[0];
      if (!serverUpdatedAt) {
        const sameNameRow = await client.query<{ id: string; updated_at?: unknown }>(
          `select id, updated_at from bookkeeping_categories
             where account_id = $1::uuid and name = $2
             limit 1`,
          [accountId, cp.name],
        );
        if (sameNameRow.rows[0]) {
          effectiveServerId = sameNameRow.rows[0].id;
          serverUpdatedAt = sameNameRow.rows[0];
        }
      }
      if (
        serverUpdatedAt &&
        op.baseUpdatedAt &&
        serverUpdatedAt.updated_at &&
        String(serverUpdatedAt.updated_at) > op.baseUpdatedAt
      ) {
        conflicts.push({
          localId: op.localId,
          serverId: effectiveServerId,
          entityType: "category",
          serverCategory: {
            categoryId: effectiveServerId,
            name: cp.name,
            type: cp.type,
            keywords: cp.keywords,
            isBuiltin: cp.isBuiltin,
            isActive: cp.isActive,
            updatedAt: String(serverUpdatedAt.updated_at),
          },
          baseServerUpdatedAt: String(serverUpdatedAt.updated_at),
        });
        return operationResult(op, "conflict", effectiveServerId);
      }
      if (serverUpdatedAt) {
        const updated = await client.query<{ id: string }>(
          `update bookkeeping_categories set
             name=$2, type=$3, keywords=$4, is_builtin=$5, is_active=$6,
             parent_category_id=$7::uuid, description=$8, icon=$9, color=$10, sort_order=$11,
             deleted_at=null, updated_at=$1
             where id = $12::uuid and account_id = $13::uuid returning id`,
          [now, cp.name, cp.type, cp.keywords, cp.isBuiltin, cp.isActive, cp.parentCategoryId ?? null,
           cp.description ?? "", cp.icon ?? "", cp.color ?? "", cp.sortOrder ?? 0, effectiveServerId, accountId],
        );
        if (!updated.rows[0]) return operationResult(op, "rejected", effectiveServerId, "not_found");
      } else {
        await client.query(
          `insert into bookkeeping_categories (
             id, account_id, name, type, keywords, is_builtin, is_active,
             parent_category_id, description, icon, color, sort_order, updated_at, created_at
           ) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9, $10, $11, $12, $13, $13)`,
          [op.serverId, accountId, cp.name, cp.type, cp.keywords, cp.isBuiltin, cp.isActive,
           cp.parentCategoryId ?? null, cp.description ?? "", cp.icon ?? "", cp.color ?? "", cp.sortOrder ?? 0, now],
        );
      }
        return operationResult(op, "applied", effectiveServerId);
    }
    const inserted = await client.query<{ id: string }>(
      `insert into bookkeeping_categories (
         account_id, name, type, keywords, is_builtin, is_active,
         parent_category_id, description, icon, color, sort_order, updated_at, created_at
       ) values ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10, $11, $12, $12) returning id`,
      [accountId, cp.name, cp.type, cp.keywords, cp.isBuiltin, cp.isActive,
       cp.parentCategoryId ?? null, cp.description ?? "", cp.icon ?? "", cp.color ?? "", cp.sortOrder ?? 0, now],
    );
    return operationResult(op, "applied", inserted.rows[0]?.id ?? "");
  }

  function operationResult(
    op: BookkeepingOperation,
    status: BookkeepingOperationResult["status"],
    serverId: string,
    reason?: string,
  ): BookkeepingOperationResult {
    return {
      localId: op.localId,
      serverId,
      entityType: op.entityType,
      status,
      ...(status === "rejected" && reason ? { reason } : {}),
    };
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

    const tombstones = await client.query<Record<string, unknown>>(
      `select server_id, deleted_at, updated_at
         from bookkeeping_delete_tombstones
        where account_id=$1::uuid and entity_type='transaction' and permanently_deleted=true
          and ($2::timestamptz is null or updated_at > $2::timestamptz)
        order by updated_at asc`,
      [accountId, since],
    );
    for (const row of tombstones.rows) {
      changes.push({
        entityType: "transaction",
        serverId: String(row.server_id),
        deleted: true,
        payload: null,
        serverUpdatedAt: row.updated_at ? String(row.updated_at) : null,
      });
    }

    const catRows = await client.query<Record<string, unknown>>(
      `select id, name, type, keywords, is_builtin, is_active, parent_category_id,
              description, icon, color, sort_order, deleted_at, updated_at
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
          parentCategoryId: row.parent_category_id ? String(row.parent_category_id) : null,
          description: String(row.description ?? ""),
          icon: String(row.icon ?? ""),
          color: String(row.color ?? ""),
          sortOrder: Number(row.sort_order ?? 0),
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
