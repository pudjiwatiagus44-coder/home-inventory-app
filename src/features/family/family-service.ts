import { AuthorizationError } from "../../server/auth/authorization";
import type { FamilyRepository } from "./family-repository";
import {
  generateInvitationToken,
  getInvitationExpiresAt,
  type FamilyJoinRequestRow,
  type FamilyMemberRow,
  type HouseholdOption,
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
      householdId: string;
      token?: string;
      now?: Date;
    }): Promise<InvitationLinkRow> {
      await assertOwner(input.userId, input.householdId);

      const now = input.now ?? new Date();
      const token = input.token ?? generateInvitationToken();
      const expiresAt = getInvitationExpiresAt(now);

      await repository.revokeActiveInvitationLinks(input.householdId);

      return repository.createInvitationLink({
        householdId: input.householdId,
        token,
        expiresAt,
        createdBy: input.userId,
      });
    },

    async revokeInvitationLinkForCurrentUser(input: {
      userId: string;
      linkId: string;
    }): Promise<void> {
      const link = await repository.getInvitationLinkById(input.linkId);

      if (!link) {
        return;
      }

      await assertOwner(input.userId, link.household_id);
      await repository.deleteInvitationLink(input.linkId);
    },

    async listInvitationLinksForCurrentUser(input: {
      userId: string;
      householdId: string;
    }): Promise<InvitationLinkRow[]> {
      await assertOwner(input.userId, input.householdId);
      return repository.listInvitationLinks(input.householdId);
    },

    async getHouseholdForInvitationForCurrentUser(input: {
      userId: string;
      token: string;
    }): Promise<{ householdId: string; householdName: string } | null> {
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
        userId: input.userId,
      });
    },

    async listJoinRequestsForCurrentUser(input: {
      userId: string;
      householdId: string;
    }): Promise<FamilyJoinRequestRow[]> {
      await assertOwner(input.userId, input.householdId);
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

      await assertOwner(input.userId, pending.householdId);
      await repository.approveJoinRequest(input.requestId, input.userId);
      await repository.insertMemberIfMissing({
        householdId: pending.householdId,
        userId: pending.userId,
        role: "member",
      });
    },

    async rejectJoinRequestForCurrentUser(input: {
      userId: string;
      requestId: string;
    }): Promise<void> {
      const pending = await repository.getPendingJoinRequest(input.requestId);

      if (!pending) {
        throw new FamilyJoinRequestNotFoundError();
      }

      await assertOwner(input.userId, pending.householdId);
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
      await assertOwner(input.userId, input.householdId);

      if (input.targetUserId === input.userId) {
        throw new AuthorizationError("房主不能移除自己");
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
      role: "member" | "readonly";
    }): Promise<void> {
      await assertOwner(input.userId, input.householdId);

      if (input.targetUserId === input.userId) {
        throw new AuthorizationError("房主不能修改自己的角色");
      }

      if (input.role !== "member" && input.role !== "readonly") {
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
  };

  return service;
}

export type FamilyService = ReturnType<typeof createFamilyService>;
