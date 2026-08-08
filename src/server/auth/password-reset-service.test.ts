import { describe, expect, it, vi } from "vitest";

import type { AuthUserRecord } from "./auth-service";
import {
  createPasswordResetService,
  InvalidResetTokenError,
  type PasswordResetRepository,
} from "./password-reset-service";
import type { PasswordResetMailer } from "../mail/smtp-mailer";

type FakeToken = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

function createFakeRepository() {
  const users = new Map<string, AuthUserRecord>();
  const tokens: FakeToken[] = [];
  const passwordUpdates: Array<{ userId: string; passwordHash: string }> = [];
  const revokedSessionUserIds: string[] = [];

  const repository: PasswordResetRepository = {
    findUserByEmail: async (email) => {
      for (const user of users.values()) {
        if (user.email === email) {
          return user;
        }
      }

      return null;
    },
    createPasswordResetToken: async ({ userId, tokenHash, expiresAt }) => {
      tokens.push({ userId, tokenHash, expiresAt, usedAt: null });
    },
    findPasswordResetTokenByHash: async (tokenHash) => {
      const token = tokens.find((item) => item.tokenHash === tokenHash);

      if (!token) {
        return null;
      }

      const user = users.get(token.userId);

      if (!user) {
        return null;
      }

      return {
        userId: user.id,
        email: user.email,
        status: user.status,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
      };
    },
    markPasswordResetTokenUsed: async (tokenHash) => {
      const token = tokens.find((item) => item.tokenHash === tokenHash);

      if (token) {
        token.usedAt = new Date("2026-08-08T00:00:00.000Z");
      }
    },
    revokeUnusedPasswordResetTokensByUserId: async (userId) => {
      for (const token of tokens) {
        if (token.userId === userId && !token.usedAt) {
          token.usedAt = new Date("2026-08-08T00:00:00.000Z");
        }
      }
    },
    revokeAllSessionsByUserId: async (userId) => {
      revokedSessionUserIds.push(userId);
    },
    updateUserPassword: async (input) => {
      passwordUpdates.push(input);
    },
  };

  return { users, tokens, passwordUpdates, revokedSessionUserIds, repository };
}

function addActiveUser(
  users: Map<string, AuthUserRecord>,
  email: string,
  userId: string,
) {
  users.set(userId, {
    id: userId,
    email,
    passwordHash: "old-hash",
    status: "active",
  });
}

function createService(
  repository: PasswordResetRepository,
  mailer: PasswordResetMailer,
) {
  return createPasswordResetService({
    repository,
    mailer,
    hashToken: (token) => `hash:${token}`,
    createToken: () => "plain-token",
    hashPassword: async (password) => `hashed:${password}`,
    now: () => new Date("2026-08-08T00:00:00.000Z"),
    buildResetUrl: (token) =>
      `https://homestorag.xyz/reset-password?token=${token}`,
  });
}

describe("password reset service", () => {
  it("sends a reset email and stores a hashed token for an existing active user", async () => {
    const { users, tokens, repository } = createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    const mailer = { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) };
    const service = createService(repository, mailer);

    await service.requestPasswordReset(" User@Example.com ");

    expect(mailer.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      resetUrl: "https://homestorag.xyz/reset-password?token=plain-token",
    });
    expect(tokens).toEqual([
      {
        userId: "user-1",
        tokenHash: "hash:plain-token",
        expiresAt: new Date("2026-08-08T00:30:00.000Z"),
        usedAt: null,
      },
    ]);
  });

  it("does not send email or store a token when the email is unknown", async () => {
    const { tokens, repository } = createFakeRepository();
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await service.requestPasswordReset("missing@example.com");

    expect(tokens).toHaveLength(0);
    expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("does not send email for a disabled user", async () => {
    const { users, tokens, repository } = createFakeRepository();
    users.set("user-2", {
      id: "user-2",
      email: "disabled@example.com",
      passwordHash: "old-hash",
      status: "disabled",
    });
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await service.requestPasswordReset("disabled@example.com");

    expect(tokens).toHaveLength(0);
    expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("revokes previous unused tokens before creating a new one", async () => {
    const { users, tokens, repository } = createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    tokens.push({
      userId: "user-1",
      tokenHash: "hash:old-token",
      expiresAt: new Date("2026-08-09T00:00:00.000Z"),
      usedAt: null,
    });
    const mailer = { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) };
    const service = createService(repository, mailer);

    await service.requestPasswordReset("user@example.com");

    expect(
      tokens.find((item) => item.tokenHash === "hash:old-token")?.usedAt,
    ).not.toBeNull();
    expect(tokens.some((item) => item.tokenHash === "hash:plain-token")).toBe(
      true,
    );
  });

  it("resets the password, marks the token used and revokes all sessions", async () => {
    const { users, tokens, repository, passwordUpdates, revokedSessionUserIds } =
      createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    tokens.push({
      userId: "user-1",
      tokenHash: "hash:plain-token",
      expiresAt: new Date("2026-08-08T00:30:00.000Z"),
      usedAt: null,
    });
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await service.resetPassword({
      token: "plain-token",
      password: "new-password-123",
    });

    expect(passwordUpdates).toEqual([
      { userId: "user-1", passwordHash: "hashed:new-password-123" },
    ]);
    expect(
      tokens.find((item) => item.tokenHash === "hash:plain-token")?.usedAt,
    ).not.toBeNull();
    expect(revokedSessionUserIds).toContain("user-1");
  });

  it("rejects an unknown token", async () => {
    const { users, repository } = createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await expect(
      service.resetPassword({ token: "nope", password: "new-password-123" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("rejects an already used token", async () => {
    const { users, tokens, repository } = createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    tokens.push({
      userId: "user-1",
      tokenHash: "hash:plain-token",
      expiresAt: new Date("2026-08-08T00:30:00.000Z"),
      usedAt: new Date("2026-08-08T00:10:00.000Z"),
    });
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await expect(
      service.resetPassword({ token: "plain-token", password: "new-password-123" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("rejects an expired token", async () => {
    const { users, tokens, repository } = createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    tokens.push({
      userId: "user-1",
      tokenHash: "hash:plain-token",
      expiresAt: new Date("2026-08-07T23:00:00.000Z"),
      usedAt: null,
    });
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await expect(
      service.resetPassword({ token: "plain-token", password: "new-password-123" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const { users, tokens, repository } = createFakeRepository();
    addActiveUser(users, "user@example.com", "user-1");
    tokens.push({
      userId: "user-1",
      tokenHash: "hash:plain-token",
      expiresAt: new Date("2026-08-08T00:30:00.000Z"),
      usedAt: null,
    });
    const mailer = { sendPasswordResetEmail: vi.fn() };
    const service = createService(repository, mailer);

    await expect(
      service.resetPassword({ token: "plain-token", password: "short" }),
    ).rejects.toThrow("密码至少需要 8 位");
  });
});
