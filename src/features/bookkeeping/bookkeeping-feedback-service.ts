import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type {
  RecognitionDraftSnapshot,
  RecognitionFeedbackRequest,
  RecognitionFeedbackStoredRow,
} from "./bookkeeping-feedback-types";

type BookkeepingFeedbackServiceDeps = {
  client: PostgresQueryClient;
};

export type RecognitionCorrectionExample = {
  sourceText: string;
  corrected: RecognitionDraftSnapshot;
};

export function createBookkeepingFeedbackService({ client }: BookkeepingFeedbackServiceDeps) {
  async function accountIdForUser(userId: string): Promise<string> {
    const account = await client.query<{ id: string }>(
      "select id from bookkeeping_accounts where user_id = $1 limit 1",
      [userId],
    );
    if (!account.rows[0]) throw new Error("bookkeeping_account_not_found");
    return account.rows[0].id;
  }

  return {
    async saveForCurrentUser(userId: string, feedback: RecognitionFeedbackRequest) {
      const accountId = await accountIdForUser(userId);
      const result = await client.query<{ id: string }>(
        `insert into bookkeeping_recognition_feedback (
           account_id, id, source_text, original_result, corrected_result,
           differences, model, authorized_at, created_at, updated_at
         ) values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::text[], $7, $8::timestamptz, now(), now())
         on conflict (account_id, id) do update set
           source_text = excluded.source_text,
           original_result = excluded.original_result,
           corrected_result = excluded.corrected_result,
           differences = excluded.differences,
           model = excluded.model,
           authorized_at = excluded.authorized_at,
           updated_at = now()
         returning id`,
        [
          accountId,
          feedback.feedbackId,
          feedback.sourceText,
          JSON.stringify(feedback.original),
          JSON.stringify(feedback.corrected),
          feedback.differences,
          feedback.model,
          feedback.authorizedAt,
        ],
      );
      return { feedbackId: result.rows[0]?.id ?? feedback.feedbackId };
    },

    async listSummariesForCurrentUser(userId: string) {
      const accountId = await accountIdForUser(userId);
      const result = await client.query<{
        id: string;
        differences: string[];
        model: string;
        authorized_at: string | Date;
      }>(
        `select id, differences, model, authorized_at
           from bookkeeping_recognition_feedback
          where account_id = $1::uuid
          order by created_at desc`,
        [accountId],
      );
      return result.rows.map((row) => ({
        feedbackId: row.id,
        differences: row.differences,
        model: row.model,
        authorizedAt: toIsoString(row.authorized_at),
      }));
    },

    async deleteForCurrentUser(userId: string, feedbackId?: string) {
      const accountId = await accountIdForUser(userId);
      const result = feedbackId
        ? await client.query<{ id: string }>(
            `delete from bookkeeping_recognition_feedback
              where account_id = $1::uuid and id = $2::uuid
              returning id`,
            [accountId, feedbackId],
          )
        : await client.query<{ id: string }>(
            `delete from bookkeeping_recognition_feedback
              where account_id = $1::uuid
              returning id`,
            [accountId],
          );
      return { deleted: result.rows.length };
    },

    async findSimilarForCurrentUser(
      userId: string,
      sourceText: string,
      limit = 10,
    ): Promise<RecognitionCorrectionExample[]> {
      const accountId = await accountIdForUser(userId);
      const result = await client.query<RecognitionFeedbackStoredRow>(
        `select id, source_text, original_result, corrected_result, differences,
                model, authorized_at, created_at
           from bookkeeping_recognition_feedback
          where account_id = $1::uuid
          order by created_at desc
          limit 200`,
        [accountId],
      );
      return result.rows
        .map((row) => ({ row, score: scoreRecognitionFeedback(sourceText, row) }))
        .filter(({ score }) => score >= 20)
        .sort((left, right) => right.score - left.score ||
          Date.parse(toIsoString(right.row.created_at)) - Date.parse(toIsoString(left.row.created_at)))
        .slice(0, Math.max(0, Math.min(limit, 10)))
        .map(({ row }) => ({
          sourceText: row.source_text,
          corrected: row.corrected_result,
        }));
    },
  };
}

export function scoreRecognitionFeedback(
  sourceText: string,
  feedback: RecognitionFeedbackStoredRow,
): number {
  const input = normalize(sourceText);
  const previous = normalize(feedback.source_text);
  if (input && input === previous) return 100;

  let score = 0;
  const inputAmounts = new Set(amountTokens(input));
  for (const amount of new Set(amountTokens(previous))) {
    if (inputAmounts.has(amount)) score += 20;
  }

  const corrected = feedback.corrected_result;
  if (normalize(corrected.merchant) && input.includes(normalize(corrected.merchant))) score += 20;
  if (normalize(corrected.category) && input.includes(normalize(corrected.category))) score += 20;

  score += bigramJaccard(input, previous) * 50;
  return Math.min(100, Math.round(score * 100) / 100);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}.]+/gu, "");
}

function amountTokens(value: string): string[] {
  return value.match(/\d+(?:\.\d+)?/g) ?? [];
}

function bigramJaccard(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) return 0;
  let intersection = 0;
  for (const token of leftBigrams) if (rightBigrams.has(token)) intersection += 1;
  return intersection / (leftBigrams.size + rightBigrams.size - intersection);
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set(value ? [value] : []);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
