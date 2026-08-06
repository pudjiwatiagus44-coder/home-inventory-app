import { describe, expect, it } from "vitest";
import { AuthorizationError } from "../../server/auth/authorization";
import type { FamilyRepository } from "./family-repository";
import {
  createFamilyService,
  FamilyInvitationInvalidError,
} from "./family-service";

function createMemoryFamilyRepository(
  state: {
    ownerUserId?: string | null;
    members?: { householdId: string; userId: string; role: "owner" | "member" }[];
    validToken?: string | null;
    pendingRequests?: { id: string; householdId: string; userId: string }[];
  } = {},
): FamilyRepository {
  const members = state.members ?? [];
  const pendingRequests = state.pendingRequests ?? [];

  return {
    listHouseholdsForUser: async () => [],
    getHouseholdOwner: async () => state.ownerUserId ?? null,
    isHouseholdMember: async (userId, householdId) =>
      members.some(
        (member) =>
          member.userId === userId && member.householdId === householdId,
      ),
    createInvitationLink: async (input) => ({
      id: "link-1",
      household_id: input.householdId,
      token: input.token,
      created_at: "2026-08-06T00:00:00.000Z",
      expires_at: input.expiresAt,
      revoked_at: null,
    }),
    revokeActiveInvitationLinks: async () => undefined,
    getInvitationLinkById: async () => null,
    deleteInvitationLink: async () => undefined,
    listInvitationLinks: async () => [],
    getHouseholdForInvitation: async (token) =>
      token === state.validToken
        ? { householdId: "household-1", householdName: "我的家" }
        : null,
    submitJoinRequest: async ({ householdId, userId }) => {
      const request = {
        id: "request-1",
        householdId,
        userId,
      };
      pendingRequests.push(request);
      return request.id;
    },
    getPendingJoinRequest: async (requestId) => {
      const request = pendingRequests.find((item) => item.id === requestId);
      return request
        ? { householdId: request.householdId, userId: request.userId }
        : null;
    },
    approveJoinRequest: async () => undefined,
    rejectJoinRequest: async () => undefined,
    insertMemberIfMissing: async (input) => {
      members.push({
        householdId: input.householdId,
        userId: input.userId,
        role: input.role,
      });
    },
    listJoinRequests: async () => [],
    listMembers: async () =>
      members.map((member) => ({
        user_id: member.userId,
        email: `${member.userId}@example.com`,
        role: member.role,
        created_at: "2026-08-06T00:00:00.000Z",
      })),
    removeMember: async ({ householdId, userId }) => {
      const index = members.findIndex(
        (member) =>
          member.householdId === householdId && member.userId === userId,
      );

      if (index >= 0) {
        members.splice(index, 1);
      }
    },
    getHouseholdName: async () => "我的家",
  };
}

describe("createFamilyService", () => {
  it("only lets the owner create an invitation link", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
    });
    const service = createFamilyService({ repository });

    await expect(
      service.createInvitationLinkForCurrentUser({
        userId: "user-2",
        householdId: "household-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const link = await service.createInvitationLinkForCurrentUser({
      userId: "user-1",
      householdId: "household-1",
      token: "token_1234567890abcdefgh",
      now: new Date("2026-08-06T00:00:00.000Z"),
    });

    expect(link.household_id).toBe("household-1");
    expect(link.expires_at).toBe("2026-09-05T00:00:00.000Z");
  });

  it("rejects a join application when the token is invalid", async () => {
    const service = createFamilyService({
      repository: createMemoryFamilyRepository({ validToken: null }),
    });

    await expect(
      service.submitJoinRequestForCurrentUser({
        userId: "user-2",
        token: "bad-token",
      }),
    ).rejects.toBeInstanceOf(FamilyInvitationInvalidError);
  });

  it("submits a pending join request for a valid token", async () => {
    const repository = createMemoryFamilyRepository({
      validToken: "token_1234567890abcdefgh",
    });
    const service = createFamilyService({ repository });

    const requestId = await service.submitJoinRequestForCurrentUser({
      userId: "user-2",
      token: "token_1234567890abcdefgh",
    });

    expect(requestId).toBe("request-1");
  });

  it("only lets the household owner approve a join request", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
      pendingRequests: [
        { id: "request-1", householdId: "household-1", userId: "user-2" },
      ],
    });
    const service = createFamilyService({ repository });

    await expect(
      service.approveJoinRequestForCurrentUser({
        userId: "user-3",
        requestId: "request-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("approving a request creates the member relationship", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
      pendingRequests: [
        { id: "request-1", householdId: "household-1", userId: "user-2" },
      ],
    });
    const service = createFamilyService({ repository });

    await service.approveJoinRequestForCurrentUser({
      userId: "user-1",
      requestId: "request-1",
    });

    const members = await service.listMembersForCurrentUser({
      userId: "user-2",
      householdId: "household-1",
    });

    expect(members.some((member) => member.user_id === "user-2")).toBe(true);
  });

  it("lets members list members but not manage invitations", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
      members: [
        { householdId: "household-1", userId: "user-1", role: "owner" },
        { householdId: "household-1", userId: "user-2", role: "member" },
      ],
    });
    const service = createFamilyService({ repository });

    const members = await service.listMembersForCurrentUser({
      userId: "user-2",
      householdId: "household-1",
    });

    expect(members).toHaveLength(2);

    await expect(
      service.createInvitationLinkForCurrentUser({
        userId: "user-2",
        householdId: "household-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("does not let the owner remove themselves", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
      members: [
        { householdId: "household-1", userId: "user-1", role: "owner" },
      ],
    });
    const service = createFamilyService({ repository });

    await expect(
      service.removeMemberForCurrentUser({
        userId: "user-1",
        householdId: "household-1",
        targetUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
