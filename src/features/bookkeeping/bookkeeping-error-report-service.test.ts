import { describe, expect, it, vi } from "vitest";

import {
  createBookkeepingErrorReportService,
  createPostgresBookkeepingErrorReportFileCleanupQueue,
} from "./bookkeeping-error-report-service";
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
      accountId: "account-a",
      imageObjectKey: "report-image.jpg",
      errorCode: "delete_after_database_insert_failed",
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

  it("uses conflict-safe PostgreSQL enqueue and atomically claims one retry across workers", async () => {
    let claimed = false;
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("insert into bookkeeping_error_report_file_cleanup")) return { rows: [] };
        if (sql.includes("for update skip locked")) {
          if (claimed) return { rows: [] };
          claimed = true;
          return { rows: [{ account_id: "account-a", image_object_key: "orphan.jpg", claim_token: "claim-1" }] };
        }
        if (sql.includes("delete from bookkeeping_error_report_file_cleanup")) return { rows: [] };
        if (sql.includes("select count(*)::text")) return { rows: [{ count: "0" }] };
        throw new Error("unexpected query");
      }),
    };
    const queueA = createPostgresBookkeepingErrorReportFileCleanupQueue({
      client,
      createClaimToken: () => "claim-1",
    });
    const queueB = createPostgresBookkeepingErrorReportFileCleanupQueue({
      client,
      createClaimToken: () => "claim-2",
    });
    const deleteImage = vi.fn(async () => undefined);

    await Promise.all([
      queueA.enqueue({ accountId: "account-a", imageObjectKey: "orphan.jpg", errorCode: "delete_failed" }),
      queueB.enqueue({ accountId: "account-a", imageObjectKey: "orphan.jpg", errorCode: "delete_failed" }),
    ]);
    await Promise.all([queueA.retry(deleteImage), queueB.retry(deleteImage)]);

    expect(client.query.mock.calls.filter(([sql]) => sql.includes("on conflict (image_object_key)"))).toHaveLength(2);
    expect(deleteImage).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("for update skip locked"))).toBe(true);
  });

  it("attempts a persistently failing cleanup task only once per retry call", async () => {
    let available = true;
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("for update skip locked")) {
          if (!available) return { rows: [] };
          available = false;
          return { rows: [{ account_id: "account-a", image_object_key: "orphan.jpg", claim_token: "claim-1" }] };
        }
        if (sql.includes("set last_error_code = 'delete_failed'")) {
          if (sql.includes("claim_until = null")) available = true;
          return { rows: [] };
        }
        if (sql.includes("select count(*)::text")) return { rows: [{ count: "1" }] };
        throw new Error("unexpected query");
      }),
    };
    const queue = createPostgresBookkeepingErrorReportFileCleanupQueue({
      client,
      createClaimToken: () => "claim-1",
    });
    const deleteImage = vi.fn(async () => { throw new Error("still locked"); });

    await expect(queue.retry(deleteImage)).resolves.toEqual({ deleted: 0, pending: 1 });

    expect(deleteImage).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) =>
      sql.includes("last_error_code = 'delete_failed'") && !sql.includes("claim_until = null"),
    )).toBe(true);
  });

  it("retains the database failure and emits a fixed safe audit event when cleanup enqueue fails", async () => {
    const store = {
      save: vi.fn(), read: vi.fn(), delete: vi.fn().mockRejectedValue(new Error("file locked")),
    };
    const cleanupQueue = { enqueue: vi.fn().mockRejectedValue(new Error("queue database failed")), retry: vi.fn() };
    const audit = vi.fn();
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "account-a" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("database secret OCR 6222020202020202")),
    };
    const service = createBookkeepingErrorReportService({
      client,
      store,
      cleanupQueue,
      audit,
      createImageKey: () => "report-image.jpg",
    });

    await expect(service.saveForCurrentUser("user-a", report, Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .rejects.toThrow("database secret OCR 6222020202020202");

    expect(audit).toHaveBeenCalledWith({
      event: "bookkeeping_error_report_cleanup_enqueue_failed",
      errorCode: "cleanup_queue_unavailable",
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("6222020202020202");
    expect(JSON.stringify(audit.mock.calls)).not.toContain("report-image.jpg");
  });
});
