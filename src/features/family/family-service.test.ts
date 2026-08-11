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
    householdName?: string;
    members?: { householdId: string; userId: string; role: "owner" | "member" | "readonly" }[];
    validToken?: string | null;
    pendingRequests?: { id: string; householdId: string; userId: string }[];
  } = {},
): FamilyRepository {
  const members = state.members ?? [];
  const pendingRequests = state.pendingRequests ?? [];
  const householdName = state.householdName ?? "My Home";
  const displayNames = new Map<string, string | null>();

  return {
    listHouseholdsForUser: async (userId) =>
      members
        .filter((member) => member.userId === userId)
        .map((member) => {
          const displayName =
            displayNames.get(`${member.userId}:${member.householdId}`) ?? null;
          return {
            id: member.householdId,
            name: householdName,
            displayName,
            effectiveName: displayName ?? householdName,
            role: member.role,
          };
        }),
    createHousehold: async ({ ownerUserId, name }) => {
      members.push({
        householdId: "household-new",
        userId: ownerUserId,
        role: "owner",
      });
      return { id: "household-new", name };
    },
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
        ? { householdId: "household-1", householdName: "My Home" }
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
    updateMemberRole: async ({ householdId, userId, role }) => {
      const member = members.find(
        (item) =>
          item.householdId === householdId && item.userId === userId,
      );

      if (member) {
        member.role = role;
      }
    },
    renameHousehold: async (householdId, name) => ({
      id: householdId,
      name,
    }),
    setHouseholdDisplayName: async ({ userId, householdId, displayName }) => {
      displayNames.set(`${userId}:${householdId}`, displayName);
    },
    getHouseholdName: async () => householdName,
  };
}

describe("createFamilyService", () => {
  it("creates a new owner household with a trimmed name", async () => {
    const members: {
      householdId: string;
      userId: string;
      role: "owner" | "member" | "readonly";
    }[] = [];
    const repository = createMemoryFamilyRepository({ members });
    const service = createFamilyService({ repository });

    await expect(
      service.createHouseholdForCurrentUser({
        userId: "user-1",
        name: "  Pantry  ",
      }),
    ).resolves.toEqual({ id: "household-new", name: "Pantry" });
    expect(members).toContainEqual({
      householdId: "household-new",
      userId: "user-1",
      role: "owner",
    });
  });

  it("rejects creating a household with a blank name", async () => {
    const service = createFamilyService({
      repository: createMemoryFamilyRepository(),
    });

    await expect(
      service.createHouseholdForCurrentUser({
        userId: "user-1",
        name: "   ",
      }),
    ).rejects.toThrow("1-50");
  });

  it("renames a household when the caller is owner", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
    });
    const service = createFamilyService({ repository });

    await expect(
      service.renameHouseholdForCurrentUser({
        userId: "user-1",
        householdId: "household-1",
        name: "New Home",
      }),
    ).resolves.toEqual({ id: "household-1", name: "New Home" });
  });

  it("rejects renaming when the caller is not owner", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-owner",
    });
    const service = createFamilyService({ repository });

    await expect(
      service.renameHouseholdForCurrentUser({
        userId: "user-1",
        householdId: "household-1",
        name: "New Home",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets any household member set a personal display name without renaming the household", async () => {
    const repository = createMemoryFamilyRepository({
      householdName: "My Home",
      members: [
        { householdId: "household-1", userId: "owner", role: "owner" },
        { householdId: "household-1", userId: "member-1", role: "readonly" },
      ],
    });
    const service = createFamilyService({ repository });

    await service.setHouseholdDisplayNameForCurrentUser({
      userId: "member-1",
      householdId: "household-1",
      displayName: " Parents Home ",
    });

    const households = await service.listHouseholdsForCurrentUser("member-1");
    expect(households[0]).toMatchObject({
      id: "household-1",
      name: "My Home",
      displayName: "Parents Home",
      effectiveName: "Parents Home",
      role: "readonly",
    });
    await expect(repository.getHouseholdName("household-1")).resolves.toBe(
      "My Home",
    );
  });

  it("rejects setting a personal display name when the caller is not a household member", async () => {
    const repository = createMemoryFamilyRepository({
      members: [
        { householdId: "household-1", userId: "owner", role: "owner" },
      ],
    });
    const service = createFamilyService({ repository });

    await expect(
      service.setHouseholdDisplayNameForCurrentUser({
        userId: "stranger",
        householdId: "household-1",
        displayName: "Parents Home",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

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

  it("lets the owner switch a member between member and readonly roles", async () => {
    const members = [
      { householdId: "household-1", userId: "user-1", role: "owner" },
      { householdId: "household-1", userId: "user-2", role: "member" },
    ];
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
      members,
    });
    const service = createFamilyService({ repository });

    await service.setMemberRoleForCurrentUser({
      userId: "user-1",
      householdId: "household-1",
      targetUserId: "user-2",
      role: "readonly",
    });

    expect(members.find((member) => member.userId === "user-2")?.role).toBe(
      "readonly",
    );
  });

  it("rejects role changes by a non-owner member", async () => {
    const repository = createMemoryFamilyRepository({
      ownerUserId: "user-1",
      members: [
        { householdId: "household-1", userId: "user-1", role: "owner" },
        { householdId: "household-1", userId: "user-2", role: "member" },
      ],
    });
    const service = createFamilyService({ repository });

    await expect(
      service.setMemberRoleForCurrentUser({
        userId: "user-2",
        householdId: "household-1",
        targetUserId: "user-2",
        role: "readonly",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects the owner changing their own role", async () => {
    const repository = createMemoryFamilyRepository({ ownerUserId: "user-1" });
    const service = createFamilyService({ repository });

    await expect(
      service.setMemberRoleForCurrentUser({
        userId: "user-1",
        householdId: "household-1",
        targetUserId: "user-1",
        role: "readonly",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
