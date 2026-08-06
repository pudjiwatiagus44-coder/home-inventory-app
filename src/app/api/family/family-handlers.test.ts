import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AuthorizationError } from "../../../server/auth/authorization";
import { createFamilyHandlers } from "./handlers";

const authService = {
  getCurrentUser: async () => ({
    userId: "user-1",
    email: "owner@example.com",
  }),
};

function familyServiceStub(overrides: Record<string, unknown> = {}) {
  return {
    listHouseholdsForCurrentUser: async () => [
      { id: "household-1", name: "我的家", role: "owner" },
    ],
    createInvitationLinkForCurrentUser: async () => ({
      id: "link-1",
      household_id: "household-1",
      token: "token_1234567890abcdefgh",
      created_at: "2026-08-06T00:00:00.000Z",
      expires_at: "2026-09-05T00:00:00.000Z",
      revoked_at: null,
    }),
    revokeInvitationLinkForCurrentUser: async () => undefined,
    listInvitationLinksForCurrentUser: async () => [],
    getHouseholdForInvitationForCurrentUser: async () => ({
      householdId: "household-1",
      householdName: "我的家",
    }),
    submitJoinRequestForCurrentUser: async () => "request-1",
    listJoinRequestsForCurrentUser: async () => [],
    listMembersForCurrentUser: async () => [],
    approveJoinRequestForCurrentUser: async () => undefined,
    rejectJoinRequestForCurrentUser: async () => undefined,
    removeMemberForCurrentUser: async () => undefined,
    ...overrides,
  };
}

function authedRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie: "home_inventory_session=session-token",
    },
  });
}

describe("family API handlers", () => {
  it("returns 401 without a self-hosted session", async () => {
    const handlers = createFamilyHandlers();

    const response = await handlers.listHouseholds(
      new NextRequest("http://localhost/api/family/households"),
    );

    expect(response.status).toBe(401);
  });

  it("creates an invitation link with a join URL", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub(),
    });

    const response = await handlers.createInvitation(
      authedRequest("http://localhost/api/family/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ householdId: "household-1" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        id: "link-1",
        token: "token_1234567890abcdefgh",
        expiresAt: "2026-09-05T00:00:00.000Z",
        url: "http://localhost/join/token_1234567890abcdefgh",
      },
    });
  });

  it("returns 403 when a non-owner tries to approve a request", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        approveJoinRequestForCurrentUser: async () => {
          throw new AuthorizationError("只有房主可以管理成员和邀请");
        },
      }),
    });

    const response = await handlers.approveJoinRequest(
      authedRequest(
        "http://localhost/api/family/join-requests/request-1/approve",
        { method: "POST" },
      ),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when the invitation token is invalid", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        getHouseholdForInvitationForCurrentUser: async () => null,
      }),
    });

    const response = await handlers.getJoinInfo(
      authedRequest("http://localhost/api/join/bad-token"),
      { params: Promise.resolve({ token: "bad-token" }) },
    );

    expect(response.status).toBe(404);
  });

  it("submits a join application for a valid token", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub(),
    });

    const response = await handlers.submitJoinApplication(
      authedRequest(
        "http://localhost/api/join/token_1234567890abcdefgh/apply",
        { method: "POST" },
      ),
      { params: Promise.resolve({ token: "token_1234567890abcdefgh" }) },
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { requestId: "request-1" },
    });
  });
});
