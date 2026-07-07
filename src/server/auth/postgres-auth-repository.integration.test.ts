import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAuthService } from "./auth-service";
import { createPostgresAuthRepository } from "./postgres-auth-repository";
import { getPostgresIntegrationConfig } from "../db/postgres-integration-config";

const integrationConfig = getPostgresIntegrationConfig();

type IntegrationQueryResult<Row> = {
  rows: Row[];
};

type IntegrationPool = {
  query: <Row = unknown>(
    text: string,
    values?: unknown[],
  ) => Promise<IntegrationQueryResult<Row>>;
  end: () => Promise<void>;
};

describe("PostgreSQL auth repository integration", () => {
  let pool: IntegrationPool | null = null;

  beforeAll(async () => {
    if (!integrationConfig.enabled) {
      return;
    }

    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: integrationConfig.connectionString });
    await resetPublicSchema(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  test.skipIf(!integrationConfig.enabled)(
    "persists register, login, and logout against the schema draft",
    async () => {
      if (!pool) {
        throw new Error("PostgreSQL integration pool was not initialized");
      }

      const repository = createPostgresAuthRepository(pool);
      const sessionTokens = ["register-token", "login-token"];
      const authService = createAuthService({
        repository,
        hashPassword: async (password) => `hash:${password}`,
        verifyPassword: async (password, passwordHash) =>
          passwordHash === `hash:${password}`,
        createSessionToken: () => sessionTokens.shift() ?? "unexpected-token",
        hashSessionToken: (token) => `hashed:${token}`,
        createSessionExpiry: () => new Date("2030-01-01T00:00:00.000Z"),
      });

      const registerResult = await authService.register({
        email: " Owner@Example.com ",
        password: "valid-password",
      });
      const loginResult = await authService.login({
        email: "owner@example.com",
        password: "valid-password",
      });
      await authService.logout(loginResult.sessionToken);

      expect(registerResult.sessionToken).toBe("register-token");
      expect(loginResult.sessionToken).toBe("login-token");

      const result = await pool.query<{
        user_count: string;
        profile_count: string;
        household_count: string;
        membership_count: string;
        session_count: string;
        revoked_login_session_count: string;
      }>(
        `
          select
            (select count(*) from users where email = 'owner@example.com') as user_count,
            (select count(*) from profiles where id = $1) as profile_count,
            (select count(*) from households where owner_user_id = $1) as household_count,
            (select count(*) from household_members where user_id = $1 and role = 'owner') as membership_count,
            (select count(*) from auth_sessions where user_id = $1) as session_count,
            (
              select count(*)
              from auth_sessions
              where session_token_hash = 'hashed:login-token'
                and revoked_at is not null
            ) as revoked_login_session_count
        `,
        [registerResult.userId],
      );

      expect(result.rows[0]).toEqual({
        user_count: "1",
        profile_count: "1",
        household_count: "1",
        membership_count: "1",
        session_count: "2",
        revoked_login_session_count: "1",
      });
    },
  );

  test.skipIf(integrationConfig.enabled)(
    `skips until ${integrationConfig.enabled ? "" : integrationConfig.reason}`,
    () => {
      expect(integrationConfig.enabled).toBe(false);
    },
  );
});

async function resetPublicSchema(pool: IntegrationPool) {
  const schemaSql = await readFile(
    path.join(process.cwd(), "dev-docs/sql/mainland_initial_schema.sql"),
    "utf8",
  );

  await pool.query("drop schema public cascade");
  await pool.query("create schema public");
  await pool.query(schemaSql);
}
