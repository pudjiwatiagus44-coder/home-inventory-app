import type {
  FamilyJoinRequestRow,
  FamilyMemberRow,
  FamilySettingsClient,
  HouseholdOption,
  InvitationLinkRow,
} from "./family-data";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; message: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type ClientOptions = {
  fetch?: FetchLike;
};

export function createFamilyHttpClient({
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: ClientOptions = {}): FamilySettingsClient & {
  listHouseholds: () => Promise<HouseholdOption[]>;
  getJoinInfo: (
    token: string,
  ) => Promise<{ householdId: string; householdName: string } | null>;
  submitJoinApplication: (token: string) => Promise<string>;
  createHousehold: (name: string) => Promise<{ id: string; name: string }>;
  setHouseholdDisplayName: (
    householdId: string,
    displayName: string,
  ) => Promise<null>;
} {
  return {
    listHouseholds() {
      return request<HouseholdOption[]>("/api/family/households", {
        method: "GET",
      });
    },

    createInvitationLink(householdId: string) {
      return request("/api/family/invitations", jsonInit("POST", { householdId }));
    },

    listInvitations(householdId: string) {
      return request<InvitationLinkRow[]>(
        `/api/family/invitations?householdId=${encodeURIComponent(householdId)}`,
        { method: "GET" },
      );
    },

    revokeInvitationLink(linkId: string) {
      return request(
        `/api/family/invitations/${encodeURIComponent(linkId)}`,
        jsonInit("DELETE"),
      );
    },

    listJoinRequests(householdId: string) {
      return request<FamilyJoinRequestRow[]>(
        `/api/family/join-requests?householdId=${encodeURIComponent(householdId)}`,
        { method: "GET" },
      );
    },

    approveJoinRequest(requestId: string) {
      return request(
        `/api/family/join-requests/${encodeURIComponent(requestId)}/approve`,
        jsonInit("POST"),
      );
    },

    rejectJoinRequest(requestId: string) {
      return request(
        `/api/family/join-requests/${encodeURIComponent(requestId)}/reject`,
        jsonInit("POST"),
      );
    },

    listMembers(householdId: string) {
      return request<FamilyMemberRow[]>(
        `/api/family/members?householdId=${encodeURIComponent(householdId)}`,
        { method: "GET" },
      );
    },

    removeMember(householdId: string, userId: string) {
      return request(
        `/api/family/members/${encodeURIComponent(userId)}`,
        jsonInit("DELETE", { householdId }),
      );
    },

    createHousehold(name: string) {
      return request<{ id: string; name: string }>(
        "/api/family/households",
        jsonInit("POST", { name }),
      );
    },

    renameHousehold(householdId: string, name: string) {
      return request<{ id: string; name: string }>(
        "/api/family/households",
        jsonInit("PATCH", { householdId, name }),
      );
    },

    setHouseholdDisplayName(householdId: string, displayName: string) {
      return request<null>(
        "/api/family/households/display-name",
        jsonInit("PATCH", { householdId, displayName }),
      );
    },

    getJoinInfo(token: string) {
      return request<{ householdId: string; householdName: string } | null>(
        `/api/join/${encodeURIComponent(token)}`,
        { method: "GET" },
      );
    },

    submitJoinApplication(token: string) {
      return request<{ requestId: string }>(
        `/api/join/${encodeURIComponent(token)}/apply`,
        jsonInit("POST"),
      ).then((data) => data.requestId);
    },
  };

  async function request<T>(input: string, init: RequestInit): Promise<T> {
    const response = await fetchImpl(input, init);
    const payload = (await response.json()) as ApiResponse<T>;

    if (!payload.ok) {
      throw new Error(payload.message);
    }

    return payload.data;
  }
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}
