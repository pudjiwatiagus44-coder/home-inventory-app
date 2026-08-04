import {
  validateAreaInput,
  validateInventoryItemInput,
  validateLocationInput,
  type AreaInput,
  type InventoryItemInput,
  type LocationInput,
} from "./inventory-actions";
import type { DashboardData } from "./dashboard-data";
import {
  normalizeAreaName,
  normalizeLocationName,
  planInventoryImport,
  type InventoryBackupRow,
  type InventoryConflictResolution,
  type InventoryImportSummary,
} from "./excel-backup";
import type { InventoryRepository } from "./inventory-repository";

type InventoryServiceDependencies = {
  repository: Pick<
    InventoryRepository,
    | "getDashboardForUser"
    | "createArea"
    | "updateArea"
    | "deleteArea"
    | "createLocation"
    | "updateLocation"
    | "deleteLocation"
    | "createItem"
    | "updateItem"
    | "deleteItem"
  >;
};

export class CurrentUserHouseholdNotFoundError extends Error {
  constructor() {
    super("No household found for current user");
    this.name = "CurrentUserHouseholdNotFoundError";
  }
}

export class LocationOutsideCurrentHouseholdError extends Error {
  constructor() {
    super("Selected location does not belong to current user");
    this.name = "LocationOutsideCurrentHouseholdError";
  }
}

export class AreaOutsideCurrentHouseholdError extends Error {
  constructor() {
    super("Selected area does not belong to current user");
    this.name = "AreaOutsideCurrentHouseholdError";
  }
}

export class ItemOutsideCurrentHouseholdError extends Error {
  constructor() {
    super("Selected item does not belong to current user");
    this.name = "ItemOutsideCurrentHouseholdError";
  }
}

export function createInventoryService({
  repository,
}: InventoryServiceDependencies) {
  async function loadDashboard(userId: string) {
    const dashboard = await repository.getDashboardForUser(userId);

    if (!dashboard) {
      throw new CurrentUserHouseholdNotFoundError();
    }

    return dashboard;
  }

  return {
    async previewImportForCurrentUser(input: {
      userId: string;
      rows: InventoryBackupRow[];
    }) {
      const dashboard = await loadDashboard(input.userId);
      return planInventoryImport({ dashboard, rows: input.rows });
    },

    async commitImportForCurrentUser(input: {
      userId: string;
      rows: InventoryBackupRow[];
      conflictResolutions: Record<string, InventoryConflictResolution>;
    }) {
      const dashboard = await loadDashboard(input.userId);

      return commitInventoryImportRows({
        userId: input.userId,
        dashboard,
        rows: input.rows,
        conflictResolutions: input.conflictResolutions,
        repository,
      });
    },

    async importItemsForCurrentUser(input: {
      userId: string;
      rows: InventoryBackupRow[];
    }) {
      const dashboard = await loadDashboard(input.userId);

      return commitInventoryImportRows({
        userId: input.userId,
        dashboard,
        rows: input.rows,
        conflictResolutions: {},
        repository,
      });
    },

    async createAreaForCurrentUser(input: AreaInput & { userId: string }) {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId);

      return repository.createArea({
        householdId: dashboard.household.id,
        ...validation.value,
      });
    },

    async updateAreaForCurrentUser(
      input: AreaInput & { userId: string; areaId: string },
    ) {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId);

      if (!dashboard.areas.some((area) => area.id === input.areaId)) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.updateArea({
        householdId: dashboard.household.id,
        areaId: input.areaId,
        ...validation.value,
      });
    },

    async deleteAreaForCurrentUser(input: { userId: string; areaId: string }) {
      const dashboard = await loadDashboard(input.userId);

      if (!dashboard.areas.some((area) => area.id === input.areaId)) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.deleteArea({
        householdId: dashboard.household.id,
        areaId: input.areaId,
      });
    },

    async createLocationForCurrentUser(
      input: LocationInput & { userId: string },
    ) {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId);

      if (
        validation.value.areaId &&
        !dashboard.areas.some((area) => area.id === validation.value.areaId)
      ) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.createLocation({
        householdId: dashboard.household.id,
        ...validation.value,
      });
    },

    async updateLocationForCurrentUser(
      input: LocationInput & { userId: string; locationId: string },
    ) {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId);

      if (!dashboard.locations.some((location) => location.id === input.locationId)) {
        throw new LocationOutsideCurrentHouseholdError();
      }

      if (
        validation.value.areaId &&
        !dashboard.areas.some((area) => area.id === validation.value.areaId)
      ) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.updateLocation({
        householdId: dashboard.household.id,
        locationId: input.locationId,
        ...validation.value,
      });
    },

    async deleteLocationForCurrentUser(input: {
      userId: string;
      locationId: string;
    }) {
      const dashboard = await loadDashboard(input.userId);

      if (!dashboard.locations.some((location) => location.id === input.locationId)) {
        throw new LocationOutsideCurrentHouseholdError();
      }

      return repository.deleteLocation({
        householdId: dashboard.household.id,
        locationId: input.locationId,
      });
    },

    async createItemForCurrentUser(
      input: InventoryItemInput & { userId: string },
    ) {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId);

      if (
        validation.value.locationId &&
        !dashboard.locations.some(
          (location) => location.id === validation.value.locationId,
        )
      ) {
        throw new LocationOutsideCurrentHouseholdError();
      }

      return repository.createItem({
        householdId: dashboard.household.id,
        createdBy: input.userId,
        ...validation.value,
      });
    },

    async updateItemForCurrentUser(
      input: InventoryItemInput & { userId: string; itemId: string },
    ) {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId);

      if (!dashboard.items.some((item) => item.id === input.itemId)) {
        throw new ItemOutsideCurrentHouseholdError();
      }

      if (
        validation.value.locationId &&
        !dashboard.locations.some(
          (location) => location.id === validation.value.locationId,
        )
      ) {
        throw new LocationOutsideCurrentHouseholdError();
      }

      return repository.updateItem({
        householdId: dashboard.household.id,
        itemId: input.itemId,
        ...validation.value,
      });
    },

    async deleteItemForCurrentUser(input: { userId: string; itemId: string }) {
      const dashboard = await loadDashboard(input.userId);

      if (!dashboard.items.some((item) => item.id === input.itemId)) {
        throw new ItemOutsideCurrentHouseholdError();
      }

      return repository.deleteItem({
        householdId: dashboard.household.id,
        itemId: input.itemId,
      });
    },
  };
}

const defaultAreaColors = [
  "#64748b",
  "#256f6b",
  "#7c3aed",
  "#c2410c",
  "#be123c",
  "#0f766e",
  "#4338ca",
  "#b45309",
];

async function commitInventoryImportRows({
  userId,
  dashboard,
  rows,
  conflictResolutions,
  repository,
}: {
  userId: string;
  dashboard: DashboardData;
  rows: InventoryBackupRow[];
  conflictResolutions: Record<string, InventoryConflictResolution>;
  repository: InventoryServiceDependencies["repository"];
}): Promise<InventoryImportSummary> {
  const plan = planInventoryImport({ dashboard, rows });
  const householdId = dashboard.household.id;
  const areaByName = new Map(dashboard.areas.map((area) => [area.name, area]));
  const locationByKey = new Map(
    dashboard.locations.map((location) => [location.name, location] as const),
  );
  const summary: InventoryImportSummary = {
    createdAreas: 0,
    createdLocations: 0,
    createdItems: 0,
    keptConflictItems: 0,
    overwrittenItems: 0,
    skippedItems: plan.skipped.length,
    errors: [...plan.errors],
  };

  for (const create of plan.creates) {
    await createItemFromImportRow({
      userId,
      householdId,
      row: create.row,
      areaByName,
      locationByKey,
      repository,
      summary,
    });
    summary.createdItems += 1;
  }

  for (const conflict of plan.conflicts) {
    const resolution = conflictResolutions[conflict.id] ?? "skip";

    if (resolution === "skip") {
      summary.skippedItems += 1;
      continue;
    }

    if (resolution === "overwrite") {
      const existingLocation = dashboard.locations.find(
        (location) => location.name === conflict.existingItem.locationName,
      );
      await repository.updateItem({
        householdId,
        itemId: conflict.existingItem.id,
        name: conflict.existingItem.name,
        note: conflict.row.note,
        expireDate: conflict.row.expireDate,
        locationId: existingLocation?.id ?? null,
      });
      summary.overwrittenItems += 1;
      continue;
    }

    await createItemFromImportRow({
      userId,
      householdId,
      row: conflict.row,
      areaByName,
      locationByKey,
      repository,
      summary,
    });
    summary.createdItems += 1;
    summary.keptConflictItems += 1;
  }

  return summary;
}

async function createItemFromImportRow({
  userId,
  householdId,
  row,
  areaByName,
  locationByKey,
  repository,
  summary,
}: {
  userId: string;
  householdId: string;
  row: InventoryBackupRow;
  areaByName: Map<string, { id: string; name: string; color: string }>;
  locationByKey: Map<string, { id: string; name: string; area_id?: string | null }>;
  repository: InventoryServiceDependencies["repository"];
  summary: Pick<InventoryImportSummary, "createdAreas" | "createdLocations">;
}) {
  const areaName = normalizeAreaName(row.areaName);
  const locationName = normalizeLocationName(row.locationName);
  const locationKey = locationName;
  let location = locationByKey.get(locationKey);

  if (!location) {
    let area = areaByName.get(areaName);

    if (!area) {
      area = await repository.createArea({
        householdId,
        name: areaName,
        color: defaultAreaColors[areaByName.size % defaultAreaColors.length],
      });
      areaByName.set(areaName, area);
      summary.createdAreas += 1;
    }

    location = await repository.createLocation({
      householdId,
      name: locationName,
      areaId: area.id,
    });
    locationByKey.set(locationKey, {
      id: location.id,
      name: location.name,
      area_id: area.id,
    });
    summary.createdLocations += 1;
  }

  await repository.createItem({
    householdId,
    createdBy: userId,
    name: row.name,
    note: row.note,
    expireDate: row.expireDate,
    locationId: location.id,
  });
}
