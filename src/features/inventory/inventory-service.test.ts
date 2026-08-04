import { describe, expect, it } from "vitest";

import {
  AreaOutsideCurrentHouseholdError,
  createInventoryService,
  ItemOutsideCurrentHouseholdError,
  LocationOutsideCurrentHouseholdError,
} from "./inventory-service";
import type { InventoryRepository } from "./inventory-repository";

function createRepository(overrides: Partial<InventoryRepository> = {}) {
  const calls: unknown[] = [];
  const repository: InventoryRepository = {
    getDashboardForUser: async () => ({
      household: { id: "household-1", name: "Home" },
      areas: [
        {
          id: "area-1",
          name: "Kitchen",
          color: "#64748b",
          updatedAt: "2026-08-04T00:00:00.000Z",
        },
      ],
      locations: [
        {
          id: "location-1",
          name: "Shelf",
          area_id: null,
          updatedAt: "2026-08-04T00:00:00.000Z",
        },
      ],
      items: [
        {
          id: "item-1",
          name: "Battery",
          note: "",
          expire_date: null,
          location_id: "location-1",
          updatedAt: "2026-08-04T00:00:00.000Z",
        },
      ],
    }),
    createArea: async (input) => {
      calls.push(["createArea", input]);
      return {
        id: "area-1",
        name: input.name.trim(),
        color: input.color ?? "#64748b",
      };
    },
    updateArea: async (input) => {
      calls.push(["updateArea", input]);
      return {
        id: input.areaId,
        name: input.name.trim(),
        color: input.color ?? "#64748b",
      };
    },
    updateAreaIfVersionMatches: async (input) => {
      calls.push(["updateAreaIfVersionMatches", input]);
      return {
        id: input.areaId,
        name: input.name.trim(),
        color: input.color ?? "#64748b",
        updatedAt: "2026-08-04T00:30:00.000Z",
      };
    },
    deleteArea: async (input) => {
      calls.push(["deleteArea", input]);
    },
    deleteAreaIfVersionMatches: async (input) => {
      calls.push(["deleteAreaIfVersionMatches", input]);
      return true;
    },
    createLocation: async (input) => {
      calls.push(["createLocation", input]);
      return { id: "location-1", name: input.name.trim() };
    },
    updateLocation: async (input) => {
      calls.push(["updateLocation", input]);
      return { id: input.locationId, name: input.name.trim() };
    },
    updateLocationIfVersionMatches: async (input) => {
      calls.push(["updateLocationIfVersionMatches", input]);
      return {
        id: input.locationId,
        name: input.name.trim(),
        area_id: input.areaId ?? null,
        updatedAt: "2026-08-04T00:30:00.000Z",
      };
    },
    deleteLocation: async (input) => {
      calls.push(["deleteLocation", input]);
    },
    deleteLocationIfVersionMatches: async (input) => {
      calls.push(["deleteLocationIfVersionMatches", input]);
      return true;
    },
    createItem: async (input) => {
      calls.push(["createItem", input]);
      return {
        id: "item-1",
        name: input.name.trim(),
        note: input.note.trim(),
        expire_date: input.expireDate,
        location_id: input.locationId,
      };
    },
    updateItem: async (input) => {
      calls.push(["updateItem", input]);
      return {
        id: input.itemId,
        name: input.name.trim(),
        note: input.note.trim(),
        expire_date: input.expireDate,
        location_id: input.locationId,
      };
    },
    updateItemIfVersionMatches: async (input) => {
      calls.push(["updateItemIfVersionMatches", input]);
      return {
        id: input.itemId,
        name: input.name.trim(),
        note: input.note.trim(),
        expire_date: input.expireDate,
        location_id: input.locationId,
        updatedAt: "2026-08-04T00:30:00.000Z",
      };
    },
    deleteItem: async (input) => {
      calls.push(["deleteItem", input]);
    },
    deleteItemIfVersionMatches: async (input) => {
      calls.push(["deleteItemIfVersionMatches", input]);
      return true;
    },
    ...overrides,
  };

  return { calls, repository };
}

describe("createInventoryService", () => {
  it("creates an area in the current user's household without trusting a caller household id", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.createAreaForCurrentUser({
        userId: "user-1",
        name: " Kitchen ",
        color: "#256f6b",
      }),
    ).resolves.toEqual({
      id: "area-1",
      name: "Kitchen",
      color: "#256f6b",
    });

    expect(calls).toContainEqual([
      "createArea",
      {
        householdId: "household-1",
        name: "Kitchen",
        color: "#256f6b",
      },
    ]);
  });

  it("rejects area creation when the current user has no household", async () => {
    const { repository } = createRepository({
      getDashboardForUser: async () => null,
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createAreaForCurrentUser({
        userId: "missing-user",
        name: "Kitchen",
        color: "#256f6b",
      }),
    ).rejects.toThrow("No household found for current user");
  });

  it("validates area input before writing", async () => {
    let createCalled = false;
    const { repository } = createRepository({
      createArea: async () => {
        createCalled = true;
        return { id: "area-1", name: "Kitchen", color: "#64748b" };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createAreaForCurrentUser({
        userId: "user-1",
        name: " ",
        color: "#256f6b",
      }),
    ).rejects.toThrow();
    expect(createCalled).toBe(false);
  });

  it("creates a location in the current user's household without trusting a caller household id", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.createLocationForCurrentUser({
        userId: "user-1",
        name: " Shelf ",
        areaId: null,
      }),
    ).resolves.toEqual({ id: "location-1", name: "Shelf" });

    expect(calls).toEqual([
      [
        "createLocation",
        {
          householdId: "household-1",
          name: "Shelf",
          areaId: null,
        },
      ],
    ]);
  });

  it("rejects location creation when the current user has no household", async () => {
    const { repository } = createRepository({
      getDashboardForUser: async () => null,
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createLocationForCurrentUser({
        userId: "missing-user",
        name: "Shelf",
        areaId: null,
      }),
    ).rejects.toThrow("No household found for current user");
  });

  it("validates location input before writing", async () => {
    let createCalled = false;
    const { repository } = createRepository({
      createLocation: async () => {
        createCalled = true;
        return { id: "location-1", name: "Shelf" };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createLocationForCurrentUser({
        userId: "user-1",
        name: " ",
        areaId: null,
      }),
    ).rejects.toThrow();
    expect(createCalled).toBe(false);
  });

  it("rejects location creation when the selected area is outside the current household", async () => {
    let createCalled = false;
    const { repository } = createRepository({
      createLocation: async () => {
        createCalled = true;
        return { id: "location-1", name: "Shelf" };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createLocationForCurrentUser({
        userId: "user-1",
        name: "Shelf",
        areaId: "foreign-area",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(createCalled).toBe(false);
  });

  it("updates a location in the current user's household and area", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateLocationForCurrentUser({
        userId: "user-1",
        locationId: "location-1",
        name: " Pantry ",
        areaId: "area-1",
      }),
    ).resolves.toEqual({ id: "location-1", name: "Pantry" });

    expect(calls).toContainEqual([
      "updateLocation",
      {
        householdId: "household-1",
        locationId: "location-1",
        name: "Pantry",
        areaId: "area-1",
      },
    ]);
  });

  it("updates a location without an area in the current user's household", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await service.updateLocationForCurrentUser({
      userId: "user-1",
      locationId: "location-1",
      name: "Pantry",
      areaId: null,
    });

    expect(calls).toContainEqual([
      "updateLocation",
      {
        householdId: "household-1",
        locationId: "location-1",
        name: "Pantry",
        areaId: null,
      },
    ]);
  });

  it("rejects location updates when the location is outside the current household", async () => {
    let updateCalled = false;
    const { repository } = createRepository({
      updateLocation: async () => {
        updateCalled = true;
        return { id: "foreign-location", name: "Pantry" };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateLocationForCurrentUser({
        userId: "user-1",
        locationId: "foreign-location",
        name: "Pantry",
        areaId: null,
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(updateCalled).toBe(false);
  });

  it("rejects location updates when the selected area is outside the current household", async () => {
    let updateCalled = false;
    const { repository } = createRepository({
      updateLocation: async () => {
        updateCalled = true;
        return { id: "location-1", name: "Pantry" };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateLocationForCurrentUser({
        userId: "user-1",
        locationId: "location-1",
        name: "Pantry",
        areaId: "foreign-area",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(updateCalled).toBe(false);
  });

  it("deletes a location in the current user's household", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.deleteLocationForCurrentUser({
        userId: "user-1",
        locationId: "location-1",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual([
      "deleteLocation",
      {
        householdId: "household-1",
        locationId: "location-1",
      },
    ]);
  });

  it("rejects location deletion when the location is outside the current household", async () => {
    let deleteCalled = false;
    const { repository } = createRepository({
      deleteLocation: async () => {
        deleteCalled = true;
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.deleteLocationForCurrentUser({
        userId: "user-1",
        locationId: "foreign-location",
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(deleteCalled).toBe(false);
  });

  it("updates an area in the current user's household", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateAreaForCurrentUser({
        userId: "user-1",
        areaId: "area-1",
        name: " Kitchen ",
        color: "#256f6b",
      }),
    ).resolves.toEqual({
      id: "area-1",
      name: "Kitchen",
      color: "#256f6b",
    });

    expect(calls).toContainEqual([
      "updateArea",
      {
        householdId: "household-1",
        areaId: "area-1",
        name: "Kitchen",
        color: "#256f6b",
      },
    ]);
  });

  it("rejects area updates when the area is outside the current household", async () => {
    let updateCalled = false;
    const { repository } = createRepository({
      updateArea: async () => {
        updateCalled = true;
        return { id: "foreign-area", name: "Kitchen", color: "#256f6b" };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateAreaForCurrentUser({
        userId: "user-1",
        areaId: "foreign-area",
        name: "Kitchen",
        color: "#256f6b",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(updateCalled).toBe(false);
  });

  it("deletes an area in the current user's household", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.deleteAreaForCurrentUser({
        userId: "user-1",
        areaId: "area-1",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual([
      "deleteArea",
      {
        householdId: "household-1",
        areaId: "area-1",
      },
    ]);
  });

  it("rejects area deletion when the area is outside the current household", async () => {
    let deleteCalled = false;
    const { repository } = createRepository({
      deleteArea: async () => {
        deleteCalled = true;
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.deleteAreaForCurrentUser({
        userId: "user-1",
        areaId: "foreign-area",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(deleteCalled).toBe(false);
  });

  it("creates an item in the current user's household and location", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.createItemForCurrentUser({
        userId: "user-1",
        name: " Battery ",
        note: " Spare ",
        expireDate: "2027-01-02",
        locationId: "location-1",
      }),
    ).resolves.toEqual({
      id: "item-1",
      name: "Battery",
      note: "Spare",
      expire_date: "2027-01-02",
      location_id: "location-1",
    });

    expect(calls).toContainEqual([
      "createItem",
      {
        householdId: "household-1",
        createdBy: "user-1",
        name: "Battery",
        note: "Spare",
        expireDate: "2027-01-02",
        locationId: "location-1",
      },
    ]);
  });

  it("creates an item without a location in the current user's household", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await service.createItemForCurrentUser({
      userId: "user-1",
      name: "Battery",
      note: "",
      expireDate: null,
      locationId: null,
    });

    expect(calls).toContainEqual([
      "createItem",
      {
        householdId: "household-1",
        createdBy: "user-1",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: null,
      },
    ]);
  });

  it("rejects item creation when the selected location is outside the current household", async () => {
    let createCalled = false;
    const { repository } = createRepository({
      createItem: async () => {
        createCalled = true;
        return {
          id: "item-1",
          name: "Battery",
          note: "",
          expire_date: null,
          location_id: "foreign-location",
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createItemForCurrentUser({
        userId: "user-1",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "foreign-location",
      }),
    ).rejects.toThrow("Selected location does not belong to current user");
    expect(createCalled).toBe(false);
  });

  it("updates an item in the current user's household and location", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateItemForCurrentUser({
        userId: "user-1",
        itemId: "item-1",
        name: " Battery pack ",
        note: " Fresh ",
        expireDate: "2028-02-03",
        locationId: "location-1",
      }),
    ).resolves.toEqual({
      id: "item-1",
      name: "Battery pack",
      note: "Fresh",
      expire_date: "2028-02-03",
      location_id: "location-1",
    });

    expect(calls).toContainEqual([
      "updateItem",
      {
        householdId: "household-1",
        itemId: "item-1",
        name: "Battery pack",
        note: "Fresh",
        expireDate: "2028-02-03",
        locationId: "location-1",
      },
    ]);
  });

  it("rejects item updates when the item is outside the current household", async () => {
    let updateCalled = false;
    const { repository } = createRepository({
      updateItem: async () => {
        updateCalled = true;
        return {
          id: "foreign-item",
          name: "Battery",
          note: "",
          expire_date: null,
          location_id: null,
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateItemForCurrentUser({
        userId: "user-1",
        itemId: "foreign-item",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: null,
      }),
    ).rejects.toBeInstanceOf(ItemOutsideCurrentHouseholdError);
    expect(updateCalled).toBe(false);
  });

  it("rejects item updates when the selected location is outside the current household", async () => {
    let updateCalled = false;
    const { repository } = createRepository({
      updateItem: async () => {
        updateCalled = true;
        return {
          id: "item-1",
          name: "Battery",
          note: "",
          expire_date: null,
          location_id: "foreign-location",
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateItemForCurrentUser({
        userId: "user-1",
        itemId: "item-1",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "foreign-location",
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(updateCalled).toBe(false);
  });

  it("deletes an item in the current user's household", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.deleteItemForCurrentUser({
        userId: "user-1",
        itemId: "item-1",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual([
      "deleteItem",
      {
        householdId: "household-1",
        itemId: "item-1",
      },
    ]);
  });

  it("rejects item deletion when the item is outside the current household", async () => {
    let deleteCalled = false;
    const { repository } = createRepository({
      deleteItem: async () => {
        deleteCalled = true;
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.deleteItemForCurrentUser({
        userId: "user-1",
        itemId: "foreign-item",
      }),
    ).rejects.toBeInstanceOf(ItemOutsideCurrentHouseholdError);
    expect(deleteCalled).toBe(false);
  });

  it("syncs an offline item create in the current user's household", async () => {
    const { calls, repository } = createRepository({
      createItem: async (input) => {
        calls.push(["createItem", input]);
        return {
          id: "server-item-1",
          name: input.name.trim(),
          note: input.note.trim(),
          expire_date: input.expireDate,
          location_id: input.locationId,
          updatedAt: "2026-08-04T01:00:00.000Z",
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.syncQueuedOperationsForCurrentUser({
        userId: "user-1",
        operations: [
          {
            clientOperationId: "op-item-create",
            entity: "item",
            action: "create",
            localId: "local-item-1",
            payload: {
              name: " Flashlight ",
              note: " Hall drawer ",
              expireDate: null,
              locationId: "location-1",
            },
          },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          clientOperationId: "op-item-create",
          status: "applied",
          entity: "item",
          localId: "local-item-1",
          serverId: "server-item-1",
          serverUpdatedAt: "2026-08-04T01:00:00.000Z",
        },
      ],
    });

    expect(calls).toContainEqual([
      "createItem",
      {
        householdId: "household-1",
        createdBy: "user-1",
        name: "Flashlight",
        note: "Hall drawer",
        expireDate: null,
        locationId: "location-1",
      },
    ]);
  });

  it("returns an item update conflict when the server version changed", async () => {
    let updateCalled = false;
    const { repository } = createRepository({
      updateItem: async () => {
        updateCalled = true;
        return {
          id: "item-1",
          name: "Battery pack",
          note: "",
          expire_date: null,
          location_id: null,
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.syncQueuedOperationsForCurrentUser({
        userId: "user-1",
        operations: [
          {
            clientOperationId: "op-item-update",
            entity: "item",
            action: "update",
            serverId: "item-1",
            baseServerUpdatedAt: "2026-08-03T00:00:00.000Z",
            payload: {
              name: "Battery pack",
              note: "",
              expireDate: null,
              locationId: null,
            },
          },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          clientOperationId: "op-item-update",
          status: "conflict",
          entity: "item",
          serverId: "item-1",
          message: "Server item changed since the operation was queued",
        },
      ],
    });
    expect(updateCalled).toBe(false);
  });

  it("returns an item update conflict when the atomic repository update misses", async () => {
    let updateCalled = false;
    let atomicUpdateCalled = false;
    const { repository } = createRepository({
      updateItem: async () => {
        updateCalled = true;
        throw new Error("non-atomic update should not be used for mobile sync");
      },
      updateItemIfVersionMatches: async () => {
        atomicUpdateCalled = true;
        return null;
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.syncQueuedOperationsForCurrentUser({
        userId: "user-1",
        operations: [
          {
            clientOperationId: "op-item-update-atomic",
            entity: "item",
            action: "update",
            serverId: "item-1",
            baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
            payload: {
              name: "Battery pack",
              note: "",
              expireDate: null,
              locationId: null,
            },
          },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          clientOperationId: "op-item-update-atomic",
          status: "conflict",
          entity: "item",
          serverId: "item-1",
          message: "Server item changed since the operation was queued",
        },
      ],
    });
    expect(atomicUpdateCalled).toBe(true);
    expect(updateCalled).toBe(false);
  });

  it("returns an item delete conflict when the server row is missing", async () => {
    let deleteCalled = false;
    const { repository } = createRepository({
      deleteItem: async () => {
        deleteCalled = true;
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.syncQueuedOperationsForCurrentUser({
        userId: "user-1",
        operations: [
          {
            clientOperationId: "op-item-delete",
            entity: "item",
            action: "delete",
            serverId: "missing-item",
            baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          clientOperationId: "op-item-delete",
          status: "conflict",
          entity: "item",
          serverId: "missing-item",
          message: "Server item is missing",
        },
      ],
    });
    expect(deleteCalled).toBe(false);
  });

  it("returns an item delete conflict when the atomic repository delete misses", async () => {
    let deleteCalled = false;
    let atomicDeleteCalled = false;
    const { repository } = createRepository({
      deleteItem: async () => {
        deleteCalled = true;
      },
      deleteItemIfVersionMatches: async () => {
        atomicDeleteCalled = true;
        return false;
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.syncQueuedOperationsForCurrentUser({
        userId: "user-1",
        operations: [
          {
            clientOperationId: "op-item-delete-atomic",
            entity: "item",
            action: "delete",
            serverId: "item-1",
            baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          clientOperationId: "op-item-delete-atomic",
          status: "conflict",
          entity: "item",
          serverId: "item-1",
          message: "Server item changed since the operation was queued",
        },
      ],
    });
    expect(atomicDeleteCalled).toBe(true);
    expect(deleteCalled).toBe(false);
  });

  it("syncs an offline location update when the server version matches", async () => {
    const { calls, repository } = createRepository({
      updateLocationIfVersionMatches: async (input) => {
        calls.push(["updateLocationIfVersionMatches", input]);
        return {
          id: input.locationId,
          name: input.name.trim(),
          area_id: input.areaId,
          updatedAt: "2026-08-04T02:00:00.000Z",
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.syncQueuedOperationsForCurrentUser({
        userId: "user-1",
        operations: [
          {
            clientOperationId: "op-location-update",
            entity: "location",
            action: "update",
            serverId: "location-1",
            baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
            payload: {
              name: " Pantry ",
              areaId: "area-1",
            },
          },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          clientOperationId: "op-location-update",
          status: "applied",
          entity: "location",
          serverId: "location-1",
          serverUpdatedAt: "2026-08-04T02:00:00.000Z",
        },
      ],
    });

    expect(calls).toContainEqual([
      "updateLocationIfVersionMatches",
      {
        householdId: "household-1",
        locationId: "location-1",
        baseServerUpdatedAt: "2026-08-04T00:00:00.000Z",
        name: "Pantry",
        areaId: "area-1",
      },
    ]);
  });

  it("previews Excel import without writing to the repository", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.previewImportForCurrentUser({
        userId: "user-1",
        rows: [
          {
            index: 1,
            name: "Battery",
            locationName: "Shelf",
            areaName: "未分区",
            note: "",
            expireDate: null,
          },
          {
            index: 2,
            name: "Battery",
            locationName: "Shelf",
            areaName: "未分区",
            note: "fresh",
            expireDate: "2028-02-03",
          },
          {
            index: 3,
            name: "Tape",
            locationName: "Drawer",
            areaName: "Tools",
            note: "",
            expireDate: null,
          },
        ],
      }),
    ).resolves.toMatchObject({
      skipped: [{ row: 1, reason: "identical" }],
      conflicts: [
        {
          id: "2:item-1",
          existingItem: {
            id: "item-1",
            name: "Battery",
            note: "",
            expireDate: null,
            locationName: "Shelf",
            areaName: "未分区",
          },
        },
      ],
      creates: [
        {
          row: {
            index: 3,
            name: "Tape",
            locationName: "Drawer",
            areaName: "Tools",
            note: "",
            expireDate: null,
          },
        },
      ],
    });
    expect(calls).toEqual([]);
  });

  it("commits Excel import actions for the current user's household", async () => {
    let areaSequence = 1;
    let locationSequence = 1;
    const { calls, repository } = createRepository({
      createArea: async (input) => {
        calls.push(["createArea", input]);
        return {
          id: `new-area-${areaSequence++}`,
          name: input.name,
          color: input.color ?? "#64748b",
        };
      },
      createLocation: async (input) => {
        calls.push(["createLocation", input]);
        return {
          id: `new-location-${locationSequence++}`,
          name: input.name,
        };
      },
    });
    const service = createInventoryService({ repository });

    await expect(
      service.commitImportForCurrentUser({
        userId: "user-1",
        rows: [
          {
            index: 1,
            name: "Battery",
            locationName: "Shelf",
            areaName: "未分区",
            note: "",
            expireDate: null,
          },
          {
            index: 2,
            name: "Battery",
            locationName: "Shelf",
            areaName: "未分区",
            note: "fresh",
            expireDate: "2028-02-03",
          },
          {
            index: 3,
            name: "Tape",
            locationName: "Drawer",
            areaName: "Tools",
            note: "",
            expireDate: null,
          },
        ],
        conflictResolutions: {
          "2:item-1": "overwrite",
        },
      }),
    ).resolves.toMatchObject({
      createdAreas: 1,
      createdLocations: 1,
      createdItems: 1,
      keptConflictItems: 0,
      overwrittenItems: 1,
      skippedItems: 1,
      errors: [],
    });

    expect(calls).toContainEqual([
      "updateItem",
      {
        householdId: "household-1",
        itemId: "item-1",
        name: "Battery",
        note: "fresh",
        expireDate: "2028-02-03",
        locationId: "location-1",
      },
    ]);
    expect(calls).toContainEqual([
      "createItem",
      {
        householdId: "household-1",
        createdBy: "user-1",
        name: "Tape",
        note: "",
        expireDate: null,
        locationId: "new-location-1",
      },
    ]);
  });

  it("reuses an existing location name even when the Excel row names another area", async () => {
    const { calls, repository } = createRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.commitImportForCurrentUser({
        userId: "user-1",
        rows: [
          {
            index: 9,
            name: "Tape",
            locationName: "Shelf",
            areaName: "Tools",
            note: "",
            expireDate: null,
          },
        ],
        conflictResolutions: {},
      }),
    ).resolves.toMatchObject({
      createdAreas: 0,
      createdLocations: 0,
      createdItems: 1,
      errors: [],
    });

    expect(calls).not.toContainEqual([
      "createLocation",
      expect.objectContaining({
        householdId: "household-1",
        name: "Shelf",
      }),
    ]);
    expect(calls).toContainEqual([
      "createItem",
      {
        householdId: "household-1",
        createdBy: "user-1",
        name: "Tape",
        note: "",
        expireDate: null,
        locationId: "location-1",
      },
    ]);
  });
});
