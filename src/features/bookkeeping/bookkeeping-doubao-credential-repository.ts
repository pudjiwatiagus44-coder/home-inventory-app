import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type { EncryptedCredential } from "./bookkeeping-doubao-credential-crypto";
import type { DoubaoCredentialStatus } from "./bookkeeping-doubao-credential-types";

export type StoredDoubaoCredential = {
  encryptedApiKey: Buffer;
  encryptionNonce: Buffer;
  encryptionTag: Buffer;
  keyVersion: number;
  enabled: boolean;
  status: DoubaoCredentialStatus;
  lastFour: string;
  lastVerifiedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
};

export type BookkeepingDoubaoCredentialRepository = {
  findForUser(userId: string): Promise<StoredDoubaoCredential | null>;
  saveValidatedForUser(
    userId: string,
    input: { encrypted: EncryptedCredential; lastFour: string },
  ): Promise<StoredDoubaoCredential>;
  setEnabledForUser(
    userId: string,
    enabled: boolean,
  ): Promise<StoredDoubaoCredential | null>;
  recordFailureForUser(
    userId: string,
    revision: string,
    status: Exclude<DoubaoCredentialStatus, "ACTIVE">,
    errorCode: string,
  ): Promise<boolean>;
  recordSuccessForUser(userId: string, revision: string): Promise<boolean>;
  deleteForUser(userId: string): Promise<boolean>;
};

type CredentialRow = {
  encrypted_api_key: Buffer;
  encryption_nonce: Buffer;
  encryption_tag: Buffer;
  key_version: number;
  enabled: boolean;
  status: DoubaoCredentialStatus;
  last_four: string;
  last_verified_at: string | Date | null;
  last_success_at: string | Date | null;
  last_error_code: string | null;
};

const CREDENTIAL_COLUMNS = `
  dc.encrypted_api_key,
  dc.encryption_nonce,
  dc.encryption_tag,
  dc.key_version,
  dc.enabled,
  dc.status,
  dc.last_four,
  dc.last_verified_at,
  dc.last_success_at,
  dc.last_error_code
`;

export function createPostgresBookkeepingDoubaoCredentialRepository(
  client: PostgresQueryClient,
): BookkeepingDoubaoCredentialRepository {
  return {
    async findForUser(userId) {
      const result = await client.query<CredentialRow>(
        `select ${CREDENTIAL_COLUMNS}
           from bookkeeping_doubao_credentials dc
           join bookkeeping_accounts ba on ba.id = dc.account_id
          where ba.user_id = $1
          limit 1`,
        [userId],
      );
      return result.rows[0] ? normalizeRow(result.rows[0]) : null;
    },

    async saveValidatedForUser(userId, input) {
      const result = await client.query<CredentialRow>(
        `insert into bookkeeping_doubao_credentials (
           account_id, encrypted_api_key, encryption_nonce, encryption_tag,
           key_version, enabled, status, last_four, last_verified_at,
           last_success_at, last_error_code
         )
         select id, $2, $3, $4, $5, true, 'ACTIVE', $6, now(), now(), null
           from bookkeeping_accounts
          where user_id = $1
         on conflict (account_id) do update set
           encrypted_api_key = excluded.encrypted_api_key,
           encryption_nonce = excluded.encryption_nonce,
           encryption_tag = excluded.encryption_tag,
           key_version = excluded.key_version,
           enabled = true,
           status = 'ACTIVE',
           last_four = excluded.last_four,
           last_verified_at = excluded.last_verified_at,
           last_success_at = excluded.last_success_at,
           last_error_code = null
         returning
           encrypted_api_key,
           encryption_nonce,
           encryption_tag,
           key_version,
           enabled,
           status,
           last_four,
           last_verified_at,
           last_success_at,
           last_error_code`,
        [
          userId,
          input.encrypted.ciphertext,
          input.encrypted.nonce,
          input.encrypted.tag,
          input.encrypted.keyVersion,
          input.lastFour,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("bookkeeping_account_not_found");
      return normalizeRow(row);
    },

    async setEnabledForUser(userId, enabled) {
      const result = await client.query<CredentialRow>(
        `update bookkeeping_doubao_credentials dc
            set enabled = $2
           from bookkeeping_accounts ba
          where dc.account_id = ba.id
            and ba.user_id = $1
         returning
           dc.encrypted_api_key,
           dc.encryption_nonce,
           dc.encryption_tag,
           dc.key_version,
           dc.enabled,
           dc.status,
           dc.last_four,
           dc.last_verified_at,
           dc.last_success_at,
           dc.last_error_code`,
        [userId, enabled],
      );
      return result.rows[0] ? normalizeRow(result.rows[0]) : null;
    },

    async recordFailureForUser(userId, revision, status, errorCode) {
      const result = await client.query<{ account_id: string }>(
        `update bookkeeping_doubao_credentials dc
            set status = $3,
                last_error_code = $4
          from bookkeeping_accounts ba
          where dc.account_id = ba.id
            and ba.user_id = $1
            and dc.last_verified_at = $2::timestamptz
            and dc.enabled = true
        returning dc.account_id`,
        [userId, revision, status, errorCode],
      );
      return result.rows.length > 0;
    },

    async recordSuccessForUser(userId, revision) {
      const result = await client.query<{ account_id: string }>(
        `update bookkeeping_doubao_credentials dc
            set status = 'ACTIVE',
                last_error_code = null,
                last_success_at = now()
           from bookkeeping_accounts ba
          where dc.account_id = ba.id
            and ba.user_id = $1
            and dc.last_verified_at = $2::timestamptz
            and dc.enabled = true
        returning dc.account_id`,
        [userId, revision],
      );
      return result.rows.length > 0;
    },

    async deleteForUser(userId) {
      const result = await client.query<{ account_id: string }>(
        `delete from bookkeeping_doubao_credentials dc
          using bookkeeping_accounts ba
          where dc.account_id = ba.id
            and ba.user_id = $1
        returning dc.account_id`,
        [userId],
      );
      return result.rows.length > 0;
    },
  };
}

function normalizeRow(row: CredentialRow): StoredDoubaoCredential {
  return {
    encryptedApiKey: row.encrypted_api_key,
    encryptionNonce: row.encryption_nonce,
    encryptionTag: row.encryption_tag,
    keyVersion: row.key_version,
    enabled: row.enabled,
    status: row.status,
    lastFour: row.last_four,
    lastVerifiedAt: toIsoString(row.last_verified_at),
    lastSuccessAt: toIsoString(row.last_success_at),
    lastErrorCode: row.last_error_code,
  };
}

function toIsoString(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
