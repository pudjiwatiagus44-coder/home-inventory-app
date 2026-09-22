import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type {
  QwenCredentialDatabase,
  StoredQwenCredential,
} from "./qwen-credential-service";

type CredentialRow = {
  ciphertext: Buffer;
  nonce: Buffer;
  authentication_tag: Buffer;
  key_version: number;
  last_four: string;
  last_verified_at: string | Date | null;
};

const COLUMNS = "ciphertext, nonce, authentication_tag, key_version, last_four, last_verified_at";

export function createPostgresQwenCredentialRepository(
  client: PostgresQueryClient,
): QwenCredentialDatabase {
  return {
    async findForTrustedServerUser(trustedServerUserId) {
      const result = await client.query<CredentialRow>(
        `select ${COLUMNS}
           from bookkeeping_qwen_credentials
          where user_id = $1
          limit 1`,
        [trustedServerUserId],
      );
      return result.rows[0] ? normalize(result.rows[0]) : null;
    },

    async saveForTrustedServerUser(trustedServerUserId, credential) {
      const result = await client.query<CredentialRow>(
        `insert into bookkeeping_qwen_credentials (
           user_id, key_version, ciphertext, nonce, authentication_tag, last_four, last_verified_at
         ) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id) do update set
           key_version = excluded.key_version,
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           authentication_tag = excluded.authentication_tag,
           last_four = excluded.last_four,
           last_verified_at = excluded.last_verified_at
         returning ${COLUMNS}`,
        [
          trustedServerUserId,
          credential.keyVersion,
          credential.ciphertext,
          credential.nonce,
          credential.tag,
          credential.lastFour,
          credential.lastVerifiedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("qwen_credential_user_not_found");
      return normalize(row);
    },

    async recordSuccessfulValidationForTrustedServerUser(trustedServerUserId, lastVerifiedAt) {
      const result = await client.query<CredentialRow>(
        `update bookkeeping_qwen_credentials
            set last_verified_at = $2::timestamptz
          where user_id = $1
        returning ${COLUMNS}`,
        [trustedServerUserId, lastVerifiedAt],
      );
      return result.rows[0] ? normalize(result.rows[0]) : null;
    },

    async deleteForTrustedServerUser(trustedServerUserId) {
      const result = await client.query<{ user_id: string }>(
        `delete from bookkeeping_qwen_credentials
          where user_id = $1
        returning user_id`,
        [trustedServerUserId],
      );
      return result.rows.length > 0;
    },

    async withUserMutationLock(trustedServerUserId, operation) {
      return withUserAdvisoryTransaction(client, trustedServerUserId, (transactionClient) =>
        operation(createPostgresQwenCredentialRepository(transactionClient)));
    },

    async acquireValidationSlotForTrustedServerUser(
      trustedServerUserId,
      requestId,
      startedAt,
      windowMs,
      maxRequests,
      maxConcurrent,
    ) {
      return withUserAdvisoryTransaction(client, trustedServerUserId, async (transactionClient) => {
        await transactionClient.query(
          `delete from bookkeeping_qwen_credential_rate_limits
            where user_id = $1
              and started_at < $2::timestamptz - ($3::double precision * interval '1 millisecond')`,
          [trustedServerUserId, startedAt, windowMs],
        );
        const counts = await transactionClient.query<{ request_count: number; active_count: number }>(
          `select count(*)::integer as request_count,
                  count(*) filter (
                    where completed_at is null
                      and started_at >= $2::timestamptz - interval '2 minutes'
                  )::integer as active_count
             from bookkeeping_qwen_credential_rate_limits
            where user_id = $1`,
          [trustedServerUserId, startedAt],
        );
        const requestCount = Number(counts.rows[0]?.request_count ?? 0);
        const activeCount = Number(counts.rows[0]?.active_count ?? 0);
        if (requestCount >= maxRequests || activeCount >= maxConcurrent) return false;
        await transactionClient.query(
          `insert into bookkeeping_qwen_credential_rate_limits (user_id, request_id, started_at)
           values ($1, $2, $3::timestamptz)`,
          [trustedServerUserId, requestId, startedAt],
        );
        return true;
      });
    },

    async releaseValidationSlotForTrustedServerUser(trustedServerUserId, requestId, completedAt) {
      await withUserAdvisoryTransaction(client, trustedServerUserId, async (transactionClient) => {
        await transactionClient.query(
          `update bookkeeping_qwen_credential_rate_limits
              set completed_at = $3::timestamptz
            where user_id = $1 and request_id = $2 and completed_at is null`,
          [trustedServerUserId, requestId, completedAt],
        );
      });
    },
  };
}

function withUserAdvisoryTransaction<Result>(
  client: PostgresQueryClient,
  trustedServerUserId: string,
  operation: (transactionClient: PostgresQueryClient) => Promise<Result>,
): Promise<Result> {
  if (!client.transaction) throw new Error("qwen_credential_transaction_required");
  return client.transaction(async (transactionClient) => {
    await transactionClient.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`bookkeeping-qwen-credential:${trustedServerUserId}`],
    );
    return operation(transactionClient);
  });
}

function normalize(row: CredentialRow): StoredQwenCredential {
  return {
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    tag: row.authentication_tag,
    keyVersion: row.key_version,
    lastFour: row.last_four,
    lastVerifiedAt: row.last_verified_at instanceof Date
      ? row.last_verified_at.toISOString()
      : row.last_verified_at,
  };
}
