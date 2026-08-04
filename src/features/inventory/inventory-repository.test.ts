import { describe, expect, it } from "vitest";
import type { InventoryActionClient } from "./inventory-actions";
import {
  createPostgresInventoryRepository,
  createSupabaseInventoryRepository,
} from "./inventory-repository";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";

type PostgresMockResult = { rows: unknown[] };

function createInventoryActionClientMock(
  client: unknown,
): InventoryActionClient {
  return client as InventoryActionClient;
}

function createPostgresQueryClientMock(client: {
  query: (text: string, values?: unknown[]) => Promise<PostgresMockResult>;
}): PostgresQueryClient {
  return {
    query: async <Row>(text: string, values?: unknown[]) => {
      const result = await client.query(text, values);

      return { rows: result.rows as Row[] };
    },
  };
}

function createTypedPostgresInventoryRepository(client: {
  query: (text: string, values?: unknown[]) => Promise<PostgresMockResult>;
}) {
  return createPostgresInventoryRepository(
    createPostgresQueryClientMock(client),
  );
}

describe("createSupabaseInventoryRepository", () => {
  it("creates locations through the current Supabase adapter", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push([table, payload]);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "location-1", name: "药箱" },
                error: null,
              }),
            }),
          };
        },
      }),
    };

    const repository = createSupabaseInventoryRepository(
      createInventoryActionClientMock(supabase),
    );

    await expect(
      repository.createLocation({
        householdId: "household-1",
        areaId: null,
        name: " 药箱 ",
      }),
    ).resolves.toEqual({ id: "location-1", name: "药箱" });

    expect(inserts).toEqual([
      [
        "locations",
        {
          household_id: "household-1",
          area_id: null,
          name: "药箱",
        },
      ],
    ]);
  });

  it("deletes items through the current Supabase adapter", async () => {
    const deletes: string[] = [];
    const supabase = {
      from: (table: string) => ({
        delete: () => {
          deletes.push(table);
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        },
      }),
    };

    const repository = createSupabaseInventoryRepository(
      createInventoryActionClientMock(supabase),
    );

    await expect(
      repository.deleteItem({
        householdId: "household-1",
        itemId: "item-1",
      }),
    ).resolves.toBeUndefined();

    expect(deletes).toEqual(["items"]);
  });
});

describe("createPostgresInventoryRepository", () => {
  it("exposes the inventory repository contract without opening a database connection", async () => {
    const repository = createPostgresInventoryRepository();

    await expect(repository.getDashboardForUser("user-1")).rejects.toThrow(
      "PostgreSQL inventory repository is not connected yet",
    );
    await expect(
      repository.createLocation({
        householdId: "household-1",
        areaId: null,
        name: "Kitchen",
      }),
    ).rejects.toThrow("PostgreSQL inventory repository is not connected yet");
    await expect(
      repository.updateItem({
        householdId: "household-1",
        itemId: "item-1",
        locationId: null,
        name: "Battery",
        note: "",
        expireDate: null,
      }),
    ).rejects.toThrow("PostgreSQL inventory repository is not connected yet");
    await expect(
      repository.deleteItem({
        householdId: "household-1",
        itemId: "item-1",
      }),
    ).rejects.toThrow("PostgreSQL inventory repository is not connected yet");
  });

  it("loads dashboard data for the current user's default household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const results = [
      { rows: [{ id: "household-1", name: "我的家" }] },
      { rows: [{ id: "area-1", name: "厨房", color: "#256f6b" }] },
      { rows: [{ id: "location-1", name: "上层抽屉", area_id: "area-1" }] },
      {
        rows: [
          {
            id: "item-1",
            name: "电池",
            note: "",
            expire_date: null,
            location_id: "location-1",
          },
        ],
      },
    ];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return results.shift() ?? { rows: [] };
      },
    });

    await expect(repository.getDashboardForUser("user-1")).resolves.toEqual({
      household: { id: "household-1", name: "我的家" },
      areas: [{ id: "area-1", name: "厨房", color: "#256f6b" }],
      locations: [{ id: "location-1", name: "上层抽屉", area_id: "area-1" }],
      items: [
        {
          id: "item-1",
          name: "电池",
          note: "",
          expire_date: null,
          location_id: "location-1",
        },
      ],
    });

    expect(calls).toEqual([
      {
        text: expect.stringContaining("from household_members"),
        values: ["user-1"],
      },
      {
        text: expect.stringContaining("from areas"),
        values: ["household-1"],
      },
      {
        text: expect.stringContaining("from locations"),
        values: ["household-1"],
      },
      {
        text: expect.stringContaining("from items"),
        values: ["household-1"],
      },
    ]);
    expect(calls[0].text).toContain("join households");
  });

  it("loads dashboard update versions for conflict checks", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const results = [
      { rows: [{ id: "household-1", name: "Home" }] },
      {
        rows: [
          {
            id: "area-1",
            name: "Kitchen",
            color: "#256f6b",
            updatedAt: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
      {
        rows: [
          {
            id: "location-1",
            name: "Shelf",
            area_id: "area-1",
            updatedAt: "2026-08-01T10:01:00.000Z",
          },
        ],
      },
      {
        rows: [
          {
            id: "item-1",
            name: "Battery",
            note: "",
            expire_date: null,
            location_id: "location-1",
            updatedAt: "2026-08-01T10:02:00.000Z",
          },
        ],
      },
    ];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return results.shift() ?? { rows: [] };
      },
    });

    await expect(repository.getDashboardForUser("user-1")).resolves.toEqual({
      household: { id: "household-1", name: "Home" },
      areas: [
        {
          id: "area-1",
          name: "Kitchen",
          color: "#256f6b",
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      ],
      locations: [
        {
          id: "location-1",
          name: "Shelf",
          area_id: "area-1",
          updatedAt: "2026-08-01T10:01:00.000Z",
        },
      ],
      items: [
        {
          id: "item-1",
          name: "Battery",
          note: "",
          expire_date: null,
          location_id: "location-1",
          updatedAt: "2026-08-01T10:02:00.000Z",
        },
      ],
    });
    expect(calls[1].text).toContain('updated_at as "updatedAt"');
    expect(calls[2].text).toContain('updated_at as "updatedAt"');
    expect(calls[3].text).toContain('updated_at as "updatedAt"');
  });

  it("returns null when the current user has no household membership", async () => {
    const repository = createTypedPostgresInventoryRepository({
      query: async () => ({ rows: [] }),
    });

    await expect(repository.getDashboardForUser("missing-user")).resolves.toBe(
      null,
    );
  });

  it("creates an area scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return {
          rows: [{ id: "area-1", name: "Kitchen", color: "#256f6b" }],
        };
      },
    });

    await expect(
      repository.createArea({
        householdId: "household-1",
        name: " Kitchen ",
        color: "#256f6b",
      }),
    ).resolves.toEqual({
      id: "area-1",
      name: "Kitchen",
      color: "#256f6b",
    });

    expect(calls).toEqual([
      {
        text: expect.stringContaining("insert into areas"),
        values: ["household-1", "Kitchen", "#256f6b"],
      },
    ]);
  });

  it("creates a location scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [{ id: "location-1", name: "上层抽屉" }] };
      },
    });

    await expect(
      repository.createLocation({
        householdId: "household-1",
        name: " 上层抽屉 ",
        areaId: "area-1",
      }),
    ).resolves.toEqual({ id: "location-1", name: "上层抽屉" });

    expect(calls).toEqual([
      {
        text: expect.stringContaining("insert into locations"),
        values: ["household-1", "area-1", "上层抽屉"],
      },
    ]);
  });

  it("updates an area scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return {
          rows: [{ id: "area-1", name: "Kitchen", color: "#256f6b" }],
        };
      },
    });

    await expect(
      repository.updateArea({
        householdId: "household-1",
        areaId: "area-1",
        name: " Kitchen ",
        color: "#256f6b",
      }),
    ).resolves.toEqual({
      id: "area-1",
      name: "Kitchen",
      color: "#256f6b",
    });

    expect(calls).toEqual([
      {
        text: expect.stringContaining("update areas"),
        values: ["area-1", "household-1", "Kitchen", "#256f6b"],
      },
    ]);
    expect(calls[0].text).toContain("where id = $1");
    expect(calls[0].text).toContain("household_id = $2");
  });

  it("deletes an area scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [] };
      },
    });

    await expect(
      repository.deleteArea({
        householdId: "household-1",
        areaId: "area-1",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      {
        text: expect.stringContaining("delete from areas"),
        values: ["area-1", "household-1"],
      },
    ]);
    expect(calls[0].text).toContain("where id = $1");
    expect(calls[0].text).toContain("household_id = $2");
  });

  it("updates a location scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [{ id: "location-1", name: "Pantry" }] };
      },
    });

    await expect(
      repository.updateLocation({
        householdId: "household-1",
        locationId: "location-1",
        name: " Pantry ",
        areaId: "area-1",
      }),
    ).resolves.toEqual({ id: "location-1", name: "Pantry" });

    expect(calls).toEqual([
      {
        text: expect.stringContaining("update locations"),
        values: ["location-1", "household-1", "area-1", "Pantry"],
      },
    ]);
    expect(calls[0].text).toContain("where id = $1");
    expect(calls[0].text).toContain("household_id = $2");
  });

  it("deletes a location scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [] };
      },
    });

    await expect(
      repository.deleteLocation({
        householdId: "household-1",
        locationId: "location-1",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      {
        text: expect.stringContaining("delete from locations"),
        values: ["location-1", "household-1"],
      },
    ]);
    expect(calls[0].text).toContain("where id = $1");
    expect(calls[0].text).toContain("household_id = $2");
  });

  it("creates an item scoped to a resolved household and creator", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return {
          rows: [
            {
              id: "item-1",
              name: "Battery",
              note: "Spare",
              expire_date: "2027-01-02",
              location_id: "location-1",
            },
          ],
        };
      },
    });

    await expect(
      repository.createItem({
        householdId: "household-1",
        createdBy: "user-1",
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

    expect(calls).toEqual([
      {
        text: expect.stringContaining("insert into items"),
        values: [
          "household-1",
          "location-1",
          "Battery",
          "Spare",
          "2027-01-02",
          "user-1",
        ],
      },
    ]);
  });

  it("updates an item scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return {
          rows: [
            {
              id: "item-1",
              name: "Battery pack",
              note: "Fresh",
              expire_date: "2028-02-03",
              location_id: "location-1",
            },
          ],
        };
      },
    });

    await expect(
      repository.updateItem({
        householdId: "household-1",
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

    expect(calls).toEqual([
      {
        text: expect.stringContaining("update items"),
        values: [
          "item-1",
          "household-1",
          "location-1",
          "Battery pack",
          "Fresh",
          "2028-02-03",
        ],
      },
    ]);
    expect(calls[0].text).toContain("where id = $1");
    expect(calls[0].text).toContain("household_id = $2");
  });

  it("deletes an item scoped to a resolved household", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const repository = createTypedPostgresInventoryRepository({
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [] };
      },
    });

    await expect(
      repository.deleteItem({
        householdId: "household-1",
        itemId: "item-1",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      {
        text: expect.stringContaining("delete from items"),
        values: ["item-1", "household-1"],
      },
    ]);
    expect(calls[0].text).toContain("where id = $1");
    expect(calls[0].text).toContain("household_id = $2");
  });
});
