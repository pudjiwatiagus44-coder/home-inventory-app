import { describe, expect, it } from "vitest";
import {
  buildDashboardSummary,
  createDashboardHousehold,
  isMissingAuthSessionError,
} from "./dashboard-data";

describe("buildDashboardSummary", () => {
  it("summarizes household, areas, and items for the dashboard", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [
        { id: "area-1", name: "厨房", color: "#64748b" },
        { id: "area-2", name: "卧室", color: "#256f6b" },
      ],
      items: [
        { id: "item-1", name: "电池", note: "", expire_date: null },
        { id: "item-2", name: "感冒药", note: "二层抽屉", expire_date: "2026-09-01" },
      ],
    });

    expect(summary).toEqual({
      householdId: "household-1",
      householdName: "我的家庭",
      areaCount: 2,
      itemCount: 2,
      isEmpty: false,
      recentItems: [
        { id: "item-1", name: "电池", note: "", expireDate: null },
        { id: "item-2", name: "感冒药", note: "二层抽屉", expireDate: "2026-09-01" },
      ],
    });
  });

  it("marks a new household as empty", () => {
    const summary = buildDashboardSummary({
      household: { id: "household-1", name: "我的家庭" },
      areas: [{ id: "area-1", name: "默认区域", color: "#64748b" }],
      items: [],
    });

    expect(summary.isEmpty).toBe(true);
    expect(summary.itemCount).toBe(0);
    expect(summary.areaCount).toBe(1);
    expect(summary.recentItems).toEqual([]);
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
