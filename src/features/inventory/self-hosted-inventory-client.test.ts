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

  it("forwards the selected householdId on self-hosted writes", async () => {
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
                : init?.body instanceof FormData
                  ? "form-data"
                  : init?.body,
          },
        });
        return jsonResponse({ ok: true, data: null });
      },
    });

    await client.createArea({
      householdId: "household-2",
      name: "Kitchen",
      color: "#256f6b",
    });
    await client.updateArea({
      householdId: "household-2",
      areaId: "area-1",
      name: "Pantry",
      color: "#64748b",
    });
    await client.deleteArea({ householdId: "household-2", areaId: "area-1" });
    await client.createLocation({
      householdId: "household-2",
      name: "Shelf",
      areaId: null,
    });
    await client.updateLocation({
      householdId: "household-2",
      locationId: "location-1",
      name: "Drawer",
      areaId: null,
    });
    await client.deleteLocation({
      householdId: "household-2",
      locationId: "location-1",
    });
    await client.createItem({
      householdId: "household-2",
      name: "Battery",
      note: "",
      expireDate: null,
      locationId: "location-1",
    });
    await client.updateItem({
      householdId: "household-2",
      itemId: "item-1",
      name: "Battery pack",
      note: "fresh",
      expireDate: null,
      locationId: null,
    });
    await client.deleteItem({ householdId: "household-2", itemId: "item-1" });

    expect(requests).toEqual([
      post("/api/inventory/areas", {
        householdId: "household-2",
        name: "Kitchen",
        color: "#256f6b",
      }),
      patch("/api/inventory/areas/area-1", {
        householdId: "household-2",
        name: "Pantry",
        color: "#64748b",
      }),
      del("/api/inventory/areas/area-1?householdId=household-2"),
      post("/api/inventory/locations", {
        householdId: "household-2",
        name: "Shelf",
        areaId: null,
      }),
      patch("/api/inventory/locations/location-1", {
        householdId: "household-2",
        name: "Drawer",
        areaId: null,
      }),
      del("/api/inventory/locations/location-1?householdId=household-2"),
      post("/api/inventory/items", {
        householdId: "household-2",
        name: "Battery",
        note: "",
        expireDate: null,
        locationId: "location-1",
      }),
      patch("/api/inventory/items/item-1", {
        householdId: "household-2",
        name: "Battery pack",
        note: "fresh",
        expireDate: null,
        locationId: null,
      }),
      del("/api/inventory/items/item-1?householdId=household-2"),
    ]);
  });

  it("uploads, deletes, and reads area and location photos", async () => {
    const requests: unknown[] = [];
    const client = createSelfHostedInventoryClient({
      fetch: async (input, init) => {
        requests.push({
          input,
          init: {
            ...init,
            body: init?.body instanceof FormData ? "form-data" : init?.body,
          },
        });
        if (!init?.method || init.method === "GET") {
          return new Response(new Blob(["jpeg-bytes"]), {
            status: 200,
            headers: { "content-type": "image/jpeg" },
          });
        }
        if (init?.method === "PUT") {
          return jsonResponse({ ok: true, data: { photoKey: "area_1.jpg" } });
        }
        return jsonResponse({ ok: true, data: null });
      },
    });
    const file = new File(["jpeg-bytes"], "photo.jpg");

    await client.uploadAreaPhoto("area-1", file);
    await client.deleteAreaPhoto("area-1");
    await client.uploadLocationPhoto("location-1", file);
    await client.deleteLocationPhoto("location-1");
    const areaBlob = await client.getAreaPhoto("area-1");
    const locationBlob = await client.getLocationPhoto("location-1");

    expect(requests.map((entry) => entry.input)).toEqual([
      "/api/inventory/areas/area-1/photo",
      "/api/inventory/areas/area-1/photo",
      "/api/inventory/locations/location-1/photo",
      "/api/inventory/locations/location-1/photo",
      "/api/inventory/areas/area-1/photo",
      "/api/inventory/locations/location-1/photo",
    ]);
    expect(requests.slice(0, 4).map((entry) => entry.init.method)).toEqual([
      "PUT",
      "DELETE",
      "PUT",
      "DELETE",
    ]);
    expect(requests[0].init.body).toBe("form-data");
    expect(await areaBlob.text()).toBe("jpeg-bytes");
    expect(await locationBlob.text()).toBe("jpeg-bytes");
  });

  it("previews and commits Excel imports through self-hosted API routes", async () => {
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
                : init?.body instanceof FormData
                  ? "form-data"
                  : init?.body,
          },
        });

        if (String(input).includes("mode=preview")) {
          return jsonResponse({
            ok: true,
            data: {
              rows: [],
              creates: [],
              skipped: [],
              conflicts: [],
              errors: [],
            },
          });
        }

        return jsonResponse({
          ok: true,
          data: {
            createdAreas: 0,
            createdLocations: 0,
            createdItems: 0,
            keptConflictItems: 0,
            overwrittenItems: 1,
            skippedItems: 0,
            errors: [],
          },
        });
      },
    });
    const file = new File(["content"], "items.xlsx");

    await client.previewImport(file);
    await client.commitImport({
      rows: [
        {
          index: 2,
          name: "Battery",
          locationName: "A1",
          areaName: "A",
          note: "fresh",
          expireDate: "2028-02-03",
        },
      ],
      conflictResolutions: { "2:item-1": "overwrite" },
    });

    expect(requests).toEqual([
      {
        input: "/api/inventory/import?mode=preview",
        init: {
          method: "POST",
          body: "form-data",
        },
      },
      {
        input: "/api/inventory/import?mode=commit",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: {
            rows: [
              {
                index: 2,
                name: "Battery",
                locationName: "A1",
                areaName: "A",
                note: "fresh",
                expireDate: "2028-02-03",
              },
            ],
            conflictResolutions: { "2:item-1": "overwrite" },
          },
        },
      },
    ]);
  });

  it("previews and commits Excel imports for the selected household", async () => {
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
                : init?.body instanceof FormData
                  ? "form-data"
                  : init?.body,
          },
        });

        if (String(input).includes("mode=preview")) {
          return jsonResponse({
            ok: true,
            data: {
              rows: [],
              creates: [],
              skipped: [],
              conflicts: [],
              errors: [],
            },
          });
        }

        return jsonResponse({
          ok: true,
          data: {
            createdAreas: 0,
            createdLocations: 0,
            createdItems: 0,
            keptConflictItems: 0,
            overwrittenItems: 0,
            skippedItems: 0,
            errors: [],
          },
        });
      },
    });
    const file = new File(["content"], "items.xlsx");

    await client.previewImport(file, "household-2");
    await client.commitImport({
      householdId: "household-2",
      rows: [],
      conflictResolutions: {},
    });

    expect(requests).toEqual([
      {
        input: "/api/inventory/import?mode=preview&householdId=household-2",
        init: {
          method: "POST",
          body: "form-data",
        },
      },
      {
        input: "/api/inventory/import?mode=commit",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: {
            householdId: "household-2",
            rows: [],
            conflictResolutions: {},
          },
        },
      },
    ]);
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
