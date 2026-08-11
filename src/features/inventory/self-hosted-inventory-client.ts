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

    createArea(input: AreaInput) {
      return request("/api/inventory/areas", jsonInit("POST", input));
    },

    updateArea(input: AreaInput & { areaId: string }) {
      return request(
        `/api/inventory/areas/${encodeURIComponent(input.areaId)}`,
        jsonInit("PATCH", {
          name: input.name,
          color: input.color,
        }),
      );
    },

    deleteArea(input: { areaId: string }) {
      return request(
        `/api/inventory/areas/${encodeURIComponent(input.areaId)}`,
        jsonInit("DELETE"),
      );
    },

    createLocation(input: LocationInput) {
      return request("/api/inventory/locations", jsonInit("POST", input));
    },

    updateLocation(input: LocationInput & { locationId: string }) {
      return request(
        `/api/inventory/locations/${encodeURIComponent(input.locationId)}`,
        jsonInit("PATCH", {
          name: input.name,
          areaId: input.areaId,
        }),
      );
    },

    deleteLocation(input: { locationId: string }) {
      return request(
        `/api/inventory/locations/${encodeURIComponent(input.locationId)}`,
        jsonInit("DELETE"),
      );
    },

    createItem(input: InventoryItemInput) {
      return request("/api/inventory/items", jsonInit("POST", input));
    },

    updateItem(input: InventoryItemInput & { itemId: string }) {
      return request(
        `/api/inventory/items/${encodeURIComponent(input.itemId)}`,
        jsonInit("PATCH", {
          name: input.name,
          note: input.note,
          expireDate: input.expireDate,
          locationId: input.locationId,
        }),
      );
    },

    deleteItem(input: { itemId: string }) {
      return request(
        `/api/inventory/items/${encodeURIComponent(input.itemId)}`,
        jsonInit("DELETE"),
      );
    },

    uploadAreaPhoto(areaId: string, file: File) {
      const formData = new FormData();
      formData.append("file", file);
      return request<{ photoKey: string }>(
        `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
        { method: "PUT", body: formData },
      );
    },

    deleteAreaPhoto(areaId: string) {
      return request(
        `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
        jsonInit("DELETE"),
      );
    },

    async getAreaPhoto(areaId: string) {
      const response = await fetchImpl(
        `/api/inventory/areas/${encodeURIComponent(areaId)}/photo`,
      );
      if (!response.ok) {
        throw new Error("加载区域照片失败");
      }
      return response.blob();
    },

    uploadLocationPhoto(locationId: string, file: File) {
      const formData = new FormData();
      formData.append("file", file);
      return request<{ photoKey: string }>(
        `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
        { method: "PUT", body: formData },
      );
    },

    deleteLocationPhoto(locationId: string) {
      return request(
        `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
        jsonInit("DELETE"),
      );
    },

    async getLocationPhoto(locationId: string) {
      const response = await fetchImpl(
        `/api/inventory/locations/${encodeURIComponent(locationId)}/photo`,
      );
      if (!response.ok) {
        throw new Error("加载位置照片失败");
      }
      return response.blob();
    },

    previewImport(file: File) {
      const formData = new FormData();
      formData.append("file", file);

      return request<InventoryImportPlan>("/api/inventory/import?mode=preview", {
        method: "POST",
        body: formData,
      });
    },

    commitImport(input: {
      rows: InventoryBackupRow[];
      conflictResolutions: Record<string, InventoryConflictResolution>;
    }) {
      return request<InventoryImportSummary>(
        "/api/inventory/import?mode=commit",
        jsonInit("POST", input),
      );
    },

    async importItems(file: File) {
      const preview = await this.previewImport(file);
      return this.commitImport({
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
