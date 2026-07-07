import {
  validateAreaInput,
  validateInventoryItemInput,
  validateLocationInput,
  type AreaInput,
  type InventoryItemInput,
  type LocationInput,
} from "./inventory-actions";
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
  return {
    async createAreaForCurrentUser(input: AreaInput & { userId: string }) {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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

      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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
      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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

      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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

      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

      if (
        !dashboard.locations.some(
          (location) => location.id === input.locationId,
        )
      ) {
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
      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

      if (
        !dashboard.locations.some(
          (location) => location.id === input.locationId,
        )
      ) {
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

      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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

      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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
      const dashboard = await repository.getDashboardForUser(input.userId);

      if (!dashboard) {
        throw new CurrentUserHouseholdNotFoundError();
      }

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
