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
      invitationId: "invitation-1",
      grants: [{ householdId: "household-1", role: "member" }],
    }),
    submitJoinRequestForCurrentUser: async () => "request-1",
    listJoinRequestsForCurrentUser: async () => [],
    listMembersForCurrentUser: async () => [],
    approveJoinRequestForCurrentUser: async () => undefined,
    rejectJoinRequestForCurrentUser: async () => undefined,
    removeMemberForCurrentUser: async () => undefined,
    setMemberRoleForCurrentUser: async () => undefined,
    createHouseholdForCurrentUser: async () => ({
      id: "household-new",
      name: "储藏间",
    }),
    renameHouseholdForCurrentUser: async () => ({
      id: "household-1",
      name: "我的家",
    }),
    setHouseholdDisplayNameForCurrentUser: async () => undefined,
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
  it("creates a household for the current user", async () => {
    const calls: unknown[] = [];
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        createHouseholdForCurrentUser: async (input: unknown) => {
          calls.push(input);
          return { id: "household-new", name: "储藏间" };
        },
      }),
    });

    const response = await handlers.createHousehold(
      authedRequest("http://localhost/api/family/households", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "储藏间" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ userId: "user-1", name: "储藏间" }]);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "household-new", name: "储藏间" },
    });
  });

  it("renames a household for the owner", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub(),
    });

    const response = await handlers.renameHousehold(
      authedRequest("http://localhost/api/family/households", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ householdId: "household-1", name: "新家名" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "household-1", name: "我的家" },
    });
  });

  it("sets a personal household display name for the current user", async () => {
    const calls: unknown[] = [];
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        setHouseholdDisplayNameForCurrentUser: async (input: unknown) => {
          calls.push(input);
        },
      }),
    });

    const response = await handlers.setHouseholdDisplayName(
      authedRequest("http://localhost/api/family/households/display-name", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          householdId: "household-1",
          displayName: "Parents Home",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        userId: "user-1",
        householdId: "household-1",
        displayName: "Parents Home",
      },
    ]);
    await expect(response.json()).resolves.toEqual({ ok: true, data: null });
  });

  it("returns 403 when a non-owner tries to rename", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        renameHouseholdForCurrentUser: async () => {
          throw new AuthorizationError("只有房主可以管理成员和邀请");
        },
      }),
    });

    const response = await handlers.renameHousehold(
      authedRequest("http://localhost/api/family/households", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ householdId: "household-1", name: "新家名" }),
      }),
    );

    expect(response.status).toBe(403);
  });

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

  it("accepts invitation grants in POST /api/family/invitations", async () => {
    const calls: unknown[] = [];
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        createInvitationLinkForCurrentUser: async (input: unknown) => {
          calls.push(input);
          return {
            id: "link-1",
            household_id: "household-1",
            token: "token_1234567890abcdefgh",
            created_at: "2026-08-06T00:00:00.000Z",
            expires_at: "2026-09-05T00:00:00.000Z",
            revoked_at: null,
          };
        },
      }),
    });

    const response = await handlers.createInvitation(
      authedRequest("http://localhost/api/family/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grants: [
            { householdId: "household-1", role: "member" },
            { householdId: "household-2", role: "readonly" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        userId: "user-1",
        grants: [
          { householdId: "household-1", role: "member" },
          { householdId: "household-2", role: "readonly" },
        ],
      },
    ]);
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

  it("returns 400 when PATCH member role is missing householdId", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub(),
    });

    const response = await handlers.updateMemberRole(
      authedRequest("http://localhost/api/family/members/user-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "readonly" }),
      }),
      { params: Promise.resolve({ userId: "user-2" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "缺少家庭 ID",
    });
  });

  it("passes contributor member role updates through PATCH member role", async () => {
    const calls: unknown[] = [];
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub({
        setMemberRoleForCurrentUser: async (input: unknown) => {
          calls.push(input);
        },
      }),
    });

    const response = await handlers.updateMemberRole(
      authedRequest("http://localhost/api/family/members/user-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          householdId: "household-1",
          role: "contributor",
        }),
      }),
      { params: Promise.resolve({ userId: "user-2" }) },
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        userId: "user-1",
        householdId: "household-1",
        targetUserId: "user-2",
        role: "contributor",
      },
    ]);
    await expect(response.json()).resolves.toEqual({ ok: true, data: null });
  });

  it("returns 400 when DELETE member is missing householdId", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub(),
    });

    const response = await handlers.removeMember(
      authedRequest("http://localhost/api/family/members/user-2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ userId: "user-2" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "缺少家庭 ID",
    });
  });

  it("returns 400 when listing members is missing householdId", async () => {
    const handlers = createFamilyHandlers({
      authService,
      familyService: familyServiceStub(),
    });

    const response = await handlers.listMembers(
      authedRequest("http://localhost/api/family/members"),
    );

    expect(response.status).toBe(400);
  });
});
