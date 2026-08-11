import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import type {
  AssignableHouseholdRole,
  FamilyJoinRequestRow,
  FamilyMemberRow,
  HouseholdRole,
  HouseholdOption,
  InvitationGrant,
  InvitationLinkRow,
} from "./family-data";

export type FamilyRepository = {
  listHouseholdsForUser: (userId: string) => Promise<HouseholdOption[]>;
  createHousehold: (input: {
    ownerUserId: string;
    name: string;
  }) => Promise<{ id: string; name: string }>;
  getHouseholdOwner: (householdId: string) => Promise<string | null>;
  isHouseholdMember: (userId: string, householdId: string) => Promise<boolean>;
  getHouseholdMemberRole: (
    userId: string,
    householdId: string,
  ) => Promise<HouseholdRole | null>;
  setHouseholdDisplayName: (input: {
    userId: string;
    householdId: string;
    displayName: string | null;
  }) => Promise<void>;
  createInvitationLink: (input: {
    householdId: string | null;
    token: string;
    expiresAt: string;
    createdBy: string;
  }) => Promise<InvitationLinkRow>;
  insertInvitationGrants: (input: {
    invitationId: string;
    grants: InvitationGrant[];
  }) => Promise<void>;
  listInvitationGrants: (invitationId: string) => Promise<InvitationGrant[]>;
  revokeActiveInvitationLinks: (householdId: string) => Promise<void>;
  getInvitationLinkById: (linkId: string) => Promise<InvitationLinkRow | null>;
  deleteInvitationLink: (linkId: string) => Promise<void>;
  listInvitationLinks: (householdId: string) => Promise<InvitationLinkRow[]>;
  getHouseholdForInvitation: (
    token: string,
  ) => Promise<{
    householdId: string;
    householdName: string;
    invitationId: string;
    grants: InvitationGrant[];
  } | null>;
  submitJoinRequest: (input: {
    householdId: string;
    invitationId: string | null;
    userId: string;
  }) => Promise<string>;
  getPendingJoinRequest: (
    requestId: string,
  ) => Promise<{
    householdId: string;
    userId: string;
    invitationId: string | null;
  } | null>;
  approveJoinRequest: (
    requestId: string,
    decidedBy: string,
  ) => Promise<void>;
  rejectJoinRequest: (
    requestId: string,
    decidedBy: string,
  ) => Promise<void>;
  insertMemberIfMissing: (input: {
    householdId: string;
    userId: string;
    role: HouseholdRole;
  }) => Promise<void>;
  listJoinRequests: (householdId: string) => Promise<FamilyJoinRequestRow[]>;
  listMembers: (householdId: string) => Promise<FamilyMemberRow[]>;
  removeMember: (input: {
    householdId: string;
    userId: string;
  }) => Promise<void>;
  updateMemberRole: (input: {
    householdId: string;
    userId: string;
    role: Exclude<HouseholdRole, "owner">;
  }) => Promise<void>;
  renameHousehold: (
    householdId: string,
    name: string,
  ) => Promise<{ id: string; name: string }>;
  getHouseholdName: (householdId: string) => Promise<string | null>;
};

type InvitationRow = {
  id: string;
  household_id: string;
  token: string;
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

type JoinRequestRow = {
  id: string;
  household_id: string;
  user_id: string;
  email: string;
  status: FamilyJoinRequestRow["status"];
  created_at: Date | string;
};

type MemberRow = {
  user_id: string;
  email: string;
  role: HouseholdRole;
  created_at: Date | string;
};

type HouseholdMembershipRow = {
  household_id: string;
  name: string;
  display_name: string | null;
  role: HouseholdRole;
};

export function createPostgresFamilyRepository(
  client: PostgresQueryClient,
): FamilyRepository {
  return {
    async listHouseholdsForUser(userId) {
      const result = await client.query<HouseholdMembershipRow>(
        `
          select hm.household_id, h.name, hup.display_name, hm.role
          from household_members hm
          join households h on h.id = hm.household_id
          left join household_user_preferences hup
            on hup.household_id = hm.household_id
            and hup.user_id = hm.user_id
          where hm.user_id = $1
          order by
            case when hm.role = 'owner' then 0 else 1 end,
            hm.created_at asc
        `,
        [userId],
      );

      return result.rows.map((row) => ({
        id: row.household_id,
        name: row.name,
        displayName: row.display_name,
        effectiveName: row.display_name ?? row.name,
        role: row.role,
      }));
    },

    async createHousehold(input) {
      const result = await client.query<{ id: string; name: string }>(
        `
          insert into households (owner_user_id, name)
          values ($1, $2)
          returning id, name
        `,
        [input.ownerUserId, input.name],
      );
      const row = result.rows[0];

      if (!row) {
        throw new Error("创建家庭后没有返回数据");
      }

      await client.query(
        `
          insert into household_members (household_id, user_id, role)
          values ($1, $2, 'owner')
          on conflict (household_id, user_id) do nothing
        `,
        [row.id, input.ownerUserId],
      );

      return row;
    },

    async getHouseholdOwner(householdId) {
      const result = await client.query<{ owner_user_id: string }>(
        `
          select owner_user_id
          from households
          where id = $1
        `,
        [householdId],
      );

      return result.rows[0]?.owner_user_id ?? null;
    },

    async isHouseholdMember(userId, householdId) {
      const result = await client.query<{ household_id: string }>(
        `
          select household_id
          from household_members
          where household_id = $1 and user_id = $2
          limit 1
        `,
        [householdId, userId],
      );

      return result.rows.length > 0;
    },

    async getHouseholdMemberRole(userId, householdId) {
      const result = await client.query<{ role: HouseholdRole }>(
        `
          select role
          from household_members
          where household_id = $1 and user_id = $2
          limit 1
        `,
        [householdId, userId],
      );

      return result.rows[0]?.role ?? null;
    },

    async setHouseholdDisplayName(input) {
      await client.query(
        `
          insert into household_user_preferences (
            user_id,
            household_id,
            display_name
          )
          values ($1, $2, $3)
          on conflict (user_id, household_id) do update
          set display_name = excluded.display_name,
              updated_at = now()
        `,
        [input.userId, input.householdId, input.displayName],
      );
    },

    async createInvitationLink(input) {
      const result = await client.query<InvitationRow>(
        `
          insert into household_invitations (
            household_id,
            token,
            expires_at,
            created_by
          )
          values ($1, $2, $3, $4)
          returning id, household_id, token, created_at, expires_at, revoked_at
        `,
        [input.householdId, input.token, input.expiresAt, input.createdBy],
      );
      const row = result.rows[0];

      if (!row) {
        throw new Error("生成邀请链接后没有返回数据");
      }

      return normalizeInvitationRow(row);
    },

    async insertInvitationGrants({ invitationId, grants }) {
      for (const grant of grants) {
        await client.query(
          `
            insert into household_invitation_grants (
              invitation_id,
              household_id,
              role
            )
            values ($1, $2, $3)
            on conflict (invitation_id, household_id) do nothing
          `,
          [invitationId, grant.householdId, grant.role],
        );
      }
    },

    async listInvitationGrants(invitationId) {
      const result = await client.query<{
        household_id: string;
        role: AssignableHouseholdRole;
      }>(
        `
          select household_id, role
          from household_invitation_grants
          where invitation_id = $1
          order by created_at asc
        `,
        [invitationId],
      );

      return result.rows.map((row) => ({
        householdId: row.household_id,
        role: row.role,
      }));
    },

    async revokeActiveInvitationLinks(householdId) {
      await client.query(
        `
          delete from household_invitations
          where household_id = $1 and revoked_at is null
        `,
        [householdId],
      );
    },

    async deleteInvitationLink(linkId) {
      await client.query(
        `
          delete from household_invitations
          where id = $1 and revoked_at is null
        `,
        [linkId],
      );
    },

    async getInvitationLinkById(linkId) {
      const result = await client.query<InvitationRow>(
        `
          select id, household_id, token, created_at, expires_at, revoked_at
          from household_invitations
          where id = $1
          limit 1
        `,
        [linkId],
      );

      return result.rows[0]
        ? normalizeInvitationRow(result.rows[0])
        : null;
    },

    async listInvitationLinks(householdId) {
      const result = await client.query<InvitationRow>(
        `
          select id, household_id, token, created_at, expires_at, revoked_at
          from household_invitations
          where household_id = $1
          order by created_at desc
        `,
        [householdId],
      );

      return result.rows.map(normalizeInvitationRow);
    },

    async getHouseholdForInvitation(token) {
      const result = await client.query<{
        invitation_id: string;
        household_id: string;
        household_name: string;
      }>(
        `
          select
            hi.id as invitation_id,
            coalesce(hi.household_id, first_grant.household_id) as household_id,
            h.name as household_name
          from household_invitations hi
          left join lateral (
            select household_id
            from household_invitation_grants
            where invitation_id = hi.id
            order by created_at asc
            limit 1
          ) first_grant on true
          join households h
            on h.id = coalesce(hi.household_id, first_grant.household_id)
          where hi.token = $1
            and hi.revoked_at is null
            and hi.expires_at > now()
          limit 1
        `,
        [token],
      );
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      const grantsResult = await client.query<{
        household_id: string;
        role: AssignableHouseholdRole;
      }>(
        `
          select household_id, role
          from household_invitation_grants
          where invitation_id = $1
          order by created_at asc
        `,
        [row.invitation_id],
      );

      return {
        householdId: row.household_id,
        householdName: row.household_name,
        invitationId: row.invitation_id,
        grants: grantsResult.rows.map((grant) => ({
          householdId: grant.household_id,
          role: grant.role,
        })),
      };
    },

    async submitJoinRequest(input) {
      const insertResult = await client.query<{ id: string }>(
        `
          insert into household_join_requests (
            household_id,
            invitation_id,
            user_id,
            status
          )
          values ($1, $2, $3, 'pending')
          on conflict (household_id, user_id) where status = 'pending' do nothing
          returning id
        `,
        [input.householdId, input.invitationId, input.userId],
      );

      if (insertResult.rows[0]) {
        return insertResult.rows[0].id;
      }

      const existingResult = await client.query<{ id: string }>(
        `
          select id
          from household_join_requests
          where household_id = $1 and user_id = $2 and status = 'pending'
          limit 1
        `,
        [input.householdId, input.userId],
      );
      const existing = existingResult.rows[0];

      if (!existing) {
        throw new Error("提交加入申请后没有返回数据");
      }

      await client.query(
        `
          update household_join_requests
          set invitation_id = $2
          where id = $1
        `,
        [existing.id, input.invitationId],
      );

      return existing.id;
    },

    async getPendingJoinRequest(requestId) {
      const result = await client.query<{
        household_id: string;
        user_id: string;
        invitation_id: string | null;
      }>(
        `
          select household_id, user_id, invitation_id
          from household_join_requests
          where id = $1 and status = 'pending'
          limit 1
        `,
        [requestId],
      );
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        householdId: row.household_id,
        userId: row.user_id,
        invitationId: row.invitation_id,
      };
    },

    async approveJoinRequest(requestId, decidedBy) {
      await client.query(
        `
          update household_join_requests
          set status = 'approved', decided_at = now(), decided_by = $2
          where id = $1 and status = 'pending'
        `,
        [requestId, decidedBy],
      );
    },

    async rejectJoinRequest(requestId, decidedBy) {
      await client.query(
        `
          update household_join_requests
          set status = 'rejected', decided_at = now(), decided_by = $2
          where id = $1 and status = 'pending'
        `,
        [requestId, decidedBy],
      );
    },

    async insertMemberIfMissing(input) {
      await client.query(
        `
          insert into household_members (household_id, user_id, role)
          values ($1, $2, $3)
          on conflict (household_id, user_id) do nothing
        `,
        [input.householdId, input.userId, input.role],
      );
    },

    async listJoinRequests(householdId) {
      const result = await client.query<JoinRequestRow>(
        `
          select jr.id, jr.household_id, jr.user_id, u.email, jr.status, jr.created_at
          from household_join_requests jr
          join users u on u.id = jr.user_id
          where jr.household_id = $1
          order by jr.created_at desc
        `,
        [householdId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        email: row.email,
        status: row.status,
        created_at: String(row.created_at),
      }));
    },

    async listMembers(householdId) {
      const result = await client.query<MemberRow>(
        `
          select hm.user_id, u.email, hm.role, hm.created_at
          from household_members hm
          join users u on u.id = hm.user_id
          where hm.household_id = $1
          order by
            case when hm.role = 'owner' then 0 else 1 end,
            hm.created_at asc
        `,
        [householdId],
      );

      return result.rows.map((row) => ({
        user_id: row.user_id,
        email: row.email,
        role: row.role,
        created_at: String(row.created_at),
      }));
    },

    async removeMember(input) {
      await client.query(
        `
          delete from household_members
          where household_id = $1 and user_id = $2
        `,
        [input.householdId, input.userId],
      );
    },

    async updateMemberRole(input) {
      await client.query(
        `
          update household_members
          set role = $3
          where household_id = $1 and user_id = $2
        `,
        [input.householdId, input.userId, input.role],
      );
    },

    async renameHousehold(householdId, name) {
      const result = await client.query<{ id: string; name: string }>(
        `
          update households
          set name = $2
          where id = $1
          returning id, name
        `,
        [householdId, name],
      );

      return result.rows[0];
    },

    async getHouseholdName(householdId) {
      const result = await client.query<{ name: string }>(
        `
          select name
          from households
          where id = $1
        `,
        [householdId],
      );

      return result.rows[0]?.name ?? null;
    },
  };
}

function normalizeInvitationRow(row: InvitationRow): InvitationLinkRow {
  return {
    id: row.id,
    household_id: row.household_id,
    token: row.token,
    created_at: String(row.created_at),
    expires_at: String(row.expires_at),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
  };
}
