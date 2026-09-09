import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type { PhotoStore } from "../../server/photos/photo-store";
import type { BookkeepingErrorReportRequest } from "./bookkeeping-error-report-types";

type BookkeepingErrorReportServiceDeps = {
  client: PostgresQueryClient;
  store: Pick<PhotoStore, "save" | "delete">;
  cleanupQueue: ErrorReportOrphanCleanupQueue;
  createImageKey?: () => string;
};

export type ErrorReportOrphanCleanupEntry = {
  imageObjectKey: string;
  reason: "database_insert_failed" | "duplicate_conflict";
  queuedAt: string;
};

export type ErrorReportOrphanCleanupQueue = {
  enqueue: (entry: ErrorReportOrphanCleanupEntry) => Promise<void>;
  retry: (deleteImage: (imageObjectKey: string) => Promise<void>) => Promise<{
    deleted: number;
    pending: number;
  }>;
};

const ORPHAN_CLEANUP_FILE = ".bookkeeping-error-report-orphans.json";

export function createFileBackedErrorReportOrphanCleanupQueue(
  baseDir: string,
  fsImpl: typeof fs = fs,
): ErrorReportOrphanCleanupQueue {
  const queueFile = path.join(baseDir, ORPHAN_CLEANUP_FILE);

  async function readEntries(): Promise<ErrorReportOrphanCleanupEntry[]> {
    try {
      const value = JSON.parse(await fsImpl.readFile(queueFile, "utf8")) as unknown;
      if (!Array.isArray(value) || value.some((entry) => !isCleanupEntry(entry))) {
        throw new Error("invalid error report orphan cleanup queue");
      }
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeEntries(entries: ErrorReportOrphanCleanupEntry[]) {
    if (entries.length === 0) {
      try {
        await fsImpl.unlink(queueFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return;
    }
    await fsImpl.mkdir(baseDir, { recursive: true });
    await fsImpl.writeFile(queueFile, JSON.stringify(entries), "utf8");
  }

  return {
    async enqueue(entry) {
      const entries = await readEntries();
      if (!entries.some((existing) => existing.imageObjectKey === entry.imageObjectKey)) {
        entries.push(entry);
        await writeEntries(entries);
      }
    },
    async retry(deleteImage) {
      const entries = await readEntries();
      const remaining: ErrorReportOrphanCleanupEntry[] = [];
      let deleted = 0;
      for (const entry of entries) {
        try {
          await deleteImage(entry.imageObjectKey);
          deleted += 1;
        } catch {
          remaining.push(entry);
        }
      }
      await writeEntries(remaining);
      return { deleted, pending: remaining.length };
    },
  };
}

export function createBookkeepingErrorReportService({
  client,
  store,
  cleanupQueue,
  createImageKey = () => `${randomUUID()}.jpg`,
}: BookkeepingErrorReportServiceDeps) {
  async function accountIdForUser(userId: string) {
    const result = await client.query<{ id: string }>(
      "select id from bookkeeping_accounts where user_id = $1 limit 1",
      [userId],
    );
    if (!result.rows[0]) throw new Error("bookkeeping_account_not_found");
    return result.rows[0].id;
  }

  return {
    async retryPendingFileCleanup() {
      return cleanupQueue.retry(store.delete);
    },

    async saveForCurrentUser(userId: string, report: BookkeepingErrorReportRequest, image: Buffer) {
      const accountId = await accountIdForUser(userId);
      const existing = await client.query<{ report_id: string }>(
        `select report_id from bookkeeping_transaction_error_reports
          where account_id = $1::uuid and report_id = $2::uuid limit 1`,
        [accountId, report.reportId],
      );
      if (existing.rows[0]) return { reportId: report.reportId, duplicate: true };

      const imageObjectKey = createImageKey();
      await store.save(imageObjectKey, image);
      try {
        const inserted = await client.query<{ report_id: string }>(
          `insert into bookkeeping_transaction_error_reports (
             account_id, report_id, local_transaction_id, server_transaction_id, snapshot,
             reason, note, image_object_key, image_sha256, authorized_at
           ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5::jsonb, $6, $7, $8, $9, $10::timestamptz)
           on conflict (account_id, report_id) do nothing
           returning report_id`,
          [
            accountId,
            report.reportId,
            report.localTransactionId,
            report.serverTransactionId,
            JSON.stringify(report.snapshot),
            report.reason,
            report.note,
            imageObjectKey,
            createHash("sha256").update(image).digest("hex"),
            report.authorizedAt,
          ],
        );
        if (!inserted.rows[0]) {
          await deleteOrQueue(imageObjectKey, "duplicate_conflict");
          return { reportId: report.reportId, duplicate: true };
        }
        return { reportId: report.reportId, duplicate: false };
      } catch (error) {
        await deleteOrQueue(imageObjectKey, "database_insert_failed");
        throw error;
      }
    },
  };

  async function deleteOrQueue(
    imageObjectKey: string,
    reason: ErrorReportOrphanCleanupEntry["reason"],
  ) {
    try {
      await store.delete(imageObjectKey);
    } catch {
      await cleanupQueue.enqueue({
        imageObjectKey,
        reason,
        queuedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
  }
}

function isCleanupEntry(value: unknown): value is ErrorReportOrphanCleanupEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.imageObjectKey === "string" &&
    (entry.reason === "database_insert_failed" || entry.reason === "duplicate_conflict") &&
    typeof entry.queuedAt === "string";
}
