import { normalizeAuthEmail, type AuthRepository } from "./auth-service";

type QueryResult<Row> = {
  rows: Row[];
};

export type PostgresQueryClient = {
  query: <Row = unknown>(
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult<Row>>;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  status: "active" | "disabled";
};

type SessionRow = {
  user_id: string;
  email: string;
  status: "active" | "disabled";
  expires_at: Date;
  revoked_at: Date | null;
};

type PasswordResetTokenRow = {
  user_id: string;
  email: string;
  status: "active" | "disabled";
  expires_at: Date;
  used_at: Date | null;
};

type IdRow = {
  id: string;
};

export class PostgresAuthRepositoryNotConnectedError extends Error {
  constructor() {
    super("PostgreSQL auth repository is not connected yet");
    this.name = "PostgresAuthRepositoryNotConnectedError";
  }
}

export function createPostgresAuthRepository(
  client?: PostgresQueryClient,
): AuthRepository {
  if (!client) {
    return createNotConnectedAuthRepository();
  }

  return {
    findUserByEmail: async (email) => {
      const result = await client.query<UserRow>(
        `
          select id, email, password_hash, status
          from users
          where lower(email) = $1
          limit 1
        `,
        [normalizeAuthEmail(email)],
      );
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        status: row.status,
      };
    },
    findSessionByHash: async (sessionTokenHash) => {
      const result = await client.query<SessionRow>(
        `
          select
            auth_sessions.user_id,
            users.email,
            users.status,
            auth_sessions.expires_at,
            auth_sessions.revoked_at
          from auth_sessions
          join users on users.id = auth_sessions.user_id
          where auth_sessions.session_token_hash = $1
          limit 1
        `,
        [sessionTokenHash],
      );
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        userId: row.user_id,
        email: row.email,
        status: row.status,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      };
    },
    createUserWithDefaultHousehold: async ({ email, passwordHash }) => {
      await client.query("begin");

      try {
        const userResult = await client.query<IdRow>(
          `
            insert into users (email, password_hash)
            values ($1, $2)
            returning id
          `,
          [email, passwordHash],
        );
        const userId = requireReturnedId(userResult, "users");

        await client.query(
          `
            insert into profiles (id)
            values ($1)
          `,
          [userId],
        );

        const householdResult = await client.query<IdRow>(
          `
            insert into households (owner_user_id)
            values ($1)
            returning id
          `,
          [userId],
        );
        const householdId = requireReturnedId(householdResult, "households");

        await client.query(
          `
            insert into household_members (household_id, user_id, role)
            values ($1, $2, 'owner')
          `,
          [householdId, userId],
        );

        await client.query("commit");

        return { userId };
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    },
    createSession: async ({ userId, sessionTokenHash, expiresAt }) => {
      await client.query(
        `
          insert into auth_sessions (user_id, session_token_hash, expires_at)
          values ($1, $2, $3)
        `,
        [userId, sessionTokenHash, expiresAt],
      );
    },
    revokeSessionByHash: async (sessionTokenHash) => {
      await client.query(
        `
          update auth_sessions
          set revoked_at = now()
          where session_token_hash = $1
            and revoked_at is null
        `,
        [sessionTokenHash],
      );
    },
    createPasswordResetToken: async ({ userId, tokenHash, expiresAt }) => {
      await client.query(
        `
          insert into password_reset_tokens (user_id, token_hash, expires_at)
          values ($1, $2, $3)
        `,
        [userId, tokenHash, expiresAt],
      );
    },
    findPasswordResetTokenByHash: async (tokenHash) => {
      const result = await client.query<PasswordResetTokenRow>(
        `
          select
            password_reset_tokens.user_id,
            users.email,
            users.status,
            password_reset_tokens.expires_at,
            password_reset_tokens.used_at
          from password_reset_tokens
          join users on users.id = password_reset_tokens.user_id
          where password_reset_tokens.token_hash = $1
          limit 1
        `,
        [tokenHash],
      );
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        userId: row.user_id,
        email: row.email,
        status: row.status,
        expiresAt: row.expires_at,
        usedAt: row.used_at,
      };
    },
    markPasswordResetTokenUsed: async (tokenHash) => {
      await client.query(
        `
          update password_reset_tokens
          set used_at = now()
          where token_hash = $1
            and used_at is null
        `,
        [tokenHash],
      );
    },
    revokeUnusedPasswordResetTokensByUserId: async (userId) => {
      await client.query(
        `
          update password_reset_tokens
          set used_at = now()
          where user_id = $1
            and used_at is null
        `,
        [userId],
      );
    },
    revokeAllSessionsByUserId: async (userId) => {
      await client.query(
        `
          update auth_sessions
          set revoked_at = now()
          where user_id = $1
            and revoked_at is null
        `,
        [userId],
      );
    },
    updateUserPassword: async ({ userId, passwordHash }) => {
      await client.query(
        `
          update users
          set password_hash = $2
          where id = $1
        `,
        [userId, passwordHash],
      );
    },
  };
}

function createNotConnectedAuthRepository(): AuthRepository {
  return {
    findUserByEmail: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    findSessionByHash: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    createUserWithDefaultHousehold: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    createSession: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    revokeSessionByHash: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    createPasswordResetToken: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    findPasswordResetTokenByHash: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    markPasswordResetTokenUsed: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    revokeUnusedPasswordResetTokensByUserId: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    revokeAllSessionsByUserId: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
    updateUserPassword: async () => {
      throw new PostgresAuthRepositoryNotConnectedError();
    },
  };
}

function requireReturnedId(result: QueryResult<IdRow>, tableName: string) {
  const id = result.rows[0]?.id;

  if (!id) {
    throw new Error(`${tableName} insert did not return an id`);
  }

  return id;
}
