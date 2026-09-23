import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSessionHandlers } from "./handlers";

describe("session refresh route", () => {
  it("rejects requests without a session cookie", async () => {
    let serviceCalled = false;
    const { POST } = createSessionHandlers({
      authService: {
        getCurrentUser: async () => {
          serviceCalled = true;
          return { userId: "user-1", email: "user@example.com" };
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/auth/session", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(serviceCalled).toBe(false);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an invalid session cookie", async () => {
    const seenTokens: string[] = [];
    const { POST } = createSessionHandlers({
      authService: {
        getCurrentUser: async (sessionToken) => {
          seenTokens.push(sessionToken);
          return null;
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/auth/session", {
        method: "POST",
        headers: { cookie: "home_inventory_session=invalid-token" },
      }),
    );

    expect(seenTokens).toEqual(["invalid-token"]);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("extends a valid session cookie without replacing or exposing its token", async () => {
    const seenTokens: string[] = [];
    const now = new Date("2026-09-23T12:34:56.000Z");
    const { POST } = createSessionHandlers({
      authService: {
        getCurrentUser: async (sessionToken) => {
          seenTokens.push(sessionToken);
          return { userId: "user-1", email: "user@example.com" };
        },
      },
      now: () => now,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/auth/session", {
        method: "POST",
        headers: { cookie: "home_inventory_session=existing-token" },
      }),
    );

    expect(seenTokens).toEqual(["existing-token"]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain(
      "home_inventory_session=existing-token",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Thu, 28 Oct 2027 12:34:56 GMT",
    );
  });
});
