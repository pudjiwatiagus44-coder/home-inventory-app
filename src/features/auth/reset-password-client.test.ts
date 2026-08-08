import { describe, expect, it, vi } from "vitest";

import {
  resetPassword,
  ResetPasswordError,
} from "./reset-password-client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resetPassword", () => {
  it("resolves for a successful response with token and password", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true }));

    await expect(
      resetPassword({ token: "plain-token", password: "new-password-123", fetcher }),
    ).resolves.toBeUndefined();

    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toEqual({ token: "plain-token", password: "new-password-123" });
  });

  it("throws the server message for an invalid token", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(400, { ok: false, message: "重置链接无效或已过期" }),
    );

    await expect(
      resetPassword({ token: "bad-token", password: "new-password-123", fetcher }),
    ).rejects.toBeInstanceOf(ResetPasswordError);
    await expect(
      resetPassword({ token: "bad-token", password: "new-password-123", fetcher }),
    ).rejects.toThrow("重置链接无效或已过期");
  });

  it("throws the server message for a too-short password", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(400, { ok: false, message: "密码至少需要 8 位" }),
    );

    await expect(
      resetPassword({ token: "plain-token", password: "short", fetcher }),
    ).rejects.toThrow("密码至少需要 8 位");
  });
});
