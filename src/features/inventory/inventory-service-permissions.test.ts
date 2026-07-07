import { describe, expect, it } from "vitest";

import {
  AreaOutsideCurrentHouseholdError,
  createInventoryService,
  ItemOutsideCurrentHouseholdError,
  LocationOutsideCurrentHouseholdError,
} from "./inventory-service";
import type { InventoryRepository } from "./inventory-repository";

function createPermissionRepository(overrides: Partial<InventoryRepository> = {}) {
  const writes: unknown[] = [];
  const repository: InventoryRepository = {
    getDashboardForUser: async () => ({
      household: { id: "household-b", name: "User B Home" },
      areas: [{ id: "area-b", name: "Kitchen", color: "#64748b" }],
      locations: [{ id: "location-b", name: "Shelf", area_id: "area-b" }],
      items: [
        {
          id: "item-b",
          name: "Battery",
          note: "",
          expire_date: null,
          location_id: "location-b",
        },
      ],
    }),
    createArea: async (input) => {
      writes.push(["createArea", input]);
      return { id: "area-b", name: input.name, color: input.color ?? "#64748b" };
    },
    updateArea: async (input) => {
      writes.push(["updateArea", input]);
      return { id: input.areaId, name: input.name, color: input.color ?? "#64748b" };
    },
    deleteArea: async (input) => {
      writes.push(["deleteArea", input]);
    },
    createLocation: async (input) => {
      writes.push(["createLocation", input]);
      return { id: "location-b", name: input.name };
    },
    updateLocation: async (input) => {
      writes.push(["updateLocation", input]);
      return { id: input.locationId, name: input.name };
    },
    deleteLocation: async (input) => {
      writes.push(["deleteLocation", input]);
    },
    createItem: async (input) => {
      writes.push(["createItem", input]);
      return {
        id: "item-b",
        name: input.name,
        note: input.note,
        expire_date: input.expireDate,
        location_id: input.locationId,
      };
    },
    updateItem: async (input) => {
      writes.push(["updateItem", input]);
      return {
        id: input.itemId,
        name: input.name,
        note: input.note,
        expire_date: input.expireDate,
        location_id: input.locationId,
      };
    },
    deleteItem: async (input) => {
      writes.push(["deleteItem", input]);
    },
    ...overrides,
  };

  return { repository, writes };
}

describe("createInventoryService permission boundaries", () => {
  it("rejects creating a location under another user's area", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.createLocationForCurrentUser({
        userId: "user-b",
        name: "Borrowed shelf",
        areaId: "area-a",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects updating another user's area", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateAreaForCurrentUser({
        userId: "user-b",
        areaId: "area-a",
        name: "Kitchen",
        color: "#256f6b",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects deleting another user's area", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.deleteAreaForCurrentUser({
        userId: "user-b",
        areaId: "area-a",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects updating another user's location", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateLocationForCurrentUser({
        userId: "user-b",
        locationId: "location-a",
        name: "Shelf",
        areaId: null,
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects moving a current-user location into another user's area", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateLocationForCurrentUser({
        userId: "user-b",
        locationId: "location-b",
        name: "Shelf",
        areaId: "area-a",
      }),
    ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects deleting another user's location", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.deleteLocationForCurrentUser({
        userId: "user-b",
        locationId: "location-a",
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects creating an item in another user's location", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.createItemForCurrentUser({
        userId: "user-b",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "location-a",
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects updating another user's item", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateItemForCurrentUser({
        userId: "user-b",
        itemId: "item-a",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: null,
      }),
    ).rejects.toBeInstanceOf(ItemOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects moving a current-user item into another user's location", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.updateItemForCurrentUser({
        userId: "user-b",
        itemId: "item-b",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "location-a",
      }),
    ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });

  it("rejects deleting another user's item", async () => {
    const { repository, writes } = createPermissionRepository();
    const service = createInventoryService({ repository });

    await expect(
      service.deleteItemForCurrentUser({
        userId: "user-b",
        itemId: "item-a",
      }),
    ).rejects.toBeInstanceOf(ItemOutsideCurrentHouseholdError);
    expect(writes).toEqual([]);
  });
});
