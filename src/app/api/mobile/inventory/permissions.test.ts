import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createInventoryService } from "../../../../features/inventory/inventory-service";
import type { InventoryRepository } from "../../../../features/inventory/inventory-repository";
import { createMobileSyncHandlers } from "./sync/handlers";

describe("mobile inventory route permissions", () => {
  it("does not mutate when user B syncs an update for user A's item", async () => {
    let updateCalled = false;
    const repository: InventoryRepository = {
      getDashboardForUser: async () => ({
        household: { id: "household-b", name: "User B Home" },
        areas: [],
        locations: [],
        items: [],
      }),
      createArea: async () => {
        throw new Error("should not create an area");
      },
      updateArea: async () => {
        throw new Error("should not update an area");
      },
      deleteArea: async () => {
        throw new Error("should not delete an area");
      },
      createLocation: async () => {
        throw new Error("should not create a location");
      },
      updateLocation: async () => {
        throw new Error("should not update a location");
      },
      deleteLocation: async () => {
        throw new Error("should not delete a location");
      },
      createItem: async () => {
        throw new Error("should not create an item");
      },
      updateItem: async () => {
        updateCalled = true;
        throw new Error("should not update a foreign item");
      },
      deleteItem: async () => {
        throw new Error("should not delete an item");
      },
    };
    const { POST } = createMobileSyncHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-b" }) },
      inventoryService: createInventoryService({ repository }),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/mobile/inventory/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({
          operations: [
            {
              clientOperationId: "op-foreign-item-update",
              entity: "item",
              action: "update",
              serverId: "user-a-item",
              baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
              payload: {
                name: "Foreign item",
                note: "",
                expireDate: null,
                locationId: null,
              },
            },
          ],
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        results: [
          {
            clientOperationId: "op-foreign-item-update",
            status: "conflict",
            entity: "item",
            serverId: "user-a-item",
            message: "Server item is missing",
          },
        ],
      },
    });
    expect(response.status).toBe(200);
    expect(updateCalled).toBe(false);
  });
});
