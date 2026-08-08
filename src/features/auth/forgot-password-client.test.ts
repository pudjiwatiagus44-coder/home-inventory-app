import { describe, expect, it, vi } from "vitest";

import {
  ForgotPasswordError,
  requestPasswordReset,
} from "./forgot-password-client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("requestPasswordReset", () => {
  it("resolves for a successful response and normalizes the email", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true }));

    await expect(
      requestPasswordReset({ email: " User@Example.com ", fetcher }),
    ).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toEqual({ email: "user@example.com" });
  });

  it("throws the server message for a 400 response", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(400, { ok: false, message: "请输入有效邮箱" }),
    );

    await expect(
      requestPasswordReset({ email: "not-an-email", fetcher }),
    ).rejects.toBeInstanceOf(ForgotPasswordError);
    await expect(
      requestPasswordReset({ email: "not-an-email", fetcher }),
    ).rejects.toThrow("请输入有效邮箱");
  });

  it("throws the server message for a 429 response", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(429, { ok: false, message: "请求过于频繁，请稍后再试" }),
    );

    await expect(
      requestPasswordReset({ email: "user@example.com", fetcher }),
    ).rejects.toThrow("请求过于频繁，请稍后再试");
  });
});
