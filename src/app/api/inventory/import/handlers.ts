import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import { createRouteInventoryService } from "../route-helpers";
import {
  parseInventoryBackupRows,
  type InventoryBackupRow,
  type InventoryConflictResolution,
} from "../../../../features/inventory/excel-backup";
import type { createInventoryService } from "../../../../features/inventory/inventory-service";

export type InventoryImportService = Pick<
  ReturnType<typeof createInventoryService>,
  "previewImportForCurrentUser" | "commitImportForCurrentUser"
>;

type ImportDependencies = {
  authService?: Parameters<typeof getCurrentUserFromRequest>[1];
  inventoryService?: InventoryImportService;
};

export function createImportHandlers(dependencies: ImportDependencies = {}) {
  return {
    POST: (request: NextRequest) => handleImportPost(request, dependencies),
  };
}

async function handleImportPost(
  request: NextRequest,
  dependencies: ImportDependencies,
) {
  try {
    const currentUser = await getCurrentUserFromRequest(
      request,
      dependencies.authService,
    );

    if (!currentUser) {
      return NextResponse.json(
        { ok: false, message: "Authentication required" },
        { status: 401 },
      );
    }

    const service = dependencies.inventoryService ?? createRouteInventoryService();
    const mode = request.nextUrl.searchParams.get("mode") ?? "preview";

    if (mode === "commit") {
      const body = (await request.json()) as {
        rows?: unknown;
        conflictResolutions?: unknown;
      };
      const rows = normalizeRows(body.rows);
      const conflictResolutions = normalizeConflictResolutions(
        body.conflictResolutions,
      );
      const summary = await service.commitImportForCurrentUser({
        userId: currentUser.userId,
        rows,
        conflictResolutions,
      });

      return NextResponse.json({ ok: true, data: summary });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, message: "请上传 Excel 文件" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { ok: false, message: "上传文件为空" },
        { status: 400 },
      );
    }

    const acceptedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];

    if (file.type && !acceptedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, message: "仅支持 .xlsx 或 .xls 格式的 Excel 文件" },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const { rows } = parseInventoryBackupRows(buffer);
    const preview = await service.previewImportForCurrentUser({
      userId: currentUser.userId,
      rows,
    });

    return NextResponse.json({ ok: true, data: preview });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "导入失败" },
      { status: 500 },
    );
  }
}

function normalizeRows(value: unknown): InventoryBackupRow[] {
  if (!Array.isArray(value)) {
    throw new Error("导入提交缺少物品行");
  }

  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`第 ${index + 1} 行格式不正确`);
    }

    const candidate = row as Record<string, unknown>;
    return {
      index: Number(candidate.index ?? index + 1),
      name: text(candidate.name),
      locationName: text(candidate.locationName),
      areaName: text(candidate.areaName),
      note: text(candidate.note),
      expireDate:
        typeof candidate.expireDate === "string" ? candidate.expireDate : null,
    };
  });
}

function normalizeConflictResolutions(
  value: unknown,
): Record<string, InventoryConflictResolution> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const resolutions: Record<string, InventoryConflictResolution> = {};
  for (const [key, rawResolution] of Object.entries(value)) {
    if (
      rawResolution === "skip" ||
      rawResolution === "keep" ||
      rawResolution === "overwrite"
    ) {
      resolutions[key] = rawResolution;
    }
  }

  return resolutions;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
