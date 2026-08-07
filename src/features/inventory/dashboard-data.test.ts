import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDashboardSummary,
  createDashboardHousehold,
  filterInventoryItems,
  filterInventoryLocations,
  getExpirationHighlights,
  getExpirationStatus,
  getLocationAreaFilterValue,
  isMissingAuthSessionError,
} from "./dashboard-data";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-07T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildDashboardSummary", () => {
  it("summarizes household, areas, locations, and items for the dashboard", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [
        { id: "area-1", name: "厨房", color: "#64748b" },
        { id: "area-2", name: "卧室", color: "#256f6b" },
      ],
      locations: [
        { id: "location-1", name: "上层抽屉", area_id: "area-1" },
        { id: "location-2", name: "药箱", area_id: "area-2" },
      ],
      items: [
        {
          id: "item-1",
          name: "电池",
          note: "",
          expire_date: null,
          location_id: "location-1",
        },
        {
          id: "item-2",
          name: "感冒药",
          note: "二层抽屉",
          expire_date: "2026-09-01",
          location_id: "location-2",
        },
      ],
    });

    expect(summary).toEqual({
      householdId: "household-1",
      householdName: "我的家庭",
      areaCount: 2,
      locationCount: 2,
      itemCount: 2,
      isEmpty: false,
      areas: [
        {
          id: "area-1",
          name: "厨房",
          color: "#64748b",
          locationCount: 1,
        },
        {
          id: "area-2",
          name: "卧室",
          color: "#256f6b",
          locationCount: 1,
        },
      ],
      locations: [
        {
          id: "location-1",
          name: "上层抽屉",
          areaId: "area-1",
          areaName: "厨房",
        },
        {
          id: "location-2",
          name: "药箱",
          areaId: "area-2",
          areaName: "卧室",
        },
      ],
      items: [
        {
          id: "item-1",
          name: "电池",
          note: "",
          expireDate: null,
          locationId: "location-1",
          locationName: "上层抽屉",
          areaId: "area-1",
          areaName: "厨房",
          expirationStatus: "none",
          photoKey: null,
        },
        {
          id: "item-2",
          name: "感冒药",
          note: "二层抽屉",
          expireDate: "2026-09-01",
          locationId: "location-2",
          locationName: "药箱",
          areaId: "area-2",
          areaName: "卧室",
          expirationStatus: "normal",
          photoKey: null,
        },
      ],
    });
  });

  it("marks a new household as empty", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [{ id: "area-1", name: "默认区域", color: "#64748b" }],
      locations: [],
      items: [],
    });

    expect(summary.isEmpty).toBe(true);
    expect(summary.itemCount).toBe(0);
    expect(summary.areaCount).toBe(1);
    expect(summary.locationCount).toBe(0);
    expect(summary.areas).toEqual([
      {
        id: "area-1",
        name: "默认区域",
        color: "#64748b",
        locationCount: 0,
      },
    ]);
    expect(summary.locations).toEqual([]);
    expect(summary.items).toEqual([]);
  });

  it("marks items without a location clearly", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [],
      locations: [],
      items: [
        {
          id: "item-1",
          name: "备用线",
          note: "",
          expire_date: null,
          location_id: null,
        },
      ],
    });

    expect(summary.items).toEqual([
      {
        id: "item-1",
        name: "备用线",
        note: "",
        expireDate: null,
        locationId: null,
        locationName: "未设置位置",
        areaId: null,
        areaName: "未分区",
        expirationStatus: "none",
        photoKey: null,
      },
    ]);
  });

  it("marks locations without an area clearly", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [],
      locations: [{ id: "location-1", name: "备用箱", area_id: null }],
      items: [
        {
          id: "item-1",
          name: "备用线",
          note: "",
          expire_date: null,
          location_id: "location-1",
        },
      ],
    });

    expect(summary.locations).toEqual([
      {
        id: "location-1",
        name: "备用箱",
        areaId: null,
        areaName: "未分区",
      },
    ]);
    expect(summary.items[0]).toMatchObject({
      locationName: "备用箱",
      areaId: null,
      areaName: "未分区",
    });
  });

  it("normalizes PostgreSQL timestamp date values for display and expiration grouping", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [],
      locations: [],
      items: [
        {
          id: "item-1",
          name: "牛奶",
          note: "",
          expire_date: "2026-07-31T16:00:00.000Z",
          location_id: null,
        },
      ],
    });

    expect(summary.items[0]).toMatchObject({
      expireDate: "2026-08-01",
      expirationStatus: "soon",
    });
  });

  it("keeps the selected local calendar day when PostgreSQL serializes dates as UTC timestamps", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [],
      locations: [],
      items: [
        {
          id: "item-1",
          name: "牛奶",
          note: "",
          expire_date: "2026-07-30T16:00:00.000Z",
          location_id: null,
        },
      ],
    });

    expect(summary.items[0]).toMatchObject({
      expireDate: "2026-07-31",
      expirationStatus: "soon",
    });
  });
});

describe("filterInventoryItems", () => {
  const items = [
    {
      id: "item-1",
      name: "感冒药",
      note: "二层抽屉",
      expireDate: "2026-07-20",
      locationId: "location-1",
      locationName: "药箱",
      areaId: "area-1",
      areaName: "卧室",
      expirationStatus: "soon" as const,
    },
    {
      id: "item-2",
      name: "电池",
      note: "遥控器备用",
      expireDate: null,
      locationId: "location-2",
      locationName: "上层抽屉",
      areaId: "area-2",
      areaName: "客厅",
      expirationStatus: "none" as const,
    },
  ];

  it("filters items by search keyword in name and note", () => {
    expect(
      filterInventoryItems(items, {
        search: "遥控器",
        areaId: "",
        locationId: "",
      }),
    ).toEqual([items[1]]);
  });

  it("filters items by area and location", () => {
    expect(
      filterInventoryItems(items, {
        search: "",
        areaId: "area-1",
        locationId: "location-1",
      }),
    ).toEqual([items[0]]);
  });
});

describe("filterInventoryLocations", () => {
  const locations = [
    {
      id: "location-1",
      name: "上层抽屉",
      areaId: "area-1",
      areaName: "厨房",
    },
    {
      id: "location-2",
      name: "药箱",
      areaId: "area-2",
      areaName: "卧室",
    },
    {
      id: "location-3",
      name: "备用箱",
      areaId: null,
      areaName: "未分区",
    },
  ];

  it("returns all locations when no area is selected", () => {
    expect(filterInventoryLocations(locations, "")).toEqual(locations);
  });

  it("returns only locations in the selected area", () => {
    expect(filterInventoryLocations(locations, "area-1")).toEqual([
      locations[0],
    ]);
  });

  it("returns unassigned locations when the unassigned filter is selected", () => {
    expect(filterInventoryLocations(locations, "__unassigned__")).toEqual([
      locations[2],
    ]);
  });
});

describe("getLocationAreaFilterValue", () => {
  const locations = [
    {
      id: "location-1",
      name: "上层抽屉",
      areaId: "area-1",
      areaName: "厨房",
    },
    {
      id: "location-2",
      name: "备用箱",
      areaId: null,
      areaName: "未分区",
    },
  ];

  it("returns the location area for an existing assigned location", () => {
    expect(getLocationAreaFilterValue(locations, "location-1")).toBe("area-1");
  });

  it("returns the unassigned filter value for an existing unassigned location", () => {
    expect(getLocationAreaFilterValue(locations, "location-2")).toBe(
      "__unassigned__",
    );
  });

  it("returns an empty value when no location is selected", () => {
    expect(getLocationAreaFilterValue(locations, null)).toBe("");
  });
});

describe("getExpirationHighlights", () => {
  it("groups expired and soon-expiring items by nearest expire date", () => {
    const items = [
      {
        id: "item-normal",
        name: "米",
        note: "",
        expireDate: "2026-09-01",
        locationId: "location-1",
        locationName: "上层柜",
        areaId: "area-1",
        areaName: "厨房",
        expirationStatus: "normal" as const,
      },
      {
        id: "item-soon-later",
        name: "感冒药",
        note: "",
        expireDate: "2026-07-20",
        locationId: "location-2",
        locationName: "药箱",
        areaId: "area-2",
        areaName: "卧室",
        expirationStatus: "soon" as const,
      },
      {
        id: "item-expired",
        name: "创可贴",
        note: "",
        expireDate: "2026-06-30",
        locationId: "location-2",
        locationName: "药箱",
        areaId: "area-2",
        areaName: "卧室",
        expirationStatus: "expired" as const,
      },
      {
        id: "item-soon-nearer",
        name: "牛奶",
        note: "",
        expireDate: "2026-07-05",
        locationId: "location-3",
        locationName: "冰箱",
        areaId: "area-1",
        areaName: "厨房",
        expirationStatus: "soon" as const,
      },
    ];

    expect(getExpirationHighlights(items)).toEqual({
      soonItems: [items[3], items[1]],
      expiredItems: [items[2]],
    });
  });
});

describe("getExpirationStatus", () => {
  it("classifies empty, expired, soon, and normal dates", () => {
    expect(getExpirationStatus(null, new Date("2026-07-03T00:00:00"))).toBe(
      "none",
    );
    expect(
      getExpirationStatus("2026-07-02", new Date("2026-07-03T00:00:00")),
    ).toBe("expired");
    expect(
      getExpirationStatus("2026-07-20", new Date("2026-07-03T00:00:00")),
    ).toBe("soon");
    expect(
      getExpirationStatus("2026-09-01", new Date("2026-07-03T00:00:00")),
    ).toBe("normal");
  });

  it("classifies ISO timestamp dates by their calendar day", () => {
    expect(
      getExpirationStatus(
        "2026-07-31T16:00:00.000Z",
        new Date("2026-07-03T00:00:00"),
      ),
    ).toBe("soon");
  });
});

describe("isMissingAuthSessionError", () => {
  it("detects Supabase's missing session auth error", () => {
    expect(isMissingAuthSessionError({ message: "Auth session missing!" })).toBe(
      true,
    );
  });

  it("does not treat other errors as missing sessions", () => {
    expect(isMissingAuthSessionError({ message: "permission denied" })).toBe(
      false,
    );
  });
});

describe("createDashboardHousehold", () => {
  it("uses the returned household row when it is available", () => {
    expect(
      createDashboardHousehold("household-1", {
        id: "household-1",
        name: "我的家庭",
      }),
    ).toEqual({ id: "household-1", name: "我的家庭" });
  });

  it("falls back when the household row is not visible yet", () => {
    expect(createDashboardHousehold("household-1", null)).toEqual({
      id: "household-1",
      name: "我的家庭",
    });
  });
});
