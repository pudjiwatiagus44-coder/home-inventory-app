import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "dev-docs/sql/bookkeeping_doubao_credentials_20260912.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("bookkeeping Doubao credential migration", () => {
  it("stores one encrypted credential per account with the required lifecycle metadata", () => {
    const sql = readMigration();
    const normalized = sql.replace(/\s+/g, " ");

    expect(normalized).toContain(
      "account_id uuid primary key references bookkeeping_accounts(id) on delete cascade",
    );
    expect(normalized).toContain("encrypted_api_key bytea not null");
    expect(normalized).toContain("encryption_nonce bytea not null");
    expect(normalized).toContain("encryption_tag bytea not null");
    expect(normalized).toContain("key_version integer not null");
    expect(normalized).toContain("enabled boolean not null default true");
    expect(normalized).toContain("last_four text not null");
    expect(normalized).toMatch(/status text not null[^;]*check \(status in \('active', 'quota_exhausted', 'auth_invalid'\)\)/);
    expect(normalized).toContain("last_verified_at timestamptz");
    expect(normalized).toContain("last_success_at timestamptz");
    expect(normalized).toContain("last_error_code text");
    expect(normalized).toContain("created_at timestamptz not null default now()");
    expect(normalized).toContain("updated_at timestamptz not null default now()");
  });

  it("automatically refreshes updated_at and never defines a plaintext API key column", () => {
    const sql = readMigration();
    const normalized = sql.replace(/\s+/g, " ");

    expect(normalized).toContain("create trigger bookkeeping_doubao_credentials_set_updated_at");
    expect(normalized).toContain("before update on bookkeeping_doubao_credentials");
    expect(normalized).toContain("for each row execute function set_updated_at()");
    expect(normalized).toContain("execute function set_updated_at()");
    expect(sql).not.toMatch(/^\s*(api_key|plaintext_api_key|doubao_api_key)\s+/m);
  });
});
