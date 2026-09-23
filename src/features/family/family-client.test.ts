import { afterEach, describe, expect, it, vi } from "vitest";

import { SESSION_EXPIRED_EVENT } from "../auth/auth-aware-fetch";
import { createFamilyHttpClient } from "./family-client";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createFamilyHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signals an expired session when the default fetch receives 401", async () => {
    const browserWindow = new EventTarget();
    const listener = vi.fn();
    browserWindow.addEventListener(SESSION_EXPIRED_EVENT, listener);
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, message: "Authentication required" }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(createFamilyHttpClient().listHouseholds()).rejects.toThrow(
      "登录已失效，请重新登录",
    );
    expect(listener).toHaveBeenCalledOnce();
  });
  it("lists households from the family API", async () => {
    const requests: unknown[] = [];
    const client = createFamilyHttpClient({
      fetch: async (input, init) => {
        requests.push({ input, init });
        return jsonResponse({
          ok: true,
          data: [{ id: "household-1", name: "我的家", role: "owner" }],
        });
      },
    });

    await expect(client.listHouseholds()).resolves.toEqual([
      { id: "household-1", name: "我的家", role: "owner" },
    ]);
    expect(requests).toEqual([
      {
        input: "/api/family/households",
        init: { method: "GET" },
      },
    ]);
  });

  it("creates an invitation link through the API", async () => {
    const requests: unknown[] = [];
    const client = createFamilyHttpClient({
      fetch: async (input, init) => {
        requests.push({ input, init });
        return jsonResponse({
          ok: true,
          data: {
            id: "link-1",
            token: "abc",
            expiresAt: "2026-09-05T00:00:00.000Z",
            url: "https://homestorag.xyz/join/abc",
          },
        });
      },
    });

    await expect(
      client.createInvitationLink("household-1"),
    ).resolves.toMatchObject({ url: "https://homestorag.xyz/join/abc" });
    expect(requests).toEqual([
      {
        input: "/api/family/invitations",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ householdId: "household-1" }),
        },
      },
    ]);
  });

  it("submits a join application and returns the request id", async () => {
    const client = createFamilyHttpClient({
      fetch: async () =>
        jsonResponse({ ok: true, data: { requestId: "request-1" } }),
    });

    await expect(
      client.submitJoinApplication("token-1"),
    ).resolves.toBe("request-1");
  });

  it("throws the server message when the API returns an error", async () => {
    const client = createFamilyHttpClient({
      fetch: async () =>
        new Response(
          JSON.stringify({ ok: false, message: "邀请链接无效或已过期" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    await expect(client.getJoinInfo("bad-token")).rejects.toThrow(
      "邀请链接无效或已过期",
    );
  });
});
