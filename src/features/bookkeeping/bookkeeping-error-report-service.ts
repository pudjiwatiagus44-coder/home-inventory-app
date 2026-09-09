import { createHash, randomUUID } from "node:crypto";

import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type { PhotoStore } from "../../server/photos/photo-store";
import type { BookkeepingErrorReportRequest } from "./bookkeeping-error-report-types";

type BookkeepingErrorReportServiceDeps = {
  client: PostgresQueryClient;
  store: Pick<PhotoStore, "save" | "delete">;
  cleanupQueue?: ErrorReportFileCleanupQueue;
  audit?: (event: ErrorReportCleanupAuditEvent) => void;
  createImageKey?: () => string;
};

export type ErrorReportFileCleanupEntry = {
  accountId: string;
  imageObjectKey: string;
  errorCode: ErrorReportFileCleanupErrorCode;
};

export type ErrorReportFileCleanupErrorCode =
  | "delete_after_database_insert_failed"
  | "delete_after_duplicate_conflict"
  | "delete_failed";

export type ErrorReportFileCleanupQueue = {
  enqueue: (entry: ErrorReportFileCleanupEntry) => Promise<void>;
  retry: (deleteImage: (imageObjectKey: string) => Promise<void>) => Promise<{
    deleted: number;
    pending: number;
  }>;
};

export type ErrorReportCleanupAuditEvent = {
  event: "bookkeeping_error_report_cleanup_enqueue_failed";
  errorCode: "cleanup_queue_unavailable";
};

export function createPostgresBookkeepingErrorReportFileCleanupQueue({
  client,
  createClaimToken = randomUUID,
}: {
  client: PostgresQueryClient;
  createClaimToken?: () => string;
}): ErrorReportFileCleanupQueue {
  return {
    async enqueue(entry) {
      await client.query(
        `insert into bookkeeping_error_report_file_cleanup (
           account_id, image_object_key, last_error_code
         ) values ($1::uuid, $2, $3)
         on conflict (image_object_key) do update
           set last_error_code = excluded.last_error_code`,
        [entry.accountId, entry.imageObjectKey, entry.errorCode],
      );
    },
    async retry(deleteImage) {
      let deleted = 0;
      for (let claims = 0; claims < 20; claims += 1) {
        const claim = await client.query<{
          account_id: string;
          image_object_key: string;
          claim_token: string;
        }>(
          `with candidate as (
             select account_id, image_object_key
               from bookkeeping_error_report_file_cleanup
              where claim_until is null or claim_until < now()
              order by created_at
              for update skip locked
              limit 1
           )
           update bookkeeping_error_report_file_cleanup queue
              set claim_token = $1::uuid,
                  claim_until = now() + interval '5 minutes',
                  last_attempt_at = now(),
                  attempt_count = queue.attempt_count + 1
             from candidate
            where queue.account_id = candidate.account_id
              and queue.image_object_key = candidate.image_object_key
           returning queue.account_id, queue.image_object_key, queue.claim_token`,
          [createClaimToken()],
        );
        const entry = claim.rows[0];
        if (!entry) break;
        try {
          await deleteImage(entry.image_object_key);
          await client.query(
            `delete from bookkeeping_error_report_file_cleanup
              where account_id = $1::uuid and image_object_key = $2 and claim_token = $3::uuid`,
            [entry.account_id, entry.image_object_key, entry.claim_token],
          );
          deleted += 1;
        } catch {
          await client.query(
            `update bookkeeping_error_report_file_cleanup
                set last_error_code = 'delete_failed', claim_token = null, claim_until = null
              where account_id = $1::uuid and image_object_key = $2 and claim_token = $3::uuid`,
            [entry.account_id, entry.image_object_key, entry.claim_token],
          );
        }
      }
      const remaining = await client.query<{ count: string }>(
        "select count(*)::text as count from bookkeeping_error_report_file_cleanup",
      );
      return { deleted, pending: Number(remaining.rows[0]?.count ?? 0) };
    },
  };
}

export function createBookkeepingErrorReportService({
  client,
  store,
  cleanupQueue = createPostgresBookkeepingErrorReportFileCleanupQueue({ client }),
  audit = (event) => console.error(JSON.stringify(event)),
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
          await deleteOrQueue(accountId, imageObjectKey, "delete_after_duplicate_conflict");
          return { reportId: report.reportId, duplicate: true };
        }
        return { reportId: report.reportId, duplicate: false };
      } catch (error) {
        await deleteOrQueue(accountId, imageObjectKey, "delete_after_database_insert_failed");
        throw error;
      }
    },
  };

  async function deleteOrQueue(
    accountId: string,
    imageObjectKey: string,
    errorCode: ErrorReportFileCleanupErrorCode,
  ) {
    try {
      await store.delete(imageObjectKey);
    } catch {
      await cleanupQueue.enqueue({
        accountId,
        imageObjectKey,
        errorCode,
      }).catch(() => audit({
        event: "bookkeeping_error_report_cleanup_enqueue_failed",
        errorCode: "cleanup_queue_unavailable",
      }));
    }
  }
}
