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
import type {
  MobileAreaPayload,
  MobileItemPayload,
  MobileLocationPayload,
  MobileSyncData,
  MobileSyncEntity,
  MobileSyncOperation,
  MobileSyncOperationResult,
} from "./mobile-sync";

type InventoryServiceDependencies = {
  repository: Pick<
    InventoryRepository,
    | "getDashboardForUser"
    | "createArea"
    | "updateArea"
    | "updateAreaIfVersionMatches"
    | "deleteArea"
    | "deleteAreaIfVersionMatches"
    | "createLocation"
    | "updateLocation"
    | "updateLocationIfVersionMatches"
    | "deleteLocation"
    | "deleteLocationIfVersionMatches"
    | "createItem"
    | "updateItem"
    | "updateItemIfVersionMatches"
    | "deleteItem"
    | "deleteItemIfVersionMatches"
  >;
};

type SelectedHouseholdInput = {
  householdId?: string;
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

export class ReadOnlyMemberError extends Error {
  constructor() {
    super("只读成员不能修改家庭数据");
    this.name = "ReadOnlyMemberError";
  }
}

export class ContributorAreaPermissionError extends Error {
  constructor() {
    super("贡献者不能管理区域");
    this.name = "ContributorAreaPermissionError";
  }
}

export class ContributorOwnRecordPermissionError extends Error {
  constructor() {
    super("贡献者只能编辑自己创建的物品或位置");
    this.name = "ContributorOwnRecordPermissionError";
  }
}

export class ContributorDeletePermissionError extends Error {
  constructor() {
    super("贡献者不能删除物品或位置");
    this.name = "ContributorDeletePermissionError";
  }
}

export function createInventoryService({
  repository,
}: InventoryServiceDependencies) {
  async function loadDashboard(userId: string, householdId?: string) {
    const dashboard = await repository.getDashboardForUser(userId, householdId);

    if (!dashboard) {
      throw new CurrentUserHouseholdNotFoundError();
    }

    return dashboard;
  }

  function assertCanWrite(dashboard: DashboardData) {
    if (dashboard.household.role === "readonly") {
      throw new ReadOnlyMemberError();
    }
  }

  function assertCanManageArea(dashboard: DashboardData) {
    assertCanWrite(dashboard);

    if (dashboard.household.role === "contributor") {
      throw new ContributorAreaPermissionError();
    }
  }

  function assertContributorCanUpdateRecord(input: {
    dashboard: DashboardData;
    userId: string;
    createdBy: string | null | undefined;
  }) {
    assertCanWrite(input.dashboard);

    if (
      input.dashboard.household.role === "contributor" &&
      input.createdBy !== input.userId
    ) {
      throw new ContributorOwnRecordPermissionError();
    }
  }

  function assertCanDeleteRecord(dashboard: DashboardData) {
    assertCanWrite(dashboard);

    if (dashboard.household.role === "contributor") {
      throw new ContributorDeletePermissionError();
    }
  }

  const service = {
    async previewImportForCurrentUser(input: {
      userId: string;
      rows: InventoryBackupRow[];
    } & SelectedHouseholdInput) {
      const dashboard = await loadDashboard(input.userId, input.householdId);
      return planInventoryImport({ dashboard, rows: input.rows });
    },

    async commitImportForCurrentUser(input: {
      userId: string;
      rows: InventoryBackupRow[];
      conflictResolutions: Record<string, InventoryConflictResolution>;
    } & SelectedHouseholdInput) {
      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanManageArea(dashboard);

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
    } & SelectedHouseholdInput) {
      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanManageArea(dashboard);

      return commitInventoryImportRows({
        userId: input.userId,
        dashboard,
        rows: input.rows,
        conflictResolutions: {},
        repository,
      });
    },

    async createAreaForCurrentUser(
      input: AreaInput & { userId: string } & SelectedHouseholdInput,
    ) {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanManageArea(dashboard);

      return repository.createArea({
        householdId: dashboard.household.id,
        ...validation.value,
      });
    },

    async updateAreaForCurrentUser(
      input: AreaInput & { userId: string; areaId: string } & SelectedHouseholdInput,
    ) {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanManageArea(dashboard);

      if (!dashboard.areas.some((area) => area.id === input.areaId)) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.updateArea({
        householdId: dashboard.household.id,
        areaId: input.areaId,
        ...validation.value,
      });
    },

    async deleteAreaForCurrentUser(
      input: { userId: string; areaId: string } & SelectedHouseholdInput,
    ) {
      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanManageArea(dashboard);

      if (!dashboard.areas.some((area) => area.id === input.areaId)) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.deleteArea({
        householdId: dashboard.household.id,
        areaId: input.areaId,
      });
    },

    async createLocationForCurrentUser(
      input: LocationInput & { userId: string } & SelectedHouseholdInput,
    ) {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanWrite(dashboard);

      if (
        validation.value.areaId &&
        !dashboard.areas.some((area) => area.id === validation.value.areaId)
      ) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      return repository.createLocation({
        householdId: dashboard.household.id,
        createdBy: input.userId,
        ...validation.value,
      });
    },

    async updateLocationForCurrentUser(
      input: LocationInput & { userId: string; locationId: string } & SelectedHouseholdInput,
    ) {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanWrite(dashboard);

      const location = dashboard.locations.find(
        (candidate) => candidate.id === input.locationId,
      );
      if (!location) {
        throw new LocationOutsideCurrentHouseholdError();
      }

      assertContributorCanUpdateRecord({
        dashboard,
        userId: input.userId,
        createdBy: location.createdBy,
      });

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
    } & SelectedHouseholdInput) {
      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanWrite(dashboard);

      if (!dashboard.locations.some((location) => location.id === input.locationId)) {
        throw new LocationOutsideCurrentHouseholdError();
      }
      assertCanDeleteRecord(dashboard);

      return repository.deleteLocation({
        householdId: dashboard.household.id,
        locationId: input.locationId,
      });
    },

    async createItemForCurrentUser(
      input: InventoryItemInput & { userId: string } & SelectedHouseholdInput,
    ) {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanWrite(dashboard);

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
      input: InventoryItemInput & { userId: string; itemId: string } & SelectedHouseholdInput,
    ) {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanWrite(dashboard);

      const item = dashboard.items.find((candidate) => candidate.id === input.itemId);
      if (!item) {
        throw new ItemOutsideCurrentHouseholdError();
      }

      assertContributorCanUpdateRecord({
        dashboard,
        userId: input.userId,
        createdBy: item.createdBy,
      });

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

    async deleteItemForCurrentUser(
      input: { userId: string; itemId: string } & SelectedHouseholdInput,
    ) {
      const dashboard = await loadDashboard(input.userId, input.householdId);
      assertCanWrite(dashboard);

      if (!dashboard.items.some((item) => item.id === input.itemId)) {
        throw new ItemOutsideCurrentHouseholdError();
      }
      assertCanDeleteRecord(dashboard);

      return repository.deleteItem({
        householdId: dashboard.household.id,
        itemId: input.itemId,
      });
    },

    async syncQueuedOperationsForCurrentUser(input: {
      userId: string;
      operations: MobileSyncOperation[];
      householdId?: string;
    }): Promise<MobileSyncData> {
      const results: MobileSyncOperationResult[] = [];

      for (const operation of input.operations) {
        results.push(
          await syncQueuedOperationForCurrentUser(
            input.userId,
            operation,
            input.householdId,
          ),
        );
      }

      return { results };
    },
  };

  async function syncQueuedOperationForCurrentUser(
    userId: string,
    operation: MobileSyncOperation,
    householdId?: string,
  ): Promise<MobileSyncOperationResult> {
    try {
      if (operation.action === "create") {
        return await applyCreateOperation(userId, operation, householdId);
      }

      const serverId = operation.serverId;
      if (!serverId) {
        return failedResult(operation, "serverId is required");
      }

      const dashboard = await loadDashboard(userId, householdId);
      const currentEntity = findVersionedEntity(
        dashboard,
        operation.entity,
        serverId,
      );

      if (!currentEntity) {
        return conflictResult(operation, `Server ${operation.entity} is missing`);
      }

      if (currentEntity.updatedAt !== operation.baseServerUpdatedAt) {
        return conflictResult(
          operation,
          `Server ${operation.entity} changed since the operation was queued`,
        );
      }

      if (operation.action === "update") {
        return await applyUpdateOperation(userId, operation, dashboard);
      }

      return await applyDeleteOperation(operation, dashboard);
    } catch (error) {
      return failedResult(
        operation,
        error instanceof Error ? error.message : "Unknown sync operation error",
      );
    }
  }

  async function applyCreateOperation(
    userId: string,
    operation: MobileSyncOperation,
    householdId?: string,
  ): Promise<MobileSyncOperationResult> {
    if (operation.entity === "area") {
      const area = await service.createAreaForCurrentUser({
        userId,
        householdId,
        ...requireAreaPayload(operation),
      });
      return appliedResult(operation, area.id, readServerUpdatedAt(area));
    }

    if (operation.entity === "location") {
      const location = await service.createLocationForCurrentUser({
        userId,
        householdId,
        ...requireLocationPayload(operation),
      });
      return appliedResult(operation, location.id, readServerUpdatedAt(location));
    }

    const item = await service.createItemForCurrentUser({
      userId,
      householdId,
      ...requireItemPayload(operation),
    });
    return appliedResult(operation, item.id, readServerUpdatedAt(item));
  }

  async function applyUpdateOperation(
    userId: string,
    operation: MobileSyncOperation,
    dashboard: DashboardData,
  ): Promise<MobileSyncOperationResult> {
    const serverId = requireServerId(operation);
    const householdId = dashboard.household.id;

    if (operation.entity === "area") {
      assertCanManageArea(dashboard);
      const validation = validateAreaInput(requireAreaPayload(operation));

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const area = await requireAtomicUpdateArea(repository)({
        householdId,
        areaId: serverId,
        baseServerUpdatedAt: requireBaseServerUpdatedAt(operation),
        ...validation.value,
      });
      if (!area) {
        return conflictResult(
          operation,
          `Server ${operation.entity} changed since the operation was queued`,
        );
      }
      return appliedResult(operation, area.id, readServerUpdatedAt(area));
    }

    if (operation.entity === "location") {
      const validation = validateLocationInput(requireLocationPayload(operation));

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      if (
        validation.value.areaId &&
        !dashboard.areas.some((area) => area.id === validation.value.areaId)
      ) {
        throw new AreaOutsideCurrentHouseholdError();
      }

      const existingLocation = dashboard.locations.find(
        (location) => location.id === serverId,
      );
      assertContributorCanUpdateRecord({
        dashboard,
        userId,
        createdBy: existingLocation?.createdBy,
      });

      const location = await requireAtomicUpdateLocation(repository)({
        householdId,
        locationId: serverId,
        baseServerUpdatedAt: requireBaseServerUpdatedAt(operation),
        ...validation.value,
      });
      if (!location) {
        return conflictResult(
          operation,
          `Server ${operation.entity} changed since the operation was queued`,
        );
      }
      return appliedResult(operation, location.id, readServerUpdatedAt(location));
    }

    const validation = validateInventoryItemInput(requireItemPayload(operation));

    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    if (
      validation.value.locationId &&
      !dashboard.locations.some(
        (location) => location.id === validation.value.locationId,
      )
    ) {
      throw new LocationOutsideCurrentHouseholdError();
    }

    const existingItem = dashboard.items.find((item) => item.id === serverId);
    assertContributorCanUpdateRecord({
      dashboard,
      userId,
      createdBy: existingItem?.createdBy,
    });

    const item = await requireAtomicUpdateItem(repository)({
      householdId,
      itemId: serverId,
      baseServerUpdatedAt: requireBaseServerUpdatedAt(operation),
      ...validation.value,
    });
    if (!item) {
      return conflictResult(
        operation,
        `Server ${operation.entity} changed since the operation was queued`,
      );
    }
    return appliedResult(operation, item.id, readServerUpdatedAt(item));
  }

  async function applyDeleteOperation(
    operation: MobileSyncOperation,
    dashboard: DashboardData,
  ): Promise<MobileSyncOperationResult> {
    const serverId = requireServerId(operation);
    const householdId = dashboard.household.id;

    let deleted = true;

    if (operation.entity === "area") {
      assertCanManageArea(dashboard);
      deleted = await requireAtomicDeleteArea(repository)({
        householdId,
        areaId: serverId,
        baseServerUpdatedAt: requireBaseServerUpdatedAt(operation),
      });
    } else if (operation.entity === "location") {
      assertCanDeleteRecord(dashboard);
      deleted = await requireAtomicDeleteLocation(repository)({
        householdId,
        locationId: serverId,
        baseServerUpdatedAt: requireBaseServerUpdatedAt(operation),
      });
    } else {
      assertCanDeleteRecord(dashboard);
      deleted = await requireAtomicDeleteItem(repository)({
        householdId,
        itemId: serverId,
        baseServerUpdatedAt: requireBaseServerUpdatedAt(operation),
      });
    }

    if (!deleted) {
      return conflictResult(
        operation,
        `Server ${operation.entity} changed since the operation was queued`,
      );
    }

    return appliedResult(operation, serverId, new Date().toISOString());
  }
  return service;
}

type VersionedEntity = {
  id: string;
  updatedAt?: string;
};

function findVersionedEntity(
  dashboard: DashboardData,
  entity: MobileSyncEntity,
  serverId: string,
): VersionedEntity | undefined {
  if (entity === "area") {
    return dashboard.areas.find((area) => area.id === serverId);
  }

  if (entity === "location") {
    return dashboard.locations.find((location) => location.id === serverId);
  }

  return dashboard.items.find((item) => item.id === serverId);
}

function appliedResult(
  operation: MobileSyncOperation,
  serverId: string,
  serverUpdatedAt: string,
): MobileSyncOperationResult {
  return removeUndefinedResultFields({
    clientOperationId: operation.clientOperationId,
    status: "applied",
    entity: operation.entity,
    localId: operation.localId,
    serverId,
    serverUpdatedAt,
  });
}

function conflictResult(
  operation: MobileSyncOperation,
  message: string,
): MobileSyncOperationResult {
  return removeUndefinedResultFields({
    clientOperationId: operation.clientOperationId,
    status: "conflict",
    entity: operation.entity,
    serverId: operation.serverId,
    message,
  });
}

function failedResult(
  operation: MobileSyncOperation,
  message: string,
): MobileSyncOperationResult {
  return removeUndefinedResultFields({
    clientOperationId: operation.clientOperationId,
    status: "failed",
    entity: operation.entity,
    serverId: operation.serverId,
    message,
  });
}

function requireAreaPayload(operation: MobileSyncOperation): MobileAreaPayload {
  if (!operation.payload || !("color" in operation.payload)) {
    throw new Error("area payload is required");
  }

  return operation.payload;
}

function requireLocationPayload(
  operation: MobileSyncOperation,
): MobileLocationPayload {
  if (!operation.payload || !("areaId" in operation.payload)) {
    throw new Error("location payload is required");
  }

  return operation.payload;
}

function requireItemPayload(operation: MobileSyncOperation): MobileItemPayload {
  if (!operation.payload || !("locationId" in operation.payload)) {
    throw new Error("item payload is required");
  }

  return operation.payload;
}

function requireServerId(operation: MobileSyncOperation) {
  if (!operation.serverId) {
    throw new Error("serverId is required");
  }

  return operation.serverId;
}

function requireBaseServerUpdatedAt(operation: MobileSyncOperation) {
  if (!operation.baseServerUpdatedAt) {
    throw new Error("baseServerUpdatedAt is required");
  }

  return operation.baseServerUpdatedAt;
}

function requireAtomicUpdateArea(
  repository: InventoryServiceDependencies["repository"],
) {
  if (!repository.updateAreaIfVersionMatches) {
    throw new Error("Conflict-aware area update is not available");
  }

  return repository.updateAreaIfVersionMatches;
}

function requireAtomicDeleteArea(
  repository: InventoryServiceDependencies["repository"],
) {
  if (!repository.deleteAreaIfVersionMatches) {
    throw new Error("Conflict-aware area delete is not available");
  }

  return repository.deleteAreaIfVersionMatches;
}

function requireAtomicUpdateLocation(
  repository: InventoryServiceDependencies["repository"],
) {
  if (!repository.updateLocationIfVersionMatches) {
    throw new Error("Conflict-aware location update is not available");
  }

  return repository.updateLocationIfVersionMatches;
}

function requireAtomicDeleteLocation(
  repository: InventoryServiceDependencies["repository"],
) {
  if (!repository.deleteLocationIfVersionMatches) {
    throw new Error("Conflict-aware location delete is not available");
  }

  return repository.deleteLocationIfVersionMatches;
}

function requireAtomicUpdateItem(
  repository: InventoryServiceDependencies["repository"],
) {
  if (!repository.updateItemIfVersionMatches) {
    throw new Error("Conflict-aware item update is not available");
  }

  return repository.updateItemIfVersionMatches;
}

function requireAtomicDeleteItem(
  repository: InventoryServiceDependencies["repository"],
) {
  if (!repository.deleteItemIfVersionMatches) {
    throw new Error("Conflict-aware item delete is not available");
  }

  return repository.deleteItemIfVersionMatches;
}

function readServerUpdatedAt(row: unknown) {
  if (row && typeof row === "object" && "updatedAt" in row) {
    const updatedAt = (row as { updatedAt?: unknown }).updatedAt;

    if (typeof updatedAt === "string" && updatedAt.trim()) {
      return updatedAt;
    }
  }

  return new Date().toISOString();
}

function removeUndefinedResultFields<T extends MobileSyncOperationResult>(
  result: T,
): T {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as T;
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
      createdBy: userId,
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
