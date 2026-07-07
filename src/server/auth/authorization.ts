export type HouseholdMembership = {
  userId: string;
  householdId: string;
  role: "owner" | "member";
};

export class AuthorizationError extends Error {
  constructor(message = "无权访问该资源") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertHouseholdMember(input: {
  userId: string;
  householdId: string;
  memberships: HouseholdMembership[];
}): void {
  const isMember = input.memberships.some(
    (membership) =>
      membership.userId === input.userId &&
      membership.householdId === input.householdId,
  );

  if (!isMember) {
    throw new AuthorizationError("无权访问该家庭空间");
  }
}

export function assertResourceBelongsToHousehold(input: {
  resourceName: string;
  resourceHouseholdId: string;
  currentHouseholdId: string;
}): void {
  if (input.resourceHouseholdId !== input.currentHouseholdId) {
    throw new AuthorizationError(`无权访问该${input.resourceName}`);
  }
}
