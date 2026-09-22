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
      if (!client.transaction) throw new Error("qwen_credential_transaction_required");
      return client.transaction(async (transactionClient) => {
        await transactionClient.query(
          "select pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`bookkeeping-qwen-credential:${trustedServerUserId}`],
        );
        return operation(createPostgresQwenCredentialRepository(transactionClient));
      });
    },
  };
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
