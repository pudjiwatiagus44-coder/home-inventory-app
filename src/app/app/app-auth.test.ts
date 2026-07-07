import { describe, expect, it } from "vitest";

import { resolveSelfHostedAppUser } from "./app-auth";

describe("resolveSelfHostedAppUser", () => {
  it("returns null without creating the auth service when the self-hosted session cookie is missing", async () => {
    let serviceCreated = false;

    await expect(
      resolveSelfHostedAppUser(
        {
          get: () => undefined,
        },
        () => {
          serviceCreated = true;
          return {
            getCurrentUser: async () => ({
              userId: "user-1",
              email: "user@example.com",
            }),
          };
        },
      ),
    ).resolves.toBe(null);

    expect(serviceCreated).toBe(false);
  });

  it("returns the current user from the self-hosted session cookie", async () => {
    const seenTokens: string[] = [];

    await expect(
      resolveSelfHostedAppUser(
        {
          get: () => ({ value: "plain-session-token" }),
        },
        () => ({
          getCurrentUser: async (sessionToken) => {
            seenTokens.push(sessionToken);
            return {
              userId: "user-1",
              email: "user@example.com",
            };
          },
        }),
      ),
    ).resolves.toEqual({
      userId: "user-1",
      email: "user@example.com",
    });

    expect(seenTokens).toEqual(["plain-session-token"]);
  });

  it("falls back to the temporary Supabase path when PostgreSQL auth is not configured", async () => {
    await expect(
      resolveSelfHostedAppUser(
        {
          get: () => ({ value: "plain-session-token" }),
        },
        () => {
          throw new Error("DATABASE_URL is required for PostgreSQL auth");
        },
      ),
    ).resolves.toBe(null);
  });
});
