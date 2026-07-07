import { describe, expect, it, vi } from "vitest";

import {
  authenticateWithSelfHostedApi,
  SelfHostedAuthError,
} from "./self-hosted-auth-client";

describe("authenticateWithSelfHostedApi", () => {
  it("posts sign-in credentials to the self-hosted login API", async () => {
    const fetcher = vi.fn(async () => responseJson({ ok: true }));

    await authenticateWithSelfHostedApi({
      mode: "sign-in",
      email: " User@Example.com ",
      password: "password123",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        password: "password123",
      }),
    });
  });

  it("posts sign-up credentials to the self-hosted register API", async () => {
    const fetcher = vi.fn(async () => responseJson({ ok: true }));

    await authenticateWithSelfHostedApi({
      mode: "sign-up",
      email: "new@example.com",
      password: "password123",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@example.com",
        password: "password123",
      }),
    });
  });

  it("throws the API error message when authentication fails", async () => {
    const fetcher = vi.fn(async () =>
      responseJson({ ok: false, message: "Invalid email or password" }, false),
    );

    await expect(
      authenticateWithSelfHostedApi({
        mode: "sign-in",
        email: "user@example.com",
        password: "wrong-password",
        fetcher,
      }),
    ).rejects.toEqual(new SelfHostedAuthError("Invalid email or password"));
  });
});

function responseJson(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}
