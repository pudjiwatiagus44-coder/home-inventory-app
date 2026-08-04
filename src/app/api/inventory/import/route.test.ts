import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { createImportHandlers } from "./handlers";
import { INVENTORY_BACKUP_HEADERS, INVENTORY_BACKUP_SHEET_NAME } from "../../../../features/inventory/excel-backup";

describe("POST /api/inventory/import", () => {
  it("requires authentication", async () => {
    const { POST } = createImportHandlers({
      authService: { getCurrentUser: async () => null },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/inventory/import", {
        method: "POST",
        body: new FormData(),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(response.status).toBe(401);
  });

  it("previews an Excel file before writing", async () => {
    const calls: unknown[] = [];
    const formData = new FormData();
    formData.append("file", workbookFile());
    const { POST } = createImportHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-1" }) },
      inventoryService: {
        previewImportForCurrentUser: async (input) => {
          calls.push(input);
          return {
            rows: input.rows,
            creates: [{ row: input.rows[0] }],
            skipped: [],
            conflicts: [],
            errors: [],
          };
        },
        commitImportForCurrentUser: async () => {
          throw new Error("should not commit during preview");
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/inventory/import?mode=preview", {
        method: "POST",
        headers: { cookie: "home_inventory_session=session-1" },
        body: formData,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        creates: [
          {
            row: {
              index: 1,
              name: "电池",
              locationName: "A1",
              areaName: "A 区",
            },
          },
        ],
      },
    });
    expect(calls).toHaveLength(1);
  });

  it("commits rows with conflict resolutions", async () => {
    const calls: unknown[] = [];
    const { POST } = createImportHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-1" }) },
      inventoryService: {
        previewImportForCurrentUser: async () => {
          throw new Error("should not preview during commit");
        },
        commitImportForCurrentUser: async (input) => {
          calls.push(input);
          return {
            createdAreas: 0,
            createdLocations: 0,
            createdItems: 0,
            keptConflictItems: 0,
            overwrittenItems: 1,
            skippedItems: 0,
            errors: [],
          };
        },
      },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/inventory/import?mode=commit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "home_inventory_session=session-1",
        },
        body: JSON.stringify({
          rows: [
            {
              index: 2,
              name: "电池",
              locationName: "A1",
              areaName: "A 区",
              note: "fresh",
              expireDate: "2028-02-03",
            },
          ],
          conflictResolutions: { "2:item-1": "overwrite" },
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
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
    expect(calls).toEqual([
      {
        userId: "user-1",
        rows: [
          {
            index: 2,
            name: "电池",
            locationName: "A1",
            areaName: "A 区",
            note: "fresh",
            expireDate: "2028-02-03",
          },
        ],
        conflictResolutions: { "2:item-1": "overwrite" },
      },
    ]);
  });
});

function workbookFile() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    INVENTORY_BACKUP_HEADERS,
    [1, "电池", "A1", "A 区", "", ""],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, INVENTORY_BACKUP_SHEET_NAME);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([buffer], "items.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
