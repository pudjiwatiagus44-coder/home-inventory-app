import * as XLSX from "xlsx";
import type { AreaRow, DashboardData, ItemRow, LocationRow } from "./dashboard-data";

export const INVENTORY_BACKUP_SHEET_NAME = "物品清单";
export const INVENTORY_BACKUP_META_SHEET_NAME = "导出信息";

export const INVENTORY_BACKUP_HEADERS = [
  "序号",
  "名称",
  "格子编号",
  "所在区域",
  "备注",
  "有效期",
] as const;

export type InventoryBackupHeader = (typeof INVENTORY_BACKUP_HEADERS)[number];

export type InventoryBackupRow = {
  index: number;
  name: string;
  locationName: string;
  areaName: string;
  note: string;
  expireDate: string | null;
};

export type InventorySkippedRow = {
  row: number;
  reason: "identical";
};

export type InventoryImportConflict = {
  id: string;
  row: InventoryBackupRow;
  existingItem: {
    id: string;
    name: string;
    note: string;
    expireDate: string | null;
    locationName: string;
    areaName: string;
  };
};

export type InventoryImportCreate = {
  row: InventoryBackupRow;
};

export type InventoryImportPlan = {
  rows: InventoryBackupRow[];
  creates: InventoryImportCreate[];
  skipped: InventorySkippedRow[];
  conflicts: InventoryImportConflict[];
  errors: Array<{ row: number; message: string }>;
};

export type InventoryConflictResolution = "skip" | "keep" | "overwrite";

export type InventoryImportSummary = {
  createdAreas: number;
  createdLocations: number;
  createdItems: number;
  keptConflictItems: number;
  overwrittenItems: number;
  skippedItems: number;
  errors: Array<{ row: number; message: string }>;
};

export type InventoryBackupMeta = {
  exportedAt: string;
  itemCount: number;
  areaCount: number;
  locationCount: number;
};

export function buildInventoryBackupRows(
  dashboard: DashboardData,
): InventoryBackupRow[] {
  const areaMap = new Map(dashboard.areas.map((area) => [area.id, area]));
  const locationMap = new Map(
    dashboard.locations.map((location) => [location.id, location]),
  );

  return dashboard.items.map((item, index) => {
    const location = item.location_id
      ? locationMap.get(item.location_id)
      : undefined;
    const area = location?.area_id ? areaMap.get(location.area_id) : undefined;

    return {
      index: index + 1,
      name: item.name,
      locationName: location?.name ?? "",
      areaName: area?.name ?? "",
      note: item.note ?? "",
      expireDate: normalizeDateOnly(item.expire_date),
    };
  });
}

export function generateInventoryBackupWorkbook(
  dashboard: DashboardData,
): XLSX.WorkBook {
  const rows = buildInventoryBackupRows(dashboard);
  const worksheetData = rows.map((row) => [
    row.index,
    row.name,
    row.locationName,
    row.areaName,
    row.note,
    row.expireDate ?? "",
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([
    [...INVENTORY_BACKUP_HEADERS],
    ...worksheetData,
  ]);

  const meta: InventoryBackupMeta = {
    exportedAt: new Date().toISOString(),
    itemCount: rows.length,
    areaCount: dashboard.areas.length,
    locationCount: dashboard.locations.length,
  };

  const metaWorksheet = XLSX.utils.aoa_to_sheet([
    ["导出时间", meta.exportedAt],
    ["总物品数", meta.itemCount],
    ["总区域数", meta.areaCount],
    ["总位置数", meta.locationCount],
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, INVENTORY_BACKUP_SHEET_NAME);
  XLSX.utils.book_append_sheet(
    workbook,
    metaWorksheet,
    INVENTORY_BACKUP_META_SHEET_NAME,
  );

  return workbook;
}

export function writeInventoryBackupWorkbookToBuffer(
  dashboard: DashboardData,
): Uint8Array {
  const workbook = generateInventoryBackupWorkbook(dashboard);
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

export function downloadInventoryBackupBuffer(
  buffer: Uint8Array,
  filename: string,
): void {
  if (typeof window === "undefined") {
    throw new Error("downloadInventoryBackupBuffer can only be used in the browser");
  }

  const blobPart = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([blobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseInventoryBackupRows(
  buffer: ArrayBuffer | Uint8Array,
): { rows: InventoryBackupRow[]; meta: Partial<InventoryBackupMeta> } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.includes(INVENTORY_BACKUP_SHEET_NAME)
    ? INVENTORY_BACKUP_SHEET_NAME
    : workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel 文件没有工作表");
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error("无法读取 Excel 工作表");
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as Array<Array<unknown>>;

  if (rawRows.length === 0) {
    return { rows: [], meta: {} };
  }

  const header = rawRows[0].map((cell) => String(cell ?? "").trim());
  const headerIndex = INVENTORY_BACKUP_HEADERS.map((expected) =>
    header.findIndex((actual) => actual === expected),
  );

  const missingIndex = headerIndex.findIndex((index) => index === -1);
  if (missingIndex !== -1) {
    throw new Error(`Excel 表头缺少必要列：${INVENTORY_BACKUP_HEADERS[missingIndex]}`);
  }

  const rows: InventoryBackupRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const index = Number(rawRow[headerIndex[0]] ?? i);
    const name = String(rawRow[headerIndex[1]] ?? "").trim();

    if (!name) {
      continue;
    }

    rows.push({
      index: Number.isNaN(index) ? i : index,
      name,
      locationName: String(rawRow[headerIndex[2]] ?? "").trim(),
      areaName: String(rawRow[headerIndex[3]] ?? "").trim(),
      note: String(rawRow[headerIndex[4]] ?? "").trim(),
      expireDate: parseBackupDate(rawRow[headerIndex[5]]),
    });
  }

  return { rows, meta: parseBackupMeta(workbook) };
}

export function planInventoryImport(input: {
  dashboard: DashboardData;
  rows: InventoryBackupRow[];
}): InventoryImportPlan {
  const itemContexts = buildItemContexts(input.dashboard);
  const normalizedRows = input.rows.map(normalizeImportRow);
  const creates: InventoryImportCreate[] = [];
  const skipped: InventorySkippedRow[] = [];
  const conflicts: InventoryImportConflict[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (const row of normalizedRows) {
    const validation = validateInventoryBackupRow(row);
    if (!validation.isValid) {
      errors.push({ row: row.index, message: validation.error });
      continue;
    }

    const key = importRowKey(row);
    const existing = itemContexts.get(key);

    if (!existing) {
      creates.push({ row });
      continue;
    }

    if (
      normalizeText(existing.item.note) === normalizeText(row.note) &&
      normalizeDateOnly(existing.item.expire_date) === row.expireDate
    ) {
      skipped.push({ row: row.index, reason: "identical" });
      continue;
    }

    conflicts.push({
      id: `${row.index}:${existing.item.id}`,
      row,
      existingItem: {
        id: existing.item.id,
        name: existing.item.name,
        note: existing.item.note,
        expireDate: normalizeDateOnly(existing.item.expire_date),
        locationName: existing.locationName,
        areaName: existing.areaName,
      },
    });
  }

  return { rows: normalizedRows, creates, skipped, conflicts, errors };
}

export function validateInventoryBackupRow(
  row: InventoryBackupRow,
): { isValid: true } | { isValid: false; error: string } {
  if (!row.name || row.name.length > 120) {
    return { isValid: false, error: "物品名称必须在 1-120 个字符之间" };
  }

  if (row.locationName.length > 80) {
    return { isValid: false, error: "格子编号不能超过 80 个字符" };
  }

  if (row.areaName.length > 80) {
    return { isValid: false, error: "所在区域不能超过 80 个字符" };
  }

  if (row.note.length > 1000) {
    return { isValid: false, error: "备注不能超过 1000 个字符" };
  }

  if (row.expireDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(row.expireDate)) {
    return { isValid: false, error: "有效期格式必须为 YYYY-MM-DD" };
  }

  return { isValid: true };
}

export function generateInventoryBackupFilename(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  return `物品清单_${year}-${month}-${day}_${hour}-${minute}-${second}.xlsx`;
}

export function buildDashboardForBackupExport(
  rows: InventoryBackupRow[],
  existing: DashboardData,
): DashboardData {
  const areaMap = new Map<string, AreaRow>();
  const locationMap = new Map<string, LocationRow>();
  const items: ItemRow[] = [];

  for (const area of existing.areas) {
    areaMap.set(area.name, area);
  }

  for (const location of existing.locations) {
    const area = existing.areas.find((candidate) => candidate.id === location.area_id);
    const key = area ? `${area.name}:${location.name}` : `:${location.name}`;
    locationMap.set(key, location);
  }

  for (const row of rows) {
    const areaName = normalizeAreaName(row.areaName);
    let area = areaMap.get(areaName);

    if (!area) {
      area = {
        id: `imported-area-${areaMap.size}`,
        name: areaName,
        color: "#64748b",
      };
      areaMap.set(areaName, area);
    }

    const locationName = normalizeLocationName(row.locationName);
    const locationKey = `${areaName}:${locationName}`;
    let location = locationMap.get(locationKey);

    if (!location) {
      location = {
        id: `imported-location-${locationMap.size}`,
        name: locationName,
        area_id: area.id,
      };
      locationMap.set(locationKey, location);
    }

    items.push({
      id: `imported-item-${items.length}`,
      name: row.name,
      note: row.note,
      expire_date: row.expireDate,
      location_id: location.id,
    });
  }

  return {
    household: existing.household,
    areas: Array.from(areaMap.values()),
    locations: Array.from(locationMap.values()),
    items,
  };
}

export function normalizeAreaName(value: string) {
  return value.trim() || "未分区";
}

export function normalizeLocationName(value: string) {
  return value.trim() || "未设置位置";
}

function parseBackupMeta(workbook: XLSX.WorkBook): Partial<InventoryBackupMeta> {
  if (!workbook.SheetNames.includes(INVENTORY_BACKUP_META_SHEET_NAME)) {
    return {};
  }

  const metaSheet = workbook.Sheets[INVENTORY_BACKUP_META_SHEET_NAME];
  const metaRows = XLSX.utils.sheet_to_json(metaSheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as Array<Array<unknown>>;
  const meta: Partial<InventoryBackupMeta> = {};

  for (const row of metaRows) {
    const key = String(row[0] ?? "").trim();
    const value = row[1];

    if (key === "导出时间" && value) {
      meta.exportedAt = String(value);
    } else if (key === "总物品数") {
      meta.itemCount = Number(value);
    } else if (key === "总区域数") {
      meta.areaCount = Number(value);
    } else if (key === "总位置数") {
      meta.locationCount = Number(value);
    }
  }

  return meta;
}

function buildItemContexts(dashboard: DashboardData) {
  const areas = new Map(dashboard.areas.map((area) => [area.id, area]));
  const locations = new Map(dashboard.locations.map((location) => [location.id, location]));
  const contexts = new Map<
    string,
    { item: ItemRow; locationName: string; areaName: string }
  >();

  for (const item of dashboard.items) {
    const location = item.location_id ? locations.get(item.location_id) : undefined;
    const area = location?.area_id ? areas.get(location.area_id) : undefined;
    const locationName = normalizeLocationName(location?.name ?? "");
    const areaName = normalizeAreaName(area?.name ?? "");
    contexts.set(`${areaName}:${locationName}:${item.name.trim()}`, {
      item,
      locationName,
      areaName,
    });
  }

  return contexts;
}

function importRowKey(row: InventoryBackupRow) {
  return `${normalizeAreaName(row.areaName)}:${normalizeLocationName(row.locationName)}:${row.name.trim()}`;
}

function normalizeImportRow(row: InventoryBackupRow): InventoryBackupRow {
  return {
    ...row,
    expireDate: normalizeImportExpireDate(row.expireDate),
  };
}

function normalizeImportExpireDate(value: string | null) {
  if (!value) {
    return null;
  }

  const monthOnlyMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (monthOnlyMatch) {
    return `${monthOnlyMatch[1]}-${monthOnlyMatch[2]}-01`;
  }

  return value;
}

function normalizeDateOnly(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const dateMatch = value.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?$/,
    );

    if (dateMatch) {
      return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }

    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0] ?? null;
  }

  return null;
}

function parseBackupDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0] ?? null;
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return null;
  }

  const dateMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?$/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const slashMatch = stringValue.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, year, month, day] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    const excelDate = XLSX.SSF.parse_date_code(numericValue);
    if (excelDate && typeof excelDate === "object" && "y" in excelDate) {
      const { y, m, d } = excelDate as { y: number; m: number; d: number };
      return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return stringValue;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}
