import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createForgotPasswordHandler } from "./forgot-password/handler";
import { createResetPasswordHandler } from "./reset-password/handler";
import {
  InvalidResetTokenError,
  type PasswordResetService,
} from "../../../server/auth/password-reset-service";
import { RateLimitExceededError } from "../../../server/auth/forgot-password-rate-limiter";
import {
  SmtpNotConfiguredError,
  SmtpSendFailedError,
} from "../../../server/mail/smtp-mailer";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createPasswordResetServiceDouble(
  overrides: Partial<PasswordResetService> = {},
): PasswordResetService {
  return {
    requestPasswordReset: async () => {
      throw new Error("unexpected requestPasswordReset call");
    },
    resetPassword: async () => {
      throw new Error("unexpected resetPassword call");
    },
    ...overrides,
  };
}

describe("forgot-password route", () => {
  it("returns ok and requests a reset for a valid email", async () => {
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
    const handler = createForgotPasswordHandler({
      service: createPasswordResetServiceDouble({ requestPasswordReset }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/forgot-password", {
        email: " User@Example.com ",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(requestPasswordReset).toHaveBeenCalledWith("User@Example.com");
  });

  it("returns 400 for an invalid email", async () => {
    const requestPasswordReset = vi.fn();
    const handler = createForgotPasswordHandler({
      service: createPasswordResetServiceDouble({ requestPasswordReset }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/forgot-password", {
        email: "not-an-email",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "请输入有效邮箱",
    });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    const handler = createForgotPasswordHandler({
      service: createPasswordResetServiceDouble(),
      rateLimiter: {
        check: () => {
          throw new RateLimitExceededError();
        },
      },
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/forgot-password", {
        email: "user@example.com",
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "请求过于频繁，请稍后再试",
    });
  });

  it("maps unconfigured SMTP to 501", async () => {
    const handler = createForgotPasswordHandler({
      service: createPasswordResetServiceDouble({
        requestPasswordReset: async () => {
          throw new SmtpNotConfiguredError();
        },
      }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/forgot-password", {
        email: "user@example.com",
      }),
    );

    expect(response.status).toBe(501);
  });

  it("maps SMTP send failures to 500", async () => {
    const handler = createForgotPasswordHandler({
      service: createPasswordResetServiceDouble({
        requestPasswordReset: async () => {
          throw new SmtpSendFailedError(new Error("boom"));
        },
      }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/forgot-password", {
        email: "user@example.com",
      }),
    );

    expect(response.status).toBe(500);
  });
});

describe("reset-password route", () => {
  it("returns ok and resets the password with token and password", async () => {
    const resetPassword = vi.fn().mockResolvedValue(undefined);
    const handler = createResetPasswordHandler({
      service: createPasswordResetServiceDouble({ resetPassword }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/reset-password", {
        token: "plain-token",
        password: "new-password-123",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(resetPassword).toHaveBeenCalledWith({
      token: "plain-token",
      password: "new-password-123",
    });
  });

  it("returns 400 when the token is missing", async () => {
    const resetPassword = vi.fn();
    const handler = createResetPasswordHandler({
      service: createPasswordResetServiceDouble({ resetPassword }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/reset-password", {
        password: "new-password-123",
      }),
    );

    expect(response.status).toBe(400);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("maps an invalid token to 400 with the unified message", async () => {
    const handler = createResetPasswordHandler({
      service: createPasswordResetServiceDouble({
        resetPassword: async () => {
          throw new InvalidResetTokenError();
        },
      }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/reset-password", {
        token: "bad-token",
        password: "new-password-123",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "重置链接无效或已过期",
    });
  });

  it("maps a too-short password to 400", async () => {
    const handler = createResetPasswordHandler({
      service: createPasswordResetServiceDouble({
        resetPassword: async () => {
          throw new Error("密码至少需要 8 位");
        },
      }),
    });

    const response = await handler(
      jsonRequest("http://localhost/api/auth/reset-password", {
        token: "plain-token",
        password: "short",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "密码至少需要 8 位",
    });
  });
});
