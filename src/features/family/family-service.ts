import { AuthorizationError } from "../../server/auth/authorization";
import type { FamilyRepository } from "./family-repository";
import {
  generateInvitationToken,
  getInvitationExpiresAt,
  type FamilyJoinRequestRow,
  type FamilyMemberRow,
  type HouseholdRole,
  type HouseholdOption,
  type InvitationGrant,
  type InvitationLinkRow,
} from "./family-data";

type FamilyServiceDependencies = {
  repository: FamilyRepository;
};

export class FamilyInvitationInvalidError extends Error {
  constructor() {
    super("邀请链接无效或已过期");
    this.name = "FamilyInvitationInvalidError";
  }
}

export class FamilyJoinRequestNotFoundError extends Error {
  constructor() {
    super("加入申请不存在或已处理");
    this.name = "FamilyJoinRequestNotFoundError";
  }
}

export function createFamilyService({
  repository,
}: FamilyServiceDependencies) {
  async function assertOwner(userId: string, householdId: string) {
    const ownerId = await repository.getHouseholdOwner(householdId);

    if (ownerId !== userId) {
      throw new AuthorizationError("只有房主可以管理成员和邀请");
    }
  }

  async function assertCanManageHousehold(
    userId: string,
    householdId: string,
  ) {
    const role = await repository.getHouseholdMemberRole(userId, householdId);

    if (role !== "owner" && role !== "member") {
      throw new AuthorizationError("只有房主或管理成员可以管理邀请和授权");
    }
  }

  async function assertMember(userId: string, householdId: string) {
    const isMember = await repository.isHouseholdMember(userId, householdId);

    if (!isMember) {
      throw new AuthorizationError("无权访问该家庭空间");
    }
  }

  const service = {
    async listHouseholdsForCurrentUser(
      userId: string,
    ): Promise<HouseholdOption[]> {
      return repository.listHouseholdsForUser(userId);
    },

    async createHouseholdForCurrentUser(input: {
      userId: string;
      name: string;
    }): Promise<{ id: string; name: string }> {
      const normalizedName = input.name.trim();

      if (!normalizedName || normalizedName.length > 50) {
        throw new Error("家庭名称需要 1-50 个字符");
      }

      return repository.createHousehold({
        ownerUserId: input.userId,
        name: normalizedName,
      });
    },

    async createInvitationLinkForCurrentUser(input: {
      userId: string;
      householdId?: string;
      grants?: InvitationGrant[];
      token?: string;
      now?: Date;
    }): Promise<InvitationLinkRow> {
      const grants = normalizeInvitationGrants(input);

      for (const grant of grants) {
        await assertCanManageHousehold(input.userId, grant.householdId);
      }

      const now = input.now ?? new Date();
      const token = input.token ?? generateInvitationToken();
      const expiresAt = getInvitationExpiresAt(now);
      const householdIds = [
        ...new Set(grants.map((grant) => grant.householdId)),
      ];

      for (const householdId of householdIds) {
        await repository.revokeActiveInvitationLinks(householdId);
      }

      const link = await repository.createInvitationLink({
        householdId: householdIds[0] ?? null,
        token,
        expiresAt,
        createdBy: input.userId,
      });
      await repository.insertInvitationGrants({
        invitationId: link.id,
        grants,
      });
      return link;
    },

    async revokeInvitationLinkForCurrentUser(input: {
      userId: string;
      linkId: string;
    }): Promise<void> {
      const link = await repository.getInvitationLinkById(input.linkId);

      if (!link) {
        return;
      }

      const grants = await repository.listInvitationGrants(link.id);

      if (grants.length > 0) {
        for (const grant of grants) {
          await assertCanManageHousehold(input.userId, grant.householdId);
        }
      } else {
        await assertCanManageHousehold(input.userId, link.household_id);
      }
      await repository.deleteInvitationLink(input.linkId);
    },

    async listInvitationLinksForCurrentUser(input: {
      userId: string;
      householdId: string;
    }): Promise<InvitationLinkRow[]> {
      await assertCanManageHousehold(input.userId, input.householdId);
      return repository.listInvitationLinks(input.householdId);
    },

    async getHouseholdForInvitationForCurrentUser(input: {
      userId: string;
      token: string;
    }): Promise<{
      householdId: string;
      householdName: string;
      invitationId: string;
      grants: InvitationGrant[];
    } | null> {
      void input.userId;
      return repository.getHouseholdForInvitation(input.token);
    },

    async submitJoinRequestForCurrentUser(input: {
      userId: string;
      token: string;
    }): Promise<string> {
      const household = await repository.getHouseholdForInvitation(input.token);

      if (!household) {
        throw new FamilyInvitationInvalidError();
      }

      return repository.submitJoinRequest({
        householdId: household.householdId,
        invitationId: household.invitationId,
        userId: input.userId,
      });
    },

    async listJoinRequestsForCurrentUser(input: {
      userId: string;
      householdId: string;
    }): Promise<FamilyJoinRequestRow[]> {
      await assertCanManageHousehold(input.userId, input.householdId);
      return repository.listJoinRequests(input.householdId);
    },

    async approveJoinRequestForCurrentUser(input: {
      userId: string;
      requestId: string;
    }): Promise<void> {
      const pending = await repository.getPendingJoinRequest(input.requestId);

      if (!pending) {
        throw new FamilyJoinRequestNotFoundError();
      }

      const grants = pending.invitationId
        ? await repository.listInvitationGrants(pending.invitationId)
        : [{ householdId: pending.householdId, role: "member" as const }];

      for (const grant of grants) {
        await assertCanManageHousehold(input.userId, grant.householdId);
      }

      await repository.approveJoinRequest(input.requestId, input.userId);
      for (const grant of grants) {
        await repository.insertMemberIfMissing({
          householdId: grant.householdId,
          userId: pending.userId,
          role: grant.role,
        });
      }
    },

    async rejectJoinRequestForCurrentUser(input: {
      userId: string;
      requestId: string;
    }): Promise<void> {
      const pending = await repository.getPendingJoinRequest(input.requestId);

      if (!pending) {
        throw new FamilyJoinRequestNotFoundError();
      }

      await assertCanManageHousehold(input.userId, pending.householdId);
      await repository.rejectJoinRequest(input.requestId, input.userId);
    },

    async listMembersForCurrentUser(input: {
      userId: string;
      householdId: string;
    }): Promise<FamilyMemberRow[]> {
      await assertMember(input.userId, input.householdId);
      return repository.listMembers(input.householdId);
    },

    async removeMemberForCurrentUser(input: {
      userId: string;
      householdId: string;
      targetUserId: string;
    }): Promise<void> {
      await assertCanManageHousehold(input.userId, input.householdId);

      if (input.targetUserId === input.userId) {
        throw new AuthorizationError("不能移除自己");
      }

      await repository.removeMember({
        householdId: input.householdId,
        userId: input.targetUserId,
      });
    },

    async setMemberRoleForCurrentUser(input: {
      userId: string;
      householdId: string;
      targetUserId: string;
      role: Exclude<HouseholdRole, "owner">;
    }): Promise<void> {
      await assertCanManageHousehold(input.userId, input.householdId);

      if (input.targetUserId === input.userId) {
        throw new AuthorizationError("不能修改自己的角色");
      }

      if (!isAssignableMemberRole(input.role)) {
        throw new AuthorizationError("不支持的角色");
      }

      await repository.updateMemberRole({
        householdId: input.householdId,
        userId: input.targetUserId,
        role: input.role,
      });
    },

    async renameHouseholdForCurrentUser(input: {
      userId: string;
      householdId: string;
      name: string;
    }) {
      const normalizedName = input.name.trim();

      if (!normalizedName || normalizedName.length > 50) {
        throw new Error("家庭名称需为 1-50 个字符");
      }

      await assertOwner(input.userId, input.householdId);
      return repository.renameHousehold(input.householdId, normalizedName);
    },

    async setHouseholdDisplayNameForCurrentUser(input: {
      userId: string;
      householdId: string;
      displayName: string;
    }): Promise<void> {
      await assertMember(input.userId, input.householdId);

      const normalizedDisplayName = input.displayName.trim();

      if (normalizedDisplayName.length > 50) {
        throw new Error("瀹跺涵鏄剧ず鍚嶇О涓嶈兘瓒呰繃 50 涓瓧绗?");
      }

      await repository.setHouseholdDisplayName({
        userId: input.userId,
        householdId: input.householdId,
        displayName: normalizedDisplayName || null,
      });
    },
  };

  return service;
}

function normalizeInvitationGrants(input: {
  householdId?: string;
  grants?: InvitationGrant[];
}): InvitationGrant[] {
  const grants =
    input.grants ??
    (input.householdId
      ? [{ householdId: input.householdId, role: "member" as const }]
      : []);

  if (grants.length === 0) {
    throw new Error("缺少邀请授权");
  }

  for (const grant of grants) {
    if (!isAssignableMemberRole(grant.role)) {
      throw new AuthorizationError("不支持的授权角色");
    }
  }

  return grants;
}

function isAssignableMemberRole(
  role: HouseholdRole,
): role is Exclude<HouseholdRole, "owner"> {
  return role === "member" || role === "contributor" || role === "readonly";
}

export type FamilyService = ReturnType<typeof createFamilyService>;
