import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createItemHandlers } from "./handlers";
import { createItemItemHandlers } from "./[itemId]/handlers";
import { createItemPhotoHandlers } from "./[itemId]/photo/handlers";

describe("item photo attach", () => {
  it("attaches a valid photoKey after creating an item", async () => {
    let attached: { userId: string; itemId: string; photoKey: string } | null =
      null;
    const handlers = createItemHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      inventoryService: {
        createItemForCurrentUser: async () => ({
          id: "item-1",
          name: "牛奶",
          note: "",
          expire_date: null,
          location_id: null,
        }),
      } as never,
      recognitionService: {
        attachPhotoToItem: async (input) => {
          attached = input;
          return true;
        },
      } as never,
    });

    const response = await handlers.POST(
      new NextRequest("http://localhost/api/inventory/items", {
        method: "POST",
        headers: { cookie: "home_inventory_session=session-token" },
        body: JSON.stringify({
          householdId: "household-2",
          name: "牛奶",
          note: "",
          expireDate: null,
          locationId: null,
          photoKey: "photo_1.jpg",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(attached).toEqual({
      userId: "user-1",
      itemId: "item-1",
      householdId: "household-2",
      photoKey: "photo_1.jpg",
    });
  });

  it("returns the photo only to the item household member", async () => {
    const handlers = createItemPhotoHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      recognitionService: {
        getItemPhoto: async () => null,
      } as never,
    });

    const response = await handlers.GET(
      new NextRequest("http://localhost/api/inventory/items/item-1/photo", {
        headers: { cookie: "home_inventory_session=session-token" },
      }),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("forwards the selected householdId when reading an item photo", async () => {
    let requested: { userId: string; itemId: string; householdId?: string } | null =
      null;
    const handlers = createItemPhotoHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      recognitionService: {
        getItemPhoto: async (input) => {
          requested = input;
          return null;
        },
      } as never,
    });

    const response = await handlers.GET(
      new NextRequest(
        "http://localhost/api/inventory/items/item-1/photo?householdId=household-2",
        {
          headers: { cookie: "home_inventory_session=session-token" },
        },
      ),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(404);
    expect(requested).toEqual({
      userId: "user-1",
      itemId: "item-1",
      householdId: "household-2",
    });
  });

  it("deletes the item photo under the selected household", async () => {
    let deleted: { userId: string; itemId: string; householdId?: string } | null =
      null;
    const handlers = createItemItemHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      inventoryService: {
        deleteItemForCurrentUser: async () => undefined,
      } as never,
      recognitionService: {
        deleteItemPhoto: async (input) => {
          deleted = input;
        },
      } as never,
    });

    const response = await handlers.DELETE(
      new NextRequest(
        "http://localhost/api/inventory/items/item-1?householdId=household-2",
        {
          method: "DELETE",
          headers: { cookie: "home_inventory_session=session-token" },
        },
      ),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(200);
    expect(deleted).toEqual({
      userId: "user-1",
      itemId: "item-1",
      householdId: "household-2",
    });
  });

  it("returns 401 for the photo route without a session", async () => {
    const handlers = createItemPhotoHandlers();
    const response = await handlers.GET(
      new NextRequest("http://localhost/api/inventory/items/item-1/photo"),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("attaches a photoKey when updating an item", async () => {
    let attached: { userId: string; itemId: string; photoKey: string } | null =
      null;
    const handlers = createItemItemHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "a@b.c" }),
      },
      inventoryService: {
        updateItemForCurrentUser: async () => ({
          id: "item-1",
          name: "牛奶",
          note: "",
          expire_date: null,
          location_id: null,
        }),
      } as never,
      recognitionService: {
        attachPhotoToItem: async (input) => {
          attached = input;
          return true;
        },
      } as never,
    });

    const response = await handlers.PATCH(
      new NextRequest("http://localhost/api/inventory/items/item-1", {
        method: "PATCH",
        headers: { cookie: "home_inventory_session=session-token" },
        body: JSON.stringify({
          householdId: "household-2",
          name: "牛奶",
          note: "",
          expireDate: null,
          locationId: null,
          photoKey: "photo_1.jpg",
        }),
      }),
      { params: Promise.resolve({ itemId: "item-1" }) },
    );

    expect(response.status).toBe(200);
    expect(attached).toEqual({
      userId: "user-1",
      itemId: "item-1",
      householdId: "household-2",
      photoKey: "photo_1.jpg",
    });
  });
});
