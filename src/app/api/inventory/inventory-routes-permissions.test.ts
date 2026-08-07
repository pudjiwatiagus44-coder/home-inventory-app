import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { createInventoryService } from "../../../features/inventory/inventory-service";
import {
  AreaOutsideCurrentHouseholdError,
  ItemOutsideCurrentHouseholdError,
  LocationOutsideCurrentHouseholdError,
} from "../../../features/inventory/inventory-service";
import { createAreaHandlers } from "./areas/handlers";
import { createAreaItemHandlers } from "./areas/[areaId]/handlers";
import { createLocationHandlers } from "./locations/handlers";
import { createLocationItemHandlers } from "./locations/[locationId]/handlers";
import { createItemHandlers } from "./items/handlers";
import { createItemItemHandlers } from "./items/[itemId]/handlers";

type InventoryRouteService = ReturnType<typeof createInventoryService>;

function createAuthenticatedDependencies(
  service: Partial<InventoryRouteService>,
) {
  return {
    authService: {
      getCurrentUser: async () => ({
        userId: "user-b",
        email: "b@example.com",
      }),
    },
    inventoryService: createInventoryServiceDouble(service),
    recognitionService: {
      recognizeForCurrentUser: async () => ({
        mode: "name",
        recognized: false,
        name: null,
      }),
      attachPhotoToItem: async () => false,
      getItemPhoto: async () => null,
      deleteItemPhoto: async () => undefined,
      cleanupExpiredPendingPhotos: async () => 0,
    },
  };
}

function createInventoryServiceDouble(
  overrides: Partial<InventoryRouteService>,
): InventoryRouteService {
  const notImplemented = async () => {
    throw new Error("unexpected inventory service call");
  };

  return {
    createAreaForCurrentUser: notImplemented,
    updateAreaForCurrentUser: notImplemented,
    deleteAreaForCurrentUser: notImplemented,
    createLocationForCurrentUser: notImplemented,
    updateLocationForCurrentUser: notImplemented,
    deleteLocationForCurrentUser: notImplemented,
    createItemForCurrentUser: notImplemented,
    updateItemForCurrentUser: notImplemented,
    deleteItemForCurrentUser: notImplemented,
    ...overrides,
  };
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      cookie: "home_inventory_session=session-token",
    },
    body: JSON.stringify(body),
  });
}

async function expectForbidden(response: Response, message: string) {
  await expect(response.json()).resolves.toEqual({
    ok: false,
    message,
  });
  expect(response.status).toBe(403);
}

describe("inventory API route permission boundaries", () => {
  it("maps creating a location under another user's area to 403", async () => {
    const calls: unknown[] = [];
    const handlers = createLocationHandlers(
      createAuthenticatedDependencies({
        createLocationForCurrentUser: async (input) => {
          calls.push(input);
          throw new AreaOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.POST(
      jsonRequest("http://localhost/api/inventory/locations", "POST", {
        name: "Borrowed shelf",
        areaId: "area-a",
      }),
    );

    await expectForbidden(
      response,
      "Selected area does not belong to current user",
    );
    expect(calls).toEqual([
      {
        userId: "user-b",
        name: "Borrowed shelf",
        areaId: "area-a",
      },
    ]);
  });

  it("maps updating another user's area to 403", async () => {
    const calls: unknown[] = [];
    const handlers = createAreaItemHandlers(
      createAuthenticatedDependencies({
        updateAreaForCurrentUser: async (input) => {
          calls.push(input);
          throw new AreaOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.PATCH(
      jsonRequest("http://localhost/api/inventory/areas/area-a", "PATCH", {
        name: "Kitchen",
        color: "#256f6b",
      }),
      { params: Promise.resolve({ areaId: "area-a" }) },
    );

    await expectForbidden(
      response,
      "Selected area does not belong to current user",
    );
    expect(calls).toEqual([
      {
        userId: "user-b",
        areaId: "area-a",
        name: "Kitchen",
        color: "#256f6b",
      },
    ]);
  });

  it("maps deleting another user's area to 403", async () => {
    const handlers = createAreaItemHandlers(
      createAuthenticatedDependencies({
        deleteAreaForCurrentUser: async () => {
          throw new AreaOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.DELETE(
      jsonRequest("http://localhost/api/inventory/areas/area-a", "DELETE", {}),
      { params: Promise.resolve({ areaId: "area-a" }) },
    );

    await expectForbidden(
      response,
      "Selected area does not belong to current user",
    );
  });

  it("maps updating another user's location to 403", async () => {
    const handlers = createLocationItemHandlers(
      createAuthenticatedDependencies({
        updateLocationForCurrentUser: async () => {
          throw new LocationOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.PATCH(
      jsonRequest(
        "http://localhost/api/inventory/locations/location-a",
        "PATCH",
        { name: "Shelf", areaId: null },
      ),
      { params: Promise.resolve({ locationId: "location-a" }) },
    );

    await expectForbidden(
      response,
      "Selected location does not belong to current user",
    );
  });

  it("maps moving a current-user location into another user's area to 403", async () => {
    const handlers = createLocationItemHandlers(
      createAuthenticatedDependencies({
        updateLocationForCurrentUser: async () => {
          throw new AreaOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.PATCH(
      jsonRequest(
        "http://localhost/api/inventory/locations/location-b",
        "PATCH",
        { name: "Shelf", areaId: "area-a" },
      ),
      { params: Promise.resolve({ locationId: "location-b" }) },
    );

    await expectForbidden(
      response,
      "Selected area does not belong to current user",
    );
  });

  it("maps deleting another user's location to 403", async () => {
    const handlers = createLocationItemHandlers(
      createAuthenticatedDependencies({
        deleteLocationForCurrentUser: async () => {
          throw new LocationOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.DELETE(
      jsonRequest(
        "http://localhost/api/inventory/locations/location-a",
        "DELETE",
        {},
      ),
      { params: Promise.resolve({ locationId: "location-a" }) },
    );

    await expectForbidden(
      response,
      "Selected location does not belong to current user",
    );
  });

  it("maps creating an item in another user's location to 403", async () => {
    const handlers = createItemHandlers(
      createAuthenticatedDependencies({
        createItemForCurrentUser: async () => {
          throw new LocationOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.POST(
      jsonRequest("http://localhost/api/inventory/items", "POST", {
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "location-a",
      }),
    );

    await expectForbidden(
      response,
      "Selected location does not belong to current user",
    );
  });

  it("maps updating another user's item to 403", async () => {
    const handlers = createItemItemHandlers(
      createAuthenticatedDependencies({
        updateItemForCurrentUser: async () => {
          throw new ItemOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.PATCH(
      jsonRequest("http://localhost/api/inventory/items/item-a", "PATCH", {
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: null,
      }),
      { params: Promise.resolve({ itemId: "item-a" }) },
    );

    await expectForbidden(
      response,
      "Selected item does not belong to current user",
    );
  });

  it("maps moving a current-user item into another user's location to 403", async () => {
    const handlers = createItemItemHandlers(
      createAuthenticatedDependencies({
        updateItemForCurrentUser: async () => {
          throw new LocationOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.PATCH(
      jsonRequest("http://localhost/api/inventory/items/item-b", "PATCH", {
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "location-a",
      }),
      { params: Promise.resolve({ itemId: "item-b" }) },
    );

    await expectForbidden(
      response,
      "Selected location does not belong to current user",
    );
  });

  it("maps deleting another user's item to 403", async () => {
    const handlers = createItemItemHandlers(
      createAuthenticatedDependencies({
        deleteItemForCurrentUser: async () => {
          throw new ItemOutsideCurrentHouseholdError();
        },
      }),
    );

    const response = await handlers.DELETE(
      jsonRequest("http://localhost/api/inventory/items/item-a", "DELETE", {}),
      { params: Promise.resolve({ itemId: "item-a" }) },
    );

    await expectForbidden(
      response,
      "Selected item does not belong to current user",
    );
  });

  it("keeps area creation on the current-user route contract", async () => {
    const calls: unknown[] = [];
    const handlers = createAreaHandlers(
      createAuthenticatedDependencies({
        createAreaForCurrentUser: async (input) => {
          calls.push(input);
          return { id: "area-b", name: "Kitchen", color: "#256f6b" };
        },
      }),
    );

    const response = await handlers.POST(
      jsonRequest("http://localhost/api/inventory/areas", "POST", {
        name: "Kitchen",
        color: "#256f6b",
        householdId: "household-a",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "area-b", name: "Kitchen", color: "#256f6b" },
    });
    expect(calls).toEqual([
      {
        userId: "user-b",
        name: "Kitchen",
        color: "#256f6b",
      },
    ]);
  });
});
