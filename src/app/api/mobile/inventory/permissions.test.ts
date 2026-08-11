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
      authService: {
        getCurrentUser: async () => ({
          userId: "user-b",
          email: "user-b@example.com",
        }),
      },
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

  it("rejects contributor queued deletes and updates to another creator's records", async () => {
    const repository = createContributorMobileRepository();
    const { POST } = createMobileSyncHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "member-1",
          email: "member-1@example.com",
        }),
      },
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
              clientOperationId: "op-contributor-other-item-update",
              entity: "item",
              action: "update",
              serverId: "other-item",
              baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
              payload: {
                name: "Changed",
                note: "",
                expireDate: null,
                locationId: null,
              },
            },
            {
              clientOperationId: "op-contributor-own-item-delete",
              entity: "item",
              action: "delete",
              serverId: "own-item",
              baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
            },
            {
              clientOperationId: "op-contributor-other-location-update",
              entity: "location",
              action: "update",
              serverId: "other-location",
              baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
              payload: {
                name: "Changed",
                areaId: null,
              },
            },
            {
              clientOperationId: "op-contributor-own-location-delete",
              entity: "location",
              action: "delete",
              serverId: "own-location",
              baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
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
            clientOperationId: "op-contributor-other-item-update",
            status: "failed",
            entity: "item",
            serverId: "other-item",
            message: expect.stringContaining("只能编辑自己创建"),
          },
          {
            clientOperationId: "op-contributor-own-item-delete",
            status: "failed",
            entity: "item",
            serverId: "own-item",
            message: expect.stringContaining("不能删除"),
          },
          {
            clientOperationId: "op-contributor-other-location-update",
            status: "failed",
            entity: "location",
            serverId: "other-location",
            message: expect.stringContaining("只能编辑自己创建"),
          },
          {
            clientOperationId: "op-contributor-own-location-delete",
            status: "failed",
            entity: "location",
            serverId: "own-location",
            message: expect.stringContaining("不能删除"),
          },
        ],
      },
    });
    expect(response.status).toBe(200);
    expect(repository.writeCalls).toEqual([]);
  });
});

function createContributorMobileRepository(): InventoryRepository & {
  writeCalls: string[];
} {
  const writeCalls: string[] = [];
  return {
    writeCalls,
    getDashboardForUser: async () =>
      ({
        household: { id: "household-1", name: "Home", role: "contributor" },
        areas: [],
        locations: [
          {
            id: "own-location",
            name: "Own shelf",
            area_id: null,
            createdBy: "member-1",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
          {
            id: "other-location",
            name: "Other shelf",
            area_id: null,
            createdBy: "owner-1",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
        items: [
          {
            id: "own-item",
            name: "Own item",
            note: "",
            expire_date: null,
            location_id: null,
            createdBy: "member-1",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
          {
            id: "other-item",
            name: "Other item",
            note: "",
            expire_date: null,
            location_id: null,
            createdBy: "owner-1",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
      }) as Awaited<ReturnType<InventoryRepository["getDashboardForUser"]>>,
    createArea: async () => {
      writeCalls.push("createArea");
      throw new Error("should not create an area");
    },
    updateArea: async () => {
      writeCalls.push("updateArea");
      throw new Error("should not update an area");
    },
    updateAreaIfVersionMatches: async () => {
      writeCalls.push("updateAreaIfVersionMatches");
      throw new Error("should not update an area");
    },
    deleteArea: async () => {
      writeCalls.push("deleteArea");
      throw new Error("should not delete an area");
    },
    deleteAreaIfVersionMatches: async () => {
      writeCalls.push("deleteAreaIfVersionMatches");
      throw new Error("should not delete an area");
    },
    createLocation: async () => {
      writeCalls.push("createLocation");
      throw new Error("should not create a location");
    },
    updateLocation: async () => {
      writeCalls.push("updateLocation");
      throw new Error("should not update a location");
    },
    updateLocationIfVersionMatches: async () => {
      writeCalls.push("updateLocationIfVersionMatches");
      throw new Error("should not update a location");
    },
    deleteLocation: async () => {
      writeCalls.push("deleteLocation");
      throw new Error("should not delete a location");
    },
    deleteLocationIfVersionMatches: async () => {
      writeCalls.push("deleteLocationIfVersionMatches");
      throw new Error("should not delete a location");
    },
    createItem: async () => {
      writeCalls.push("createItem");
      throw new Error("should not create an item");
    },
    updateItem: async () => {
      writeCalls.push("updateItem");
      throw new Error("should not update an item");
    },
    updateItemIfVersionMatches: async () => {
      writeCalls.push("updateItemIfVersionMatches");
      throw new Error("should not update an item");
    },
    deleteItem: async () => {
      writeCalls.push("deleteItem");
      throw new Error("should not delete an item");
    },
    deleteItemIfVersionMatches: async () => {
      writeCalls.push("deleteItemIfVersionMatches");
      throw new Error("should not delete an item");
    },
  };
}
