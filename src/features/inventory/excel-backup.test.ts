import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildInventoryBackupRows,
  generateInventoryBackupFilename,
  generateInventoryBackupWorkbook,
  INVENTORY_BACKUP_HEADERS,
  INVENTORY_BACKUP_SHEET_NAME,
  parseInventoryBackupRows,
  planInventoryImport,
} from "./excel-backup";
import type { DashboardData } from "./dashboard-data";

describe("excel backup format", () => {
  it("exports the reference sheet name and headers", () => {
    const workbook = generateInventoryBackupWorkbook(dashboard);
    const sheet = workbook.Sheets[INVENTORY_BACKUP_SHEET_NAME];

    expect(workbook.SheetNames[0]).toBe("物品清单");
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual([
      "序号",
      "名称",
      "格子编号",
      "所在区域",
      "备注",
      "有效期",
    ]);
    expect(INVENTORY_BACKUP_HEADERS).toEqual([
      "序号",
      "名称",
      "格子编号",
      "所在区域",
      "备注",
      "有效期",
    ]);
  });

  it("builds rows with area and location names from dashboard data", () => {
    expect(buildInventoryBackupRows(dashboard)).toEqual([
      {
        index: 1,
        name: "电池",
        locationName: "A1",
        areaName: "A 区",
        note: "五号",
        expireDate: "2027-01-02",
      },
    ]);
  });

  it("uses the reference filename pattern", () => {
    expect(generateInventoryBackupFilename(new Date("2026-08-04T09:08:07"))).toBe(
      "物品清单_2026-08-04_09-08-07.xlsx",
    );
  });
});

describe("parseInventoryBackupRows", () => {
  it("parses reference rows and common date formats", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      INVENTORY_BACKUP_HEADERS,
      [1, "药片", "E1", "E 区", "抗过敏", "2027-05-01"],
      [2, "调料", "B9", "B 区", "", "2027/9/1"],
      [3, "空白日期", "A1", "A 区", "", ""],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, INVENTORY_BACKUP_SHEET_NAME);
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    expect(parseInventoryBackupRows(buffer).rows).toEqual([
      {
        index: 1,
        name: "药片",
        locationName: "E1",
        areaName: "E 区",
        note: "抗过敏",
        expireDate: "2027-05-01",
      },
      {
        index: 2,
        name: "调料",
        locationName: "B9",
        areaName: "B 区",
        note: "",
        expireDate: "2027-09-01",
      },
      {
        index: 3,
        name: "空白日期",
        locationName: "A1",
        areaName: "A 区",
        note: "",
        expireDate: null,
      },
    ]);
  });

  it("defaults month-only dates to the first day of that month", () => {
    const plan = planInventoryImport({
      dashboard,
      rows: [
        {
          index: 258,
          name: "滴眼液",
          locationName: "B4",
          areaName: "B 区",
          note: "",
          expireDate: "2028-10",
        },
      ],
    });

    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual([
      {
        row: {
          index: 258,
          name: "滴眼液",
          locationName: "B4",
          areaName: "B 区",
          note: "",
          expireDate: "2028-10-01",
        },
      },
    ]);
  });
});

describe("planInventoryImport", () => {
  it("skips identical duplicates, reports changed duplicates as conflicts, and creates new rows", () => {
    const plan = planInventoryImport({
      dashboard,
      rows: [
        {
          index: 10,
          name: "电池",
          locationName: "A1",
          areaName: "A 区",
          note: "五号",
          expireDate: "2027-01-02",
        },
        {
          index: 11,
          name: "电池",
          locationName: "A1",
          areaName: "A 区",
          note: "七号",
          expireDate: "2028-02-03",
        },
        {
          index: 12,
          name: "剪刀",
          locationName: "A2",
          areaName: "A 区",
          note: "",
          expireDate: null,
        },
      ],
    });

    expect(plan.skipped).toEqual([{ row: 10, reason: "identical" }]);
    expect(plan.conflicts).toEqual([
      {
        id: "11:item-1",
        row: {
          index: 11,
          name: "电池",
          locationName: "A1",
          areaName: "A 区",
          note: "七号",
          expireDate: "2028-02-03",
        },
        existingItem: {
          id: "item-1",
          name: "电池",
          note: "五号",
          expireDate: "2027-01-02",
          locationName: "A1",
          areaName: "A 区",
        },
      },
    ]);
    expect(plan.creates).toEqual([
      {
        row: {
          index: 12,
          name: "剪刀",
          locationName: "A2",
          areaName: "A 区",
          note: "",
          expireDate: null,
        },
      },
    ]);
  });
});

const dashboard: DashboardData = {
  household: { id: "household-1", name: "家" },
  areas: [{ id: "area-1", name: "A 区", color: "#64748b" }],
  locations: [{ id: "location-1", name: "A1", area_id: "area-1" }],
  items: [
    {
      id: "item-1",
      name: "电池",
      note: "五号",
      expire_date: "2027-01-02",
      location_id: "location-1",
    },
  ],
};
