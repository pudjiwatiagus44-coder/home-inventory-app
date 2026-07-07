import { describe, expect, it } from "vitest";
import { createPostgresAuthRepository } from "./postgres-auth-repository";

type QueryCall = {
  text: string;
  values?: unknown[];
};

function createQueryClient(results: unknown[] = []) {
  const calls: QueryCall[] = [];

  return {
    calls,
    client: {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        const result = results.shift();
        return result ?? { rows: [] };
      },
    },
  };
}

describe("createPostgresAuthRepository", () => {
  it("exposes the auth repository contract without opening a database connection", async () => {
    const repository = createPostgresAuthRepository();

    await expect(repository.findUserByEmail("user@example.com")).rejects.toThrow(
      "PostgreSQL auth repository is not connected yet",
    );
    await expect(
      repository.createUserWithDefaultHousehold({
        email: "user@example.com",
        passwordHash: "hash",
      }),
    ).rejects.toThrow("PostgreSQL auth repository is not connected yet");
    await expect(
      repository.createSession({
        userId: "user-1",
        sessionTokenHash: "hash",
        expiresAt: new Date("2026-08-05T00:00:00.000Z"),
      }),
    ).rejects.toThrow("PostgreSQL auth repository is not connected yet");
    await expect(repository.revokeSessionByHash("hash")).rejects.toThrow(
      "PostgreSQL auth repository is not connected yet",
    );
    await expect(repository.findSessionByHash("hash")).rejects.toThrow(
      "PostgreSQL auth repository is not connected yet",
    );
  });

  it("finds a user by normalized email", async () => {
    const { calls, client } = createQueryClient([
      {
        rows: [
          {
            id: "user-1",
            email: "user@example.com",
            password_hash: "stored-hash",
            status: "active",
          },
        ],
      },
    ]);
    const repository = createPostgresAuthRepository(client);

    await expect(repository.findUserByEmail("USER@example.com")).resolves.toEqual(
      {
        id: "user-1",
        email: "user@example.com",
        passwordHash: "stored-hash",
        status: "active",
      },
    );

    expect(calls).toEqual([
      {
        text: expect.stringContaining("from users"),
        values: ["user@example.com"],
      },
    ]);
  });

  it("returns null when an email is not registered", async () => {
    const { client } = createQueryClient([{ rows: [] }]);
    const repository = createPostgresAuthRepository(client);

    await expect(repository.findUserByEmail("missing@example.com")).resolves.toBe(
      null,
    );
  });

  it("creates a user with profile, default household, and owner membership in one transaction", async () => {
    const { calls, client } = createQueryClient([
      undefined,
      { rows: [{ id: "user-1" }] },
      undefined,
      { rows: [{ id: "household-1" }] },
      undefined,
      undefined,
    ]);
    const repository = createPostgresAuthRepository(client);

    await expect(
      repository.createUserWithDefaultHousehold({
        email: "user@example.com",
        passwordHash: "stored-hash",
      }),
    ).resolves.toEqual({ userId: "user-1" });

    expect(calls.map((call) => call.text.trim().split(/\s+/).slice(0, 3).join(" "))).toEqual([
      "begin",
      "insert into users",
      "insert into profiles",
      "insert into households",
      "insert into household_members",
      "commit",
    ]);
    expect(calls[1].values).toEqual(["user@example.com", "stored-hash"]);
    expect(calls[2].values).toEqual(["user-1"]);
    expect(calls[3].values).toEqual(["user-1"]);
    expect(calls[4].values).toEqual(["household-1", "user-1"]);
  });

  it("rolls back user bootstrap when the transaction fails", async () => {
    const calls: QueryCall[] = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });

        if (text.includes("insert into profiles")) {
          throw new Error("profile insert failed");
        }

        if (text.includes("insert into users")) {
          return { rows: [{ id: "user-1" }] };
        }

        return { rows: [] };
      },
    };
    const repository = createPostgresAuthRepository(client);

    await expect(
      repository.createUserWithDefaultHousehold({
        email: "user@example.com",
        passwordHash: "stored-hash",
      }),
    ).rejects.toThrow("profile insert failed");

    expect(calls.map((call) => call.text.trim().toLowerCase())).toContain(
      "rollback",
    );
  });

  it("creates and revokes sessions by token hash", async () => {
    const { calls, client } = createQueryClient();
    const repository = createPostgresAuthRepository(client);
    const expiresAt = new Date("2026-08-05T00:00:00.000Z");

    await repository.createSession({
      userId: "user-1",
      sessionTokenHash: "token-hash",
      expiresAt,
    });
    await repository.revokeSessionByHash("token-hash");

    expect(calls[0]).toEqual({
      text: expect.stringContaining("insert into auth_sessions"),
      values: ["user-1", "token-hash", expiresAt],
    });
    expect(calls[1]).toEqual({
      text: expect.stringContaining("update auth_sessions"),
      values: ["token-hash"],
    });
  });

  it("finds a session with its active user by token hash", async () => {
    const expiresAt = new Date("2026-08-05T00:00:00.000Z");
    const revokedAt = new Date("2026-07-07T00:00:00.000Z");
    const { calls, client } = createQueryClient([
      {
        rows: [
          {
            user_id: "user-1",
            email: "user@example.com",
            status: "active",
            expires_at: expiresAt,
            revoked_at: revokedAt,
          },
        ],
      },
    ]);
    const repository = createPostgresAuthRepository(client);

    await expect(repository.findSessionByHash("token-hash")).resolves.toEqual({
      userId: "user-1",
      email: "user@example.com",
      status: "active",
      expiresAt,
      revokedAt,
    });

    expect(calls).toEqual([
      {
        text: expect.stringContaining("from auth_sessions"),
        values: ["token-hash"],
      },
    ]);
    expect(calls[0].text).toContain("join users");
  });

  it("returns null when a session hash is unknown", async () => {
    const { client } = createQueryClient([{ rows: [] }]);
    const repository = createPostgresAuthRepository(client);

    await expect(repository.findSessionByHash("missing-hash")).resolves.toBe(
      null,
    );
  });
});
