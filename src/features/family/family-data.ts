export type InvitationLinkRow = {
  id: string;
  household_id: string;
  token: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type FamilyJoinRequestRow = {
  id: string;
  user_id: string;
  email: string;
  status: JoinRequestStatus;
  created_at: string;
};

export type HouseholdRole = "owner" | "member" | "contributor" | "readonly";

export type FamilyMemberRow = {
  user_id: string;
  email: string;
  role: HouseholdRole;
  created_at: string;
};

export type HouseholdOption = {
  id: string;
  name: string;
  displayName?: string | null;
  effectiveName?: string;
  role: HouseholdRole;
};

export type InvitationLinkStatus = "active" | "expired" | "revoked";

export type FamilySettingsClient = {
  listInvitations: (householdId: string) => Promise<InvitationLinkRow[]>;
  createInvitationLink: (householdId: string) => Promise<{
    id: string;
    token: string;
    expiresAt: string;
    url: string;
  }>;
  revokeInvitationLink: (linkId: string) => Promise<void>;
  listJoinRequests: (householdId: string) => Promise<FamilyJoinRequestRow[]>;
  approveJoinRequest: (requestId: string) => Promise<void>;
  rejectJoinRequest: (requestId: string) => Promise<void>;
  listMembers: (householdId: string) => Promise<FamilyMemberRow[]>;
  removeMember: (householdId: string, userId: string) => Promise<void>;
  createHousehold: (name: string) => Promise<{ id: string; name: string }>;
  renameHousehold: (
    householdId: string,
    name: string,
  ) => Promise<{ id: string; name: string }>;
};

const TOKEN_CHARSET = /^[A-Za-z0-9_-]+$/;
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function generateInvitationToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export function createInvitationUrl(origin: string, token: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return `${normalizedOrigin}/join/${encodeURIComponent(token)}`;
}

export function getInvitationExpiresAt(
  now: Date = new Date(),
  days = 30,
): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function getInvitationStatus(
  link: { expires_at: string; revoked_at: string | null },
  now: Date = new Date(),
): InvitationLinkStatus {
  if (link.revoked_at) {
    return "revoked";
  }

  if (new Date(link.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }

  return "active";
}

export function isInvitationLinkActive(
  link: { expires_at: string; revoked_at: string | null },
  now: Date = new Date(),
): boolean {
  return getInvitationStatus(link, now) === "active";
}

export function normalizeInvitationToken(value: string): string {
  const token = value.trim();

  if (!token || !TOKEN_CHARSET.test(token)) {
    throw new Error("邀请链接无效");
  }

  return token;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;

    result += BASE64URL_ALPHABET[first >> 2];
    result += BASE64URL_ALPHABET[((first & 3) << 4) | (second >> 4)];

    if (index + 1 < bytes.length) {
      result += BASE64URL_ALPHABET[((second & 15) << 2) | (third >> 6)];
    }

    if (index + 2 < bytes.length) {
      result += BASE64URL_ALPHABET[third & 63];
    }
  }

  return result;
}
