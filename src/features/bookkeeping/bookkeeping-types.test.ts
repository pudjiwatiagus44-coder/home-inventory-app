import { describe, expect, it } from "vitest";
import {
  parseBookkeepingSyncRequest,
  type BookkeepingSyncRequest,
} from "./bookkeeping-types";

function baseRequest(): unknown {
  return {
    accountId: "acct-1",
    since: null,
    updates: [
      {
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
          payerPayee: "拼多多平台商户",
          account: "",
          participant: "",
          tag: "",
          property: "",
          categoryName: "购物",
        },
      },
    ],
  };
}

describe("parseBookkeepingSyncRequest", () => {
  it("parses a valid upsert transaction request", () => {
    const req = parseBookkeepingSyncRequest(baseRequest());
    expect(req.updates).toHaveLength(1);
    const op = req.updates[0];
    expect(op.op).toBe("UPSERT");
    expect(op.entityType).toBe("transaction");
    expect(op.localId).toBe("42");
    expect(op.payload).toBeDefined();
    expect((op.payload as { amount: string }).amount).toBe("32.50");
  });

  it("rejects when updates is missing", () => {
    expect(() => parseBookkeepingSyncRequest({})).toThrow("updates must be an array");
  });

  it("rejects a delete without serverId", () => {
    const input = {
      updates: [
        { op: "DELETE", entityType: "transaction", localId: "42" },
      ],
    };
    expect(() => parseBookkeepingSyncRequest(input)).toThrow("serverId is required for DELETE");
  });

  it("accepts a delete with serverId", () => {
    const req = parseBookkeepingSyncRequest({
      updates: [{ op: "DELETE", entityType: "category", localId: "7", serverId: "c-1" }],
    });
    expect(req.updates[0].serverId).toBe("c-1");
  });

  it("rejects unknown entityType", () => {
    const input = baseRequest();
    (input as { updates: unknown[] }).updates[0] = {
      op: "UPSERT",
      entityType: "nope",
      localId: "1",
    };
    expect(() => parseBookkeepingSyncRequest(input)).toThrow(
      "entityType must be transaction or category",
    );
  });

  it("holds optional accountId and since", () => {
    const req: BookkeepingSyncRequest = parseBookkeepingSyncRequest(baseRequest());
    expect(req.accountId).toBe("acct-1");
    expect(req.since).toBeUndefined();
  });
});
