import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  createAuthErrorResponse,
  createAuthSuccessResponse,
  createLogoutSuccessResponse,
  createRouteAuthService,
  getCurrentUserFromRequest,
} from "./route-helpers";
import { PostgresDatabaseNotConfiguredError } from "../../../server/db/postgres";

describe("auth route helpers", () => {
  it("returns a not configured response when DATABASE_URL is missing", async () => {
    const response = createAuthErrorResponse(
      new PostgresDatabaseNotConfiguredError(),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "DATABASE_URL is required for PostgreSQL auth",
    });
    expect(response.status).toBe(501);
  });

  it("creates the auth service with a PostgreSQL query client from server env", async () => {
    const queries: unknown[] = [];
    const queryResults: unknown[] = [
      { rows: [] },
      undefined,
      { rows: [{ id: "user-1" }] },
      undefined,
      { rows: [{ id: "household-1" }] },
      undefined,
      undefined,
      undefined,
    ];
    const service = createRouteAuthService(
      { DATABASE_URL: "postgres://local-test.example/home_inventory" },
      {
        createPool: () => ({
          query: async (text, values) => {
            queries.push({ text, values });
            return queryResults.shift() ?? { rows: [] };
          },
        }),
        hashPassword: async () => "stored-hash",
        createSessionToken: () => "plain-session-token",
        hashSessionToken: () => "session-token-hash",
        createSessionExpiry: () => new Date("2026-08-05T00:00:00.000Z"),
      },
    );

    await expect(
      service.register({
        email: "user@example.com",
        password: "password123",
      }),
    ).resolves.toEqual({
      userId: "user-1",
      sessionToken: "plain-session-token",
      expiresAt: new Date("2026-08-05T00:00:00.000Z"),
    });

    expect(queries).toEqual(
      expect.arrayContaining([
        {
          text: expect.stringContaining("from users"),
          values: ["user@example.com"],
        },
        {
          text: expect.stringContaining("insert into auth_sessions"),
          values: [
            "user-1",
            "session-token-hash",
            new Date("2026-08-05T00:00:00.000Z"),
          ],
        },
      ]),
    );
  });

  it("returns null for current user requests without a session cookie", async () => {
    let serviceCalled = false;
    const request = new NextRequest("http://localhost/api/me");

    await expect(
      getCurrentUserFromRequest(request, {
        getCurrentUser: async () => {
          serviceCalled = true;
          return { userId: "user-1", email: "user@example.com" };
        },
      }),
    ).resolves.toBe(null);

    expect(serviceCalled).toBe(false);
  });

  it("resolves the current user from the auth session cookie", async () => {
    const seenTokens: string[] = [];
    const request = new NextRequest("http://localhost/api/me", {
      headers: {
        cookie: "home_inventory_session=plain-session-token",
      },
    });

    await expect(
      getCurrentUserFromRequest(request, {
        getCurrentUser: async (sessionToken) => {
          seenTokens.push(sessionToken);
          return { userId: "user-1", email: "user@example.com" };
        },
      }),
    ).resolves.toEqual({
      userId: "user-1",
      email: "user@example.com",
    });

    expect(seenTokens).toEqual(["plain-session-token"]);
  });

  it("allows the test server to opt out of secure auth cookies over HTTP", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAuthCookieSecure = process.env.AUTH_COOKIE_SECURE;
    process.env.NODE_ENV = "production";
    process.env.AUTH_COOKIE_SECURE = "false";

    try {
      const loginResponse = createAuthSuccessResponse({
        userId: "user-1",
        sessionToken: "plain-session-token",
        expiresAt: new Date("2026-08-05T00:00:00.000Z"),
      });
      const logoutResponse = createLogoutSuccessResponse();

      expect(loginResponse.headers.get("set-cookie")).not.toContain("Secure");
      expect(logoutResponse.headers.get("set-cookie")).not.toContain("Secure");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.AUTH_COOKIE_SECURE = originalAuthCookieSecure;
    }
  });
});
