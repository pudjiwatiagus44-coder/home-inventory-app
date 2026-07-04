import { describe, expect, it } from "vitest";
import {
  createInventoryArea,
  createInventoryItem,
  createInventoryLocation,
  deleteInventoryArea,
  deleteInventoryItem,
  updateInventoryArea,
  updateInventoryItem,
  updateInventoryLocation,
  validateAreaInput,
  validateInventoryItemInput,
  validateLocationInput,
} from "./inventory-actions";

describe("validateAreaInput", () => {
  it("requires a non-empty area name", () => {
    expect(validateAreaInput({ name: "  " })).toEqual({
      isValid: false,
      error: "请输入区域名称",
    });
  });

  it("accepts a trimmed area name", () => {
    expect(validateAreaInput({ name: "  厨房  ", color: "#256f6b" })).toEqual({
      isValid: true,
      value: { name: "厨房", color: "#256f6b" },
    });
  });

  it("rejects invalid area colors", () => {
    expect(validateAreaInput({ name: "厨房", color: "teal" })).toEqual({
      isValid: false,
      error: "请选择有效的区域颜色",
    });
  });
});

describe("validateLocationInput", () => {
  it("requires a non-empty location name", () => {
    expect(validateLocationInput({ name: "  " })).toEqual({
      isValid: false,
      error: "请输入位置名称",
    });
  });

  it("accepts a trimmed location name", () => {
    expect(validateLocationInput({ name: "  上层抽屉  " })).toEqual({
      isValid: true,
      value: { name: "上层抽屉", areaId: null },
    });
  });
});

describe("validateInventoryItemInput", () => {
  it("requires a non-empty item name", () => {
    expect(
      validateInventoryItemInput({
        name: "",
        locationId: "location-1",
        note: "",
        expireDate: "",
      }),
    ).toEqual({
      isValid: false,
      error: "请输入物品名称",
    });
  });

  it("trims text fields and normalizes empty optional fields", () => {
    expect(
      validateInventoryItemInput({
        name: "  感冒药  ",
        locationId: "",
        note: "  二层抽屉  ",
        expireDate: "",
      }),
    ).toEqual({
      isValid: true,
      value: {
        name: "感冒药",
        locationId: null,
        note: "二层抽屉",
        expireDate: null,
      },
    });
  });
});

describe("createInventoryLocation", () => {
  it("inserts a location for the current household and area", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push([table, payload]);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "location-1", name: "上层抽屉" },
                error: null,
              }),
            }),
          };
        },
      }),
    };

    await expect(
      createInventoryLocation(supabase, {
        householdId: "household-1",
        areaId: "area-1",
        name: " 上层抽屉 ",
      }),
    ).resolves.toEqual({ id: "location-1", name: "上层抽屉" });

    expect(inserts).toEqual([
      [
        "locations",
        {
          household_id: "household-1",
          area_id: "area-1",
          name: "上层抽屉",
        },
      ],
    ]);
  });
});

describe("updateInventoryLocation", () => {
  it("updates a location name and area in the current household", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        update: (payload: unknown) => {
          updates.push([table, payload]);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: "location-1", name: "下层抽屉" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    };

    await expect(
      updateInventoryLocation(supabase, {
        householdId: "household-1",
        locationId: "location-1",
        areaId: "area-2",
        name: " 下层抽屉 ",
      }),
    ).resolves.toEqual({ id: "location-1", name: "下层抽屉" });

    expect(updates).toEqual([
      [
        "locations",
        {
          area_id: "area-2",
          name: "下层抽屉",
        },
      ],
    ]);
  });

  it("can move a location back to no area", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        update: (payload: unknown) => {
          updates.push([table, payload]);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: "location-1", name: "备用箱" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    };

    await expect(
      updateInventoryLocation(supabase, {
        householdId: "household-1",
        locationId: "location-1",
        areaId: "",
        name: "备用箱",
      }),
    ).resolves.toEqual({ id: "location-1", name: "备用箱" });

    expect(updates).toEqual([
      [
        "locations",
        {
          area_id: null,
          name: "备用箱",
        },
      ],
    ]);
  });
});

describe("createInventoryArea", () => {
  it("inserts an area for the current household", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push([table, payload]);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "area-1", name: "厨房", color: "#64748b" },
                error: null,
              }),
            }),
          };
        },
      }),
    };

    await expect(
      createInventoryArea(supabase, {
        householdId: "household-1",
        name: " 厨房 ",
        color: "#256f6b",
      }),
    ).resolves.toEqual({ id: "area-1", name: "厨房", color: "#64748b" });

    expect(inserts).toEqual([
      [
        "areas",
        {
          household_id: "household-1",
          name: "厨房",
          color: "#256f6b",
        },
      ],
    ]);
  });
});

describe("updateInventoryArea", () => {
  it("updates an area name and color", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        update: (payload: unknown) => {
          updates.push([table, payload]);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: "area-1", name: "厨房柜子", color: "#7c3aed" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    };

    await expect(
      updateInventoryArea(supabase, {
        householdId: "household-1",
        areaId: "area-1",
        name: " 厨房柜子 ",
        color: "#7c3aed",
      }),
    ).resolves.toEqual({ id: "area-1", name: "厨房柜子", color: "#7c3aed" });

    expect(updates).toEqual([
      [
        "areas",
        {
          name: "厨房柜子",
          color: "#7c3aed",
        },
      ],
    ]);
  });
});

describe("deleteInventoryArea", () => {
  it("deletes an area in the current household", async () => {
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

    await expect(
      deleteInventoryArea(supabase, {
        householdId: "household-1",
        areaId: "area-1",
      }),
    ).resolves.toBeUndefined();

    expect(deletes).toEqual(["areas"]);
  });
});

describe("createInventoryItem", () => {
  it("inserts an item for the current household", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push([table, payload]);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "item-1",
                  name: "感冒药",
                  note: "二层抽屉",
                  expire_date: "2026-09-01",
                  location_id: "location-1",
                },
                error: null,
              }),
            }),
          };
        },
      }),
    };

    await expect(
      createInventoryItem(supabase, {
        householdId: "household-1",
        createdBy: "user-1",
        name: " 感冒药 ",
        locationId: "location-1",
        note: " 二层抽屉 ",
        expireDate: "2026-09-01",
      }),
    ).resolves.toEqual({
      id: "item-1",
      name: "感冒药",
      note: "二层抽屉",
      expire_date: "2026-09-01",
      location_id: "location-1",
    });

    expect(inserts).toEqual([
      [
        "items",
        {
          household_id: "household-1",
          location_id: "location-1",
          name: "感冒药",
          note: "二层抽屉",
          expire_date: "2026-09-01",
          created_by: "user-1",
        },
      ],
    ]);
  });

  it("throws Supabase insert errors", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: "new row violates row-level security policy" },
            }),
          }),
        }),
      }),
    };

    await expect(
      createInventoryItem(supabase, {
        householdId: "household-1",
        name: "感冒药",
        locationId: null,
        note: "",
        expireDate: null,
      }),
    ).rejects.toThrow("new row violates row-level security policy");
  });
});

describe("updateInventoryItem", () => {
  it("updates an item for the current household", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => ({
        update: (payload: unknown) => {
          updates.push([table, payload]);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "item-1",
                      name: "退烧药",
                      note: "儿童药箱",
                      expire_date: null,
                      location_id: "location-2",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    };

    await expect(
      updateInventoryItem(supabase, {
        householdId: "household-1",
        itemId: "item-1",
        name: " 退烧药 ",
        locationId: "location-2",
        note: " 儿童药箱 ",
        expireDate: "",
      }),
    ).resolves.toEqual({
      id: "item-1",
      name: "退烧药",
      note: "儿童药箱",
      expire_date: null,
      location_id: "location-2",
    });

    expect(updates).toEqual([
      [
        "items",
        {
          location_id: "location-2",
          name: "退烧药",
          note: "儿童药箱",
          expire_date: null,
        },
      ],
    ]);
  });
});

describe("deleteInventoryItem", () => {
  it("deletes an item in the current household", async () => {
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

    await expect(
      deleteInventoryItem(supabase, {
        householdId: "household-1",
        itemId: "item-1",
      }),
    ).resolves.toBeUndefined();

    expect(deletes).toEqual(["items"]);
  });
});
