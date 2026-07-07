import { describe, expect, it } from "vitest";
import {
  assertHouseholdMember,
  assertResourceBelongsToHousehold,
  AuthorizationError,
} from "./authorization";

describe("assertHouseholdMember", () => {
  it("allows the current user when they belong to the household", () => {
    expect(() =>
      assertHouseholdMember({
        userId: "user-a",
        householdId: "household-a",
        memberships: [
          { userId: "user-a", householdId: "household-a", role: "owner" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects cross-household access", () => {
    expect(() =>
      assertHouseholdMember({
        userId: "user-b",
        householdId: "household-a",
        memberships: [
          { userId: "user-b", householdId: "household-b", role: "owner" },
        ],
      }),
    ).toThrow(new AuthorizationError("无权访问该家庭空间"));
  });
});

describe("assertResourceBelongsToHousehold", () => {
  it("allows a resource in the current household", () => {
    expect(() =>
      assertResourceBelongsToHousehold({
        resourceName: "物品",
        resourceHouseholdId: "household-a",
        currentHouseholdId: "household-a",
      }),
    ).not.toThrow();
  });

  it("rejects a resource from another household", () => {
    expect(() =>
      assertResourceBelongsToHousehold({
        resourceName: "物品",
        resourceHouseholdId: "household-a",
        currentHouseholdId: "household-b",
      }),
    ).toThrow(new AuthorizationError("无权访问该物品"));
  });
});
