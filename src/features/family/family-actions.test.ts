import { describe, expect, it } from "vitest";
import {
  approveHouseholdJoinRequest,
  createHouseholdInvitationLink,
  getHouseholdForInvitation,
  listHouseholdInvitations,
  listHouseholdJoinRequests,
  listHouseholdMembers,
  listHouseholdsForUser,
  rejectHouseholdJoinRequest,
  removeHouseholdMember,
  revokeHouseholdInvitationLink,
  submitHouseholdJoinRequest,
  type FamilyActionClient,
} from "./family-actions";

function createFakeClient(
  behavior: {
    deletes?: Record<string, unknown[]>;
    inserts?: Record<string, unknown[]>;
    selects?: Record<string, unknown[]>;
    rpcResults?: Record<string, unknown>;
    errors?: Record<string, { message: string }>;
  } = {},
): { client: FamilyActionClient; calls: string[] } {
  const calls: string[] = [];

  const client = {
    from(table: string) {
      calls.push(`from:${table}`);

      return {
        delete() {
          calls.push(`delete:${table}`);
          return {
            eq(column: string, value: unknown) {
              calls.push(`delete:${table}:eq:${column}:${value}`);
              return {
                eq(column2: string, value2: unknown) {
                  calls.push(`delete:${table}:eq:${column2}:${value2}`);
                  return Promise.resolve({
                    error: behavior.errors?.[`delete:${table}`] ?? null,
                  });
                },
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          calls.push(`insert:${table}:${JSON.stringify(payload)}`);
          return {
            select() {
              return {
                single() {
                  const rows = behavior.inserts?.[table] ?? [];
                  return Promise.resolve({
                    data: rows[0] ?? null,
                    error: behavior.errors?.[`insert:${table}`] ?? null,
                  });
                },
              };
            },
          };
        },
        select() {
          calls.push(`select:${table}`);
          return {
            eq(column: string, value: unknown) {
              calls.push(`select:${table}:eq:${column}:${value}`);
              return {
                order() {
                  return Promise.resolve({
                    data: behavior.selects?.[table] ?? [],
                    error: behavior.errors?.[`select:${table}`] ?? null,
                  });
                },
              };
            },
          };
        },
      };
    },
    rpc(fn: string, params: Record<string, unknown>) {
      calls.push(`rpc:${fn}:${JSON.stringify(params)}`);
      return Promise.resolve({
        data: behavior.rpcResults?.[fn] ?? null,
        error: behavior.errors?.[`rpc:${fn}`] ?? null,
      });
    },
  };

  return { client: client as unknown as FamilyActionClient, calls };
}

describe("createHouseholdInvitationLink", () => {
  it("revokes existing active links then inserts a new one and returns its URL", async () => {
    const { client, calls } = createFakeClient({
      inserts: {
        household_invitations: [
          {
            id: "link-1",
            token: "abc_123",
            expires_at: "2026-09-05T00:00:00.000Z",
          },
        ],
      },
    });

    const result = await createHouseholdInvitationLink(client, {
      householdId: "household-1",
      origin: "https://homestorag.xyz",
      now: new Date("2026-08-06T00:00:00.000Z"),
      token: "abc_123",
    });

    expect(result.url).toBe("https://homestorag.xyz/join/abc_123");
    expect(result.id).toBe("link-1");
    expect(calls).toContain("delete:household_invitations");
    expect(
      calls.some((call) => call.startsWith("insert:household_invitations:")),
    ).toBe(true);
  });

  it("throws when the insert fails", async () => {
    const { client } = createFakeClient({
      errors: {
        "insert:household_invitations": { message: "RLS denied" },
      },
    });

    await expect(
      createHouseholdInvitationLink(client, {
        householdId: "household-1",
        origin: "https://homestorag.xyz",
      }),
    ).rejects.toThrow("RLS denied");
  });
});

describe("revokeHouseholdInvitationLink", () => {
  it("deletes the invitation link by id", async () => {
    const { client, calls } = createFakeClient();

    await revokeHouseholdInvitationLink(client, { linkId: "link-1" });

    expect(calls).toContain("delete:household_invitations:eq:id:link-1");
  });

  it("throws when the delete fails", async () => {
    const { client } = createFakeClient({
      errors: {
        "delete:household_invitations": { message: "not owner" },
      },
    });

    await expect(
      revokeHouseholdInvitationLink(client, { linkId: "link-1" }),
    ).rejects.toThrow("not owner");
  });
});

describe("listHouseholdInvitations", () => {
  it("lists invitation links for the household", async () => {
    const { client } = createFakeClient({
      selects: {
        household_invitations: [
          {
            id: "link-1",
            token: "abc",
            expires_at: "2026-09-05T00:00:00.000Z",
            revoked_at: null,
          },
        ],
      },
    });

    const links = await listHouseholdInvitations(client, {
      householdId: "household-1",
    });

    expect(links).toHaveLength(1);
    expect(links[0].token).toBe("abc");
  });
});

describe("family rpc actions", () => {
  it("approves a join request through rpc", async () => {
    const { client, calls } = createFakeClient();

    await approveHouseholdJoinRequest(client, { requestId: "request-1" });

    expect(calls).toContain('rpc:approve_household_join_request:{"request_id":"request-1"}');
  });

  it("rejects a join request through rpc", async () => {
    const { client, calls } = createFakeClient();

    await rejectHouseholdJoinRequest(client, { requestId: "request-1" });

    expect(calls).toContain('rpc:reject_household_join_request:{"request_id":"request-1"}');
  });

  it("lists join requests with applicant emails through rpc", async () => {
    const { client } = createFakeClient({
      rpcResults: {
        list_household_join_requests: [
          {
            id: "request-1",
            user_id: "user-2",
            email: "b@example.com",
            status: "pending",
            created_at: "2026-08-06T00:00:00.000Z",
          },
        ],
      },
    });

    const requests = await listHouseholdJoinRequests(client, {
      householdId: "household-1",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].email).toBe("b@example.com");
  });

  it("lists members with emails through rpc", async () => {
    const { client } = createFakeClient({
      rpcResults: {
        list_household_members: [
          {
            user_id: "user-1",
            email: "a@example.com",
            role: "owner",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    });

    const members = await listHouseholdMembers(client, {
      householdId: "household-1",
    });

    expect(members[0].email).toBe("a@example.com");
    expect(members[0].role).toBe("owner");
  });

  it("gets household info for a valid invitation token", async () => {
    const { client } = createFakeClient({
      rpcResults: {
        get_household_for_invitation: [
          {
            household_id: "household-1",
            household_name: "我的家",
          },
        ],
      },
    });

    const result = await getHouseholdForInvitation(client, "abc_123");

    expect(result).toEqual({
      householdId: "household-1",
      householdName: "我的家",
    });
  });

  it("submits a join request through rpc", async () => {
    const { client, calls } = createFakeClient({
      rpcResults: {
        submit_household_join_request: "request-1",
      },
    });

    const requestId = await submitHouseholdJoinRequest(client, "abc_123");

    expect(requestId).toBe("request-1");
    expect(calls).toContain('rpc:submit_household_join_request:{"target_token":"abc_123"}');
  });
});

describe("removeHouseholdMember", () => {
  it("deletes the member relationship scoped to household and user", async () => {
    const { client, calls } = createFakeClient();

    await removeHouseholdMember(client, {
      householdId: "household-1",
      userId: "user-2",
    });

    expect(calls).toContain("delete:household_members:eq:household_id:household-1");
    expect(calls).toContain("delete:household_members:eq:user_id:user-2");
  });
});

describe("listHouseholdsForUser", () => {
  it("returns households the user belongs to with role", async () => {
    const { client } = createFakeClient({
      selects: {
        household_members: [
          { household_id: "h1", role: "owner", households: { id: "h1", name: "我的家" } },
          { household_id: "h2", role: "member", households: { id: "h2", name: "爸妈家" } },
        ],
      },
    });

    const households = await listHouseholdsForUser(client, "user-1");

    expect(households).toEqual([
      { id: "h1", name: "我的家", role: "owner" },
      { id: "h2", name: "爸妈家", role: "member" },
    ]);
  });
});
