import {
  createInvitationUrl,
  generateInvitationToken,
  getInvitationExpiresAt,
  type FamilyJoinRequestRow,
  type FamilyMemberRow,
  type HouseholdOption,
  type InvitationLinkRow,
} from "./family-data";

type SingleResult<TData> = {
  data: TData | null;
  error: { message: string } | null;
};

type ListResult<TData> = {
  data: TData[];
  error: { message: string } | null;
};

type DeleteResult = {
  error: { message: string } | null;
};

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export type FamilyActionClient = {
  from: {
    (table: "household_invitations" | "household_members"): {
      delete: () => {
        eq: (
          column: string,
          value: string | null,
        ) => {
          eq: (
            column: string,
            value: string | null,
          ) => Promise<DeleteResult>;
        };
      };
      insert: (payload: Record<string, unknown>) => {
        select: () => {
          single: () => Promise<
            SingleResult<{
              id: string;
              token: string;
              expires_at: string;
            }>
          >;
        };
      };
      select: () => {
        eq: (
          column: string,
          value: string,
        ) => {
          order: () => Promise<ListResult<Record<string, unknown>>>;
        };
      };
    };
  };
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<RpcResult>;
};

export async function createHouseholdInvitationLink(
  supabase: FamilyActionClient,
  input: {
    householdId: string;
    origin: string;
    now?: Date;
    token?: string;
    expiresAt?: string;
  },
): Promise<{ id: string; token: string; expiresAt: string; url: string }> {
  const now = input.now ?? new Date();
  const token = input.token ?? generateInvitationToken();
  const expiresAt =
    input.expiresAt ?? getInvitationExpiresAt(now);

  const revokeResult = await supabase
    .from("household_invitations")
    .delete()
    .eq("household_id", input.householdId)
    .eq("revoked_at", null);

  if (revokeResult.error) {
    throw new Error(revokeResult.error.message);
  }

  const { data, error } = await supabase
    .from("household_invitations")
    .insert({
      household_id: input.householdId,
      token,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("生成邀请链接后没有返回数据");
  }

  return {
    id: data.id,
    token: data.token,
    expiresAt: data.expires_at,
    url: createInvitationUrl(input.origin, data.token),
  };
}

export async function revokeHouseholdInvitationLink(
  supabase: FamilyActionClient,
  input: { linkId: string },
): Promise<void> {
  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", input.linkId)
    .eq("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listHouseholdInvitations(
  supabase: FamilyActionClient,
  input: { householdId: string },
): Promise<InvitationLinkRow[]> {
  const { data, error } = await supabase
    .from("household_invitations")
    .select()
    .eq("household_id", input.householdId)
    .order();

  if (error) {
    throw new Error(error.message);
  }

  return data.map((row) => ({
    id: String(row.id),
    household_id: String(row.household_id),
    token: String(row.token),
    created_at: String(row.created_at),
    expires_at: String(row.expires_at),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
  }));
}

export async function listHouseholdMembers(
  supabase: FamilyActionClient,
  input: { householdId: string },
): Promise<FamilyMemberRow[]> {
  const { data, error } = await supabase.rpc("list_household_members", {
    target_household_id: input.householdId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as FamilyMemberRow[]).map((member) => ({
    user_id: String(member.user_id),
    email: String(member.email),
    role: member.role === "member" ? "member" : "owner",
    created_at: String(member.created_at),
  }));
}

export async function listHouseholdJoinRequests(
  supabase: FamilyActionClient,
  input: { householdId: string },
): Promise<FamilyJoinRequestRow[]> {
  const { data, error } = await supabase.rpc("list_household_join_requests", {
    target_household_id: input.householdId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as FamilyJoinRequestRow[]).map((request) => ({
    id: String(request.id),
    user_id: String(request.user_id),
    email: String(request.email),
    status: request.status,
    created_at: String(request.created_at),
  }));
}

export async function approveHouseholdJoinRequest(
  supabase: FamilyActionClient,
  input: { requestId: string },
): Promise<void> {
  const { error } = await supabase.rpc("approve_household_join_request", {
    request_id: input.requestId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function rejectHouseholdJoinRequest(
  supabase: FamilyActionClient,
  input: { requestId: string },
): Promise<void> {
  const { error } = await supabase.rpc("reject_household_join_request", {
    request_id: input.requestId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeHouseholdMember(
  supabase: FamilyActionClient,
  input: { householdId: string; userId: string },
): Promise<void> {
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", input.householdId)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getHouseholdForInvitation(
  supabase: FamilyActionClient,
  token: string,
): Promise<{ householdId: string; householdName: string } | null> {
  const { data, error } = await supabase.rpc("get_household_for_invitation", {
    target_token: token,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    household_id: string;
    household_name: string;
  }>;
  const first = rows[0];

  if (!first) {
    return null;
  }

  return {
    householdId: String(first.household_id),
    householdName: String(first.household_name),
  };
}

export async function submitHouseholdJoinRequest(
  supabase: FamilyActionClient,
  token: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_household_join_request", {
    target_token: token,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("提交加入申请后没有返回数据");
  }

  return String(data);
}

export async function listHouseholdsForUser(
  supabase: FamilyActionClient,
  userId: string,
): Promise<HouseholdOption[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select()
    .eq("user_id", userId)
    .order();

  if (error) {
    throw new Error(error.message);
  }

  return data.map((row) => {
    const household = row.households as
      | { id: string; name: string }
      | undefined;

    return {
      id: String(row.household_id),
      name: household?.name ?? "家庭",
      role: row.role === "member" ? "member" : "owner",
    };
  });
}
