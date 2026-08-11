import { describe, expect, it } from "vitest";

import {
  AreaOutsideCurrentHouseholdError,
  createInventoryService,
  ItemOutsideCurrentHouseholdError,
  LocationOutsideCurrentHouseholdError,
} from "./inventory-service";
import type { DashboardData } from "./dashboard-data";
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
  it("loads the explicitly selected household before writing", async () => {
    const dashboardRequests: Array<{ userId: string; householdId?: string }> = [];
    const { repository } = createPermissionRepository({
      getDashboardForUser: async (userId, householdId) => {
        dashboardRequests.push({ userId, householdId });
        return dashboardWithRole("member", {
          household: { id: householdId ?? "default-household", name: "Home", role: "member" },
        });
      },
    });
    const service = createInventoryService({ repository });

    await service.createItemForCurrentUser({
      userId: "user-1",
      householdId: "household-shared",
      name: "Shared item",
      note: "",
      expireDate: null,
      locationId: null,
    });

    expect(dashboardRequests).toEqual([
      { userId: "user-1", householdId: "household-shared" },
    ]);
  });

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

  it("lets contributors create and edit their own items but not delete them", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          items: [
            {
              id: "item-1",
              name: "Cup",
              note: "",
              expire_date: null,
              location_id: null,
              createdBy: "member-1",
            },
          ],
        }),
    });
    const service = createInventoryService({ repository });

    await service.createItemForCurrentUser({
      userId: "member-1",
      name: "New item",
      note: "",
      expireDate: null,
      locationId: null,
    });
    await service.updateItemForCurrentUser({
      userId: "member-1",
      itemId: "item-1",
      name: "Cup 2",
      note: "",
      expireDate: null,
      locationId: null,
    });

    await expect(
      service.deleteItemForCurrentUser({ userId: "member-1", itemId: "item-1" }),
    ).rejects.toThrow("不能删除");
    expect(writes.map(([name]) => name)).toEqual(["createItem", "updateItem"]);
  });

  it("rejects contributors editing items created by someone else", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          items: [
            {
              id: "item-2",
              name: "Someone else's item",
              note: "",
              expire_date: null,
              location_id: null,
              createdBy: "owner-1",
            },
          ],
        }),
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateItemForCurrentUser({
        userId: "member-1",
        itemId: "item-2",
        name: "Renamed",
        note: "",
        expireDate: null,
        locationId: null,
      }),
    ).rejects.toThrow("只能编辑自己创建");
    expect(writes).toEqual([]);
  });

  it("rejects contributors deleting any item", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          items: [
            {
              id: "own-item",
              name: "Own item",
              note: "",
              expire_date: null,
              location_id: null,
              createdBy: "member-1",
            },
            {
              id: "other-item",
              name: "Other item",
              note: "",
              expire_date: null,
              location_id: null,
              createdBy: "owner-1",
            },
          ],
        }),
    });
    const service = createInventoryService({ repository });

    await expect(
      service.deleteItemForCurrentUser({ userId: "member-1", itemId: "own-item" }),
    ).rejects.toThrow("不能删除");
    await expect(
      service.deleteItemForCurrentUser({
        userId: "member-1",
        itemId: "other-item",
      }),
    ).rejects.toThrow("不能删除");
    expect(writes).toEqual([]);
  });

  it("lets contributors create and edit their own locations but not delete them", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          locations: [
            {
              id: "location-1",
              name: "Shelf",
              area_id: null,
              createdBy: "member-1",
            },
          ],
        }),
    });
    const service = createInventoryService({ repository });

    await service.createLocationForCurrentUser({
      userId: "member-1",
      name: "New shelf",
      areaId: null,
    });
    await service.updateLocationForCurrentUser({
      userId: "member-1",
      locationId: "location-1",
      name: "Shelf 2",
      areaId: null,
    });

    await expect(
      service.deleteLocationForCurrentUser({
        userId: "member-1",
        locationId: "location-1",
      }),
    ).rejects.toThrow("不能删除");
    expect(writes.map(([name]) => name)).toEqual([
      "createLocation",
      "updateLocation",
    ]);
  });

  it("rejects contributors editing locations created by someone else or nobody", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          locations: [
            {
              id: "other-location",
              name: "Other shelf",
              area_id: null,
              createdBy: "owner-1",
            },
            {
              id: "legacy-location",
              name: "Legacy shelf",
              area_id: null,
              createdBy: null,
            },
          ],
        }),
    });
    const service = createInventoryService({ repository });

    await expect(
      service.updateLocationForCurrentUser({
        userId: "member-1",
        locationId: "other-location",
        name: "Renamed",
        areaId: null,
      }),
    ).rejects.toThrow("只能编辑自己创建");
    await expect(
      service.updateLocationForCurrentUser({
        userId: "member-1",
        locationId: "legacy-location",
        name: "Renamed",
        areaId: null,
      }),
    ).rejects.toThrow("只能编辑自己创建");
    expect(writes).toEqual([]);
  });

  it("rejects contributors deleting any location", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          locations: [
            {
              id: "own-location",
              name: "Own shelf",
              area_id: null,
              createdBy: "member-1",
            },
            {
              id: "other-location",
              name: "Other shelf",
              area_id: null,
              createdBy: "owner-1",
            },
          ],
        }),
    });
    const service = createInventoryService({ repository });

    await expect(
      service.deleteLocationForCurrentUser({
        userId: "member-1",
        locationId: "own-location",
      }),
    ).rejects.toThrow("不能删除");
    await expect(
      service.deleteLocationForCurrentUser({
        userId: "member-1",
        locationId: "other-location",
      }),
    ).rejects.toThrow("不能删除");
    expect(writes).toEqual([]);
  });

  it("rejects contributors creating, updating, or deleting areas", async () => {
    const { repository, writes } = createPermissionRepository({
      getDashboardForUser: async () =>
        dashboardWithRole("contributor", {
          areas: [{ id: "area-1", name: "Kitchen", color: "#64748b" }],
        }),
    });
    const service = createInventoryService({ repository });

    await expect(
      service.createAreaForCurrentUser({
        userId: "member-1",
        name: "Pantry",
        color: "#256f6b",
      }),
    ).rejects.toThrow("不能管理区域");
    await expect(
      service.updateAreaForCurrentUser({
        userId: "member-1",
        areaId: "area-1",
        name: "Kitchen 2",
        color: "#256f6b",
      }),
    ).rejects.toThrow("不能管理区域");
    await expect(
      service.deleteAreaForCurrentUser({
        userId: "member-1",
        areaId: "area-1",
      }),
    ).rejects.toThrow("不能管理区域");
    expect(writes).toEqual([]);
  });
});

function dashboardWithRole(
  role: "owner" | "member" | "contributor" | "readonly",
  overrides: Partial<DashboardData> = {},
): DashboardData {
  return {
    household: { id: "household-1", name: "Home", role },
    areas: [],
    locations: [],
    items: [],
    ...overrides,
  } as DashboardData;
}
