import { describe, expect, it, vi } from "vitest";

import { createBookkeepingErrorReportService } from "./bookkeeping-error-report-service";
import type { BookkeepingErrorReportRequest } from "./bookkeeping-error-report-types";

const report: BookkeepingErrorReportRequest = {
  reportId: "11111111-1111-4111-8111-111111111111",
  localTransactionId: 42,
  serverTransactionId: null,
  snapshot: {
    amount: "4.50", direction: "expense", category: "餐饮", merchant: "停车场", note: "",
    transactionTime: "2026-09-08T09:22:00.000Z", deletedAt: "2026-09-08T10:00:00.000Z", source: "photo_recognition",
  },
  reason: "wrong_amount",
  note: null,
  authorizedAt: "2026-09-08T10:01:00.000Z",
};

describe("bookkeeping error report service", () => {
  it("does not write another image or overwrite an existing report", async () => {
    const store = { save: vi.fn(), read: vi.fn(), delete: vi.fn() };
    const cleanupQueue = { enqueue: vi.fn().mockResolvedValue(undefined), retry: vi.fn() };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "account-a" }] })
        .mockResolvedValueOnce({ rows: [{ report_id: report.reportId }] }),
    };
    const service = createBookkeepingErrorReportService({ client, store, cleanupQueue });

    await expect(service.saveForCurrentUser("user-a", report, Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .resolves.toEqual({ reportId: report.reportId, duplicate: true });

    expect(store.save).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("deletes the file when inserting its database row fails", async () => {
    const store = { save: vi.fn(), read: vi.fn(), delete: vi.fn() };
    const cleanupQueue = { enqueue: vi.fn(), retry: vi.fn() };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "account-a" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("database secret")),
    };
    const service = createBookkeepingErrorReportService({
      client,
      store,
      cleanupQueue,
      createImageKey: () => "report-image.jpg",
    });

    await expect(service.saveForCurrentUser("user-a", report, Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .rejects.toThrow("database secret");

    expect(store.save).toHaveBeenCalledWith("report-image.jpg", expect.any(Buffer));
    expect(store.delete).toHaveBeenCalledWith("report-image.jpg");
  });

  it("preserves a database failure while recording a failed orphan-file deletion", async () => {
    const store = {
      save: vi.fn(), read: vi.fn(), delete: vi.fn().mockRejectedValue(new Error("file locked")),
    };
    const cleanupQueue = { enqueue: vi.fn().mockResolvedValue(undefined), retry: vi.fn() };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "account-a" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("database secret")),
    };
    const service = createBookkeepingErrorReportService({
      client,
      store,
      cleanupQueue,
      createImageKey: () => "report-image.jpg",
    });

    await expect(service.saveForCurrentUser("user-a", report, Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .rejects.toThrow("database secret");

    expect(cleanupQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      imageObjectKey: "report-image.jpg",
      reason: "database_insert_failed",
    }));
  });

  it("keeps one database row and one effective file when concurrent requests share a reportId", async () => {
    const files = new Set<string>();
    let inserted = false;
    const store = {
      save: vi.fn(async (key: string) => { files.add(key); }),
      read: vi.fn(),
      delete: vi.fn(async (key: string) => { files.delete(key); }),
    };
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from bookkeeping_accounts")) return { rows: [{ id: "account-a" }] };
        if (sql.includes("select report_id")) return { rows: [] };
        if (sql.includes("insert into bookkeeping_transaction_error_reports")) {
          if (!inserted) {
            inserted = true;
            return { rows: [{ report_id: report.reportId }] };
          }
          return { rows: [] };
        }
        throw new Error("unexpected query");
      }),
    };
    const imageKeys = ["first.jpg", "second.jpg"];
    const cleanupQueue = { enqueue: vi.fn(), retry: vi.fn() };
    const service = createBookkeepingErrorReportService({
      client,
      store,
      cleanupQueue,
      createImageKey: () => imageKeys.shift()!,
    });

    const results = await Promise.all([
      service.saveForCurrentUser("user-a", report, Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
      service.saveForCurrentUser("user-a", report, Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
    ]);

    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect(files.size).toBe(1);
    expect(store.delete).toHaveBeenCalledTimes(1);
  });
});
