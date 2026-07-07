import { describe, expect, it } from "vitest";

import { createSelfHostedInventoryClient } from "./self-hosted-inventory-client";

describe("createSelfHostedInventoryClient", () => {
  it("loads dashboard data from the self-hosted inventory API", async () => {
    const requests: unknown[] = [];
    const client = createSelfHostedInventoryClient({
      fetch: async (input, init) => {
        requests.push({ input, init });
        return jsonResponse({
          ok: true,
          data: {
            household: { id: "household-1", name: "Home" },
            areas: [],
            locations: [],
            items: [],
          },
        });
      },
    });

    await expect(client.getDashboard()).resolves.toEqual({
      household: { id: "household-1", name: "Home" },
      areas: [],
      locations: [],
      items: [],
    });
    expect(requests).toEqual([
      {
        input: "/api/inventory/dashboard",
        init: { method: "GET" },
      },
    ]);
  });

  it("creates, updates, and deletes inventory through self-hosted API routes", async () => {
    const requests: unknown[] = [];
    const client = createSelfHostedInventoryClient({
      fetch: async (input, init) => {
        requests.push({
          input,
          init: {
            ...init,
            body:
              typeof init?.body === "string"
                ? JSON.parse(init.body)
                : init?.body,
          },
        });
        return jsonResponse({ ok: true, data: null });
      },
    });

    await client.createArea({ name: "Kitchen", color: "#256f6b" });
    await client.updateArea({
      areaId: "area-1",
      name: "Pantry",
      color: "#64748b",
    });
    await client.deleteArea({ areaId: "area-1" });
    await client.createLocation({ name: "Shelf", areaId: "area-1" });
    await client.updateLocation({
      locationId: "location-1",
      name: "Drawer",
      areaId: null,
    });
    await client.deleteLocation({ locationId: "location-1" });
    await client.createItem({
      name: "Battery",
      note: "",
      expireDate: null,
      locationId: "location-1",
    });
    await client.updateItem({
      itemId: "item-1",
      name: "Battery pack",
      note: "fresh",
      expireDate: "2027-01-02",
      locationId: null,
    });
    await client.deleteItem({ itemId: "item-1" });

    expect(requests).toEqual([
      post("/api/inventory/areas", {
        name: "Kitchen",
        color: "#256f6b",
      }),
      patch("/api/inventory/areas/area-1", {
        name: "Pantry",
        color: "#64748b",
      }),
      del("/api/inventory/areas/area-1"),
      post("/api/inventory/locations", { name: "Shelf", areaId: "area-1" }),
      patch("/api/inventory/locations/location-1", {
        name: "Drawer",
        areaId: null,
      }),
      del("/api/inventory/locations/location-1"),
      post("/api/inventory/items", {
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "location-1",
      }),
      patch("/api/inventory/items/item-1", {
        name: "Battery pack",
        note: "fresh",
        expireDate: "2027-01-02",
        locationId: null,
      }),
      del("/api/inventory/items/item-1"),
    ]);
  });

  it("throws API error messages", async () => {
    const client = createSelfHostedInventoryClient({
      fetch: async () =>
        jsonResponse(
          { ok: false, message: "Selected item does not belong to current user" },
          403,
        ),
    });

    await expect(client.deleteItem({ itemId: "foreign-item" })).rejects.toThrow(
      "Selected item does not belong to current user",
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function post(input: string, body: unknown) {
  return {
    input,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  };
}

function patch(input: string, body: unknown) {
  return {
    input,
    init: {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    },
  };
}

function del(input: string) {
  return {
    input,
    init: {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    },
  };
}
