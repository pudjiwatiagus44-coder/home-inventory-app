import { describe, expect, it } from "vitest";
import {
  createAuthService,
  type AuthRepository,
  InvalidCredentialsError,
} from "./auth-service";

function createRepository(overrides: Partial<AuthRepository> = {}) {
  const calls: string[] = [];
  const repository: AuthRepository = {
    findUserByEmail: async () => null,
    createUserWithDefaultHousehold: async () => {
      calls.push("createUserWithDefaultHousehold");
      return { userId: "user-1" };
    },
    createSession: async () => {
      calls.push("createSession");
    },
    revokeSessionByHash: async () => {
      calls.push("revokeSessionByHash");
    },
    findSessionByHash: async () => null,
    ...overrides,
  };

  return { calls, repository };
}

describe("createAuthService", () => {
  it("registers with a normalized email, hashed password, default household, and session", async () => {
    const createdUsers: unknown[] = [];
    const createdSessions: unknown[] = [];
    const { repository } = createRepository({
      createUserWithDefaultHousehold: async (input) => {
        createdUsers.push(input);
        return { userId: "user-1" };
      },
      createSession: async (input) => {
        createdSessions.push(input);
      },
    });

    const service = createAuthService({
      repository,
      hashPassword: async (password) => `hashed:${password}`,
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await expect(
      service.register({
        email: " User@Example.COM ",
        password: "password123",
      }),
    ).resolves.toEqual({
      userId: "user-1",
      sessionToken: "plain-session-token",
      expiresAt: new Date("2026-08-05T00:00:00.000Z"),
    });

    expect(createdUsers).toEqual([
      {
        email: "user@example.com",
        passwordHash: "hashed:password123",
      },
    ]);
    expect(createdSessions).toEqual([
      {
        userId: "user-1",
        sessionTokenHash: "hashed-token:plain-session-token",
        expiresAt: new Date("2026-08-05T00:00:00.000Z"),
      },
    ]);
  });

  it("rejects duplicate registration before creating a password hash", async () => {
    let hashCalled = false;
    const { calls, repository } = createRepository({
      findUserByEmail: async () => ({
        id: "user-1",
        email: "user@example.com",
        passwordHash: "existing-hash",
        status: "active",
      }),
    });

    const service = createAuthService({
      repository,
      hashPassword: async () => {
        hashCalled = true;
        return "hash";
      },
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await expect(
      service.register({
        email: "user@example.com",
        password: "password123",
      }),
    ).rejects.toThrow("Email is already registered");

    expect(hashCalled).toBe(false);
    expect(calls).toEqual([]);
  });

  it("logs in with generic invalid credential errors", async () => {
    const { repository } = createRepository();
    const service = createAuthService({
      repository,
      hashPassword: async () => "hash",
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await expect(
      service.login({
        email: "missing@example.com",
        password: "password123",
      }),
    ).rejects.toThrow(new InvalidCredentialsError());
  });

  it("logs in active users and creates a server-side session", async () => {
    const createdSessions: unknown[] = [];
    const { repository } = createRepository({
      findUserByEmail: async () => ({
        id: "user-1",
        email: "user@example.com",
        passwordHash: "stored-hash",
        status: "active",
      }),
      createSession: async (input) => {
        createdSessions.push(input);
      },
    });

    const service = createAuthService({
      repository,
      hashPassword: async () => "hash",
      verifyPassword: async (password, hash) =>
        password === "password123" && hash === "stored-hash",
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await expect(
      service.login({
        email: "USER@example.com",
        password: "password123",
      }),
    ).resolves.toEqual({
      userId: "user-1",
      sessionToken: "plain-session-token",
      expiresAt: new Date("2026-08-05T00:00:00.000Z"),
    });

    expect(createdSessions).toEqual([
      {
        userId: "user-1",
        sessionTokenHash: "hashed-token:plain-session-token",
        expiresAt: new Date("2026-08-05T00:00:00.000Z"),
      },
    ]);
  });

  it("logs out by revoking the session token hash", async () => {
    const revokedHashes: string[] = [];
    const { repository } = createRepository({
      revokeSessionByHash: async (sessionTokenHash) => {
        revokedHashes.push(sessionTokenHash);
      },
    });
    const service = createAuthService({
      repository,
      hashPassword: async () => "hash",
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await service.logout("plain-session-token");

    expect(revokedHashes).toEqual(["hashed-token:plain-session-token"]);
  });

  it("returns null for a missing current session token without querying the repository", async () => {
    const { calls, repository } = createRepository({
      findSessionByHash: async () => {
        calls.push("findSessionByHash");
        return null;
      },
    });
    const service = createAuthService({
      repository,
      hashPassword: async () => "hash",
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await expect(service.getCurrentUser("")).resolves.toBe(null);

    expect(calls).toEqual([]);
  });

  it("resolves the current user from a usable session token", async () => {
    const queriedHashes: string[] = [];
    const { repository } = createRepository({
      findSessionByHash: async (sessionTokenHash) => {
        queriedHashes.push(sessionTokenHash);
        return {
          userId: "user-1",
          email: "user@example.com",
          status: "active",
          expiresAt: new Date("2026-08-05T00:00:00.000Z"),
          revokedAt: null,
        };
      },
    });
    const service = createAuthService({
      repository,
      hashPassword: async () => "hash",
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });

    await expect(
      service.getCurrentUser(
        "plain-session-token",
        new Date("2026-07-07T00:00:00.000Z"),
      ),
    ).resolves.toEqual({
      userId: "user-1",
      email: "user@example.com",
    });
    expect(queriedHashes).toEqual(["hashed-token:plain-session-token"]);
  });

  it("returns null for expired, revoked, disabled, or unknown sessions", async () => {
    const sessions = [
      {
        userId: "user-expired",
        email: "expired@example.com",
        status: "active" as const,
        expiresAt: new Date("2026-07-06T00:00:00.000Z"),
        revokedAt: null,
      },
      {
        userId: "user-revoked",
        email: "revoked@example.com",
        status: "active" as const,
        expiresAt: new Date("2026-08-05T00:00:00.000Z"),
        revokedAt: new Date("2026-07-06T00:00:00.000Z"),
      },
      {
        userId: "user-disabled",
        email: "disabled@example.com",
        status: "disabled" as const,
        expiresAt: new Date("2026-08-05T00:00:00.000Z"),
        revokedAt: null,
      },
      null,
    ];
    const { repository } = createRepository({
      findSessionByHash: async () => sessions.shift() ?? null,
    });
    const service = createAuthService({
      repository,
      hashPassword: async () => "hash",
      verifyPassword: async () => false,
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed-token:${token}`,
      createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
    });
    const now = new Date("2026-07-07T00:00:00.000Z");

    await expect(service.getCurrentUser("expired-token", now)).resolves.toBe(
      null,
    );
    await expect(service.getCurrentUser("revoked-token", now)).resolves.toBe(
      null,
    );
    await expect(service.getCurrentUser("disabled-token", now)).resolves.toBe(
      null,
    );
    await expect(service.getCurrentUser("unknown-token", now)).resolves.toBe(
      null,
    );
  });
});
