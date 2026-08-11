import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createMobileSnapshotHandlers } from "./handlers";

describe("GET /api/mobile/inventory/snapshot", () => {
  it("returns the current user's dashboard snapshot", async () => {
    const { GET } = createMobileSnapshotHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      inventoryRepository: {
        getDashboardForUser: async (userId) => ({
          household: { id: "household-1", name: `Home for ${userId}` },
          areas: [],
          locations: [],
          items: [],
        }),
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/mobile/inventory/snapshot", {
        headers: { cookie: "home_inventory_session=session-token" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        household: { id: "household-1", name: "Home for user-1" },
        areas: [],
        locations: [],
        items: [],
      },
    });
    expect(response.status).toBe(200);
  });

  it("forwards the selected householdId to the inventory repository", async () => {
    let receivedHouseholdId: string | undefined;
    const { GET } = createMobileSnapshotHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      inventoryRepository: {
        getDashboardForUser: async (userId, householdId) => {
          receivedHouseholdId = householdId;
          return {
            household: { id: householdId ?? "household-1", name: `Home for ${userId}` },
            areas: [],
            locations: [],
            items: [],
          };
        },
      },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/mobile/inventory/snapshot?householdId=household-2",
        {
          headers: { cookie: "home_inventory_session=session-token" },
        },
      ),
    );

    expect(receivedHouseholdId).toBe("household-2");
    expect(response.status).toBe(200);
  });
});
