import { createHash, randomUUID } from "node:crypto";

import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type { PhotoStore } from "../../server/photos/photo-store";
import type { BookkeepingErrorReportRequest } from "./bookkeeping-error-report-types";

type BookkeepingErrorReportServiceDeps = {
  client: PostgresQueryClient;
  store: Pick<PhotoStore, "save" | "delete">;
  createImageKey?: () => string;
};

export function createBookkeepingErrorReportService({
  client,
  store,
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
          await store.delete(imageObjectKey);
          return { reportId: report.reportId, duplicate: true };
        }
        return { reportId: report.reportId, duplicate: false };
      } catch (error) {
        await store.delete(imageObjectKey);
        throw error;
      }
    },
  };
}
