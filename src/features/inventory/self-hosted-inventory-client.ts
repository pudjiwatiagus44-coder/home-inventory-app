import type { AreaInput, InventoryItemInput, LocationInput } from "./inventory-actions";
import type { DashboardData } from "./dashboard-data";
import type {
  InventoryBackupRow,
  InventoryConflictResolution,
  InventoryImportPlan,
  InventoryImportSummary,
} from "./excel-backup";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ClientOptions = {
  fetch?: FetchLike;
};

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function createSelfHostedInventoryClient({
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: ClientOptions = {}) {
  return {
    getDashboard(householdId?: string) {
      const query = householdId
        ? `?householdId=${encodeURIComponent(householdId)}`
        : "";

      return request<DashboardData>(`/api/inventory/dashboard${query}`, {
        method: "GET",
      });
    },

    createArea(input: AreaInput & { householdId?: string }) {
      return request(
        "/api/inventory/areas",
        jsonInit("POST", withHouseholdId(input, input.householdId)),
      );
    },

    updateArea(input: AreaInput & { householdId?: string; areaId: string }) {
      return request(
        `/api/inventory/areas/${encodeURIComponent(input.areaId)}`,
        jsonInit("PATCH", {
          ...(input.householdId ? { householdId: input.householdId } : {}),
          name: input.name,
          color: input.color,
        }),
      );
    },

    deleteArea(input: { householdId?: string; areaId: string }) {
      return request(
        withHouseholdQuery(
          `/api/inventory/areas/${encodeURIComponent(input.areaId)}`,
          input.householdId,
        ),
        jsonInit("DELETE"),
      );
    },

    createLocation(input: LocationInput & { householdId?: string }) {
      return request(
        "/api/inventory/locations",
        jsonInit("POST", withHouseholdId(input, input.householdId)),
      );
    },

    updateLocation(
      input: LocationInput & { householdId?: string; locationId: string },
    ) {
      return request(
        `/api/inventory/locations/${encodeURIComponent(input.locationId)}`,
        jsonInit("PATCH", {
          ...(input.householdId ? { householdId: input.householdId } : {}),
          name: input.name,
          areaId: input.areaId,
        }),
      );
    },

    deleteLocation(input: { householdId?: string; locationId: string }) {
      return request(
        withHouseholdQuery(
          `/api/inventory/locations/${encodeURIComponent(input.locationId)}`,
          input.householdId,
        ),
        jsonInit("DELETE"),
      );
    },

    createItem(input: InventoryItemInput & { householdId?: string }) {
      return request(
        "/api/inventory/items",
        jsonInit("POST", withHouseholdId(input, input.householdId)),
      );
    },

    updateItem(
      input: InventoryItemInput & { householdId?: string; itemId: string },
    ) {
      return request(
        `/api/inventory/items/${encodeURIComponent(input.itemId)}`,
        jsonInit("PATCH", {
          ...(input.householdId ? { householdId: input.householdId } : {}),
          name: input.name,
          note: input.note,
          expireDate: input.expireDate,
          locationId: input.locationId,
        }),
      );
    },

    deleteItem(input: { householdId?: string; itemId: string }) {
      return request(
        withHouseholdQuery(
          `/api/inventory/items/${encodeURIComponent(input.itemId)}`,
          input.householdId,
        ),
        jsonInit("DELETE"),
      );
    },

    uploadAreaPhoto(areaId: string, file: File, householdId?: string) {
      const formData = new FormData();
      formData.append("file", file);
      return request<{ photoKey: string }>(
        withHouseholdQuery(
          `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
          householdId,
        ),
        { method: "PUT", body: formData },
      );
    },

    deleteAreaPhoto(areaId: string, householdId?: string) {
      return request(
        withHouseholdQuery(
          `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
          householdId,
        ),
        jsonInit("DELETE"),
      );
    },

    async getAreaPhoto(areaId: string, householdId?: string) {
      const response = await fetchImpl(
        withHouseholdQuery(
          `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
          householdId,
        ),
      );
      if (!response.ok) {
        throw new Error("加载区域照片失败");
      }
      return response.blob();
    },

    uploadLocationPhoto(locationId: string, file: File, householdId?: string) {
      const formData = new FormData();
      formData.append("file", file);
      return request<{ photoKey: string }>(
        withHouseholdQuery(
          `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
          householdId,
        ),
        { method: "PUT", body: formData },
      );
    },

    deleteLocationPhoto(locationId: string, householdId?: string) {
      return request(
        withHouseholdQuery(
          `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
          householdId,
        ),
        jsonInit("DELETE"),
      );
    },

    async getLocationPhoto(locationId: string, householdId?: string) {
      const response = await fetchImpl(
        withHouseholdQuery(
          `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
          householdId,
        ),
      );
      if (!response.ok) {
        throw new Error("加载位置照片失败");
      }
      return response.blob();
    },

    previewImport(file: File, householdId?: string) {
      const formData = new FormData();
      formData.append("file", file);

      return request<InventoryImportPlan>(
        withHouseholdQuery("/api/inventory/import?mode=preview", householdId),
        {
          method: "POST",
          body: formData,
        },
      );
    },

    commitImport(input: {
      householdId?: string;
      rows: InventoryBackupRow[];
      conflictResolutions: Record<string, InventoryConflictResolution>;
    }) {
      return request<InventoryImportSummary>(
        "/api/inventory/import?mode=commit",
        jsonInit("POST", withHouseholdId(input, input.householdId)),
      );
    },

    async importItems(file: File, householdId?: string) {
      const preview = await this.previewImport(file, householdId);
      return this.commitImport({
        householdId,
        rows: preview.rows,
        conflictResolutions: {},
      });
    },
  };

  async function request<T>(input: string, init: RequestInit): Promise<T> {
    const response = await fetchImpl(input, init);
    const payload = (await response.json()) as ApiResponse<T>;

    if (!payload.ok) {
      throw new Error(payload.message);
    }

    return payload.data;
  }
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function withHouseholdId<T extends object>(
  input: T,
  householdId?: string,
): T {
  return householdId ? { ...input, householdId } : input;
}

function withHouseholdQuery(path: string, householdId?: string) {
  if (!householdId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}householdId=${encodeURIComponent(householdId)}`;
}
