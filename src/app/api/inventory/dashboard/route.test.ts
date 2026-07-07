import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createDashboardHandlers } from "./handlers";

describe("inventory dashboard route", () => {
  it("returns the current user's dashboard through self-hosted auth", async () => {
    const handlers = createDashboardHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      inventoryRepository: {
        getDashboardForUser: async (userId) => ({
          household: { id: "household-1", name: `Home for ${userId}` },
          areas: [{ id: "area-1", name: "Kitchen", color: "#256f6b" }],
          locations: [
            { id: "location-1", name: "Shelf", area_id: "area-1" },
          ],
          items: [
            {
              id: "item-1",
              name: "Battery",
              note: "",
              expire_date: null,
              location_id: "location-1",
            },
          ],
        }),
      },
    });

    const response = await handlers.GET(
      new NextRequest("http://localhost/api/inventory/dashboard", {
        headers: { cookie: "home_inventory_session=session-token" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        household: { id: "household-1", name: "Home for user-1" },
        areas: [{ id: "area-1", name: "Kitchen", color: "#256f6b" }],
        locations: [{ id: "location-1", name: "Shelf", area_id: "area-1" }],
        items: [
          {
            id: "item-1",
            name: "Battery",
            note: "",
            expire_date: null,
            location_id: "location-1",
          },
        ],
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns 401 without a self-hosted auth session", async () => {
    const handlers = createDashboardHandlers();

    const response = await handlers.GET(
      new NextRequest("http://localhost/api/inventory/dashboard"),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(response.status).toBe(401);
  });
});
