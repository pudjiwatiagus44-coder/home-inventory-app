import {
  AreaInput,
  createInventoryArea,
  createInventoryItem,
  createInventoryLocation,
  deleteInventoryArea,
  deleteInventoryLocation,
  deleteInventoryItem,
  InventoryActionClient,
  InventoryItemInput,
  LocationInput,
  validateAreaInput,
  validateInventoryItemInput,
  validateLocationInput,
  updateInventoryArea,
  updateInventoryItem,
  updateInventoryLocation,
} from "./inventory-actions";
import type {
  AreaRow,
  DashboardData,
  ItemRow,
  LocationRow,
} from "./dashboard-data";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";

type VersionMatchInput = {
  baseServerUpdatedAt: string;
};

type VersionedAreaRow = AreaRow & { updatedAt: string };
type VersionedLocationRow = LocationRow & { updatedAt: string };
type VersionedItemRow = ItemRow & { updatedAt: string };

export type InventoryRepository = {
  getDashboardForUser: (
    userId: string,
    householdId?: string,
  ) => Promise<DashboardData | null>;
  createArea: (
    input: AreaInput & { householdId: string },
  ) => ReturnType<typeof createInventoryArea>;
  updateArea: (
    input: AreaInput & { householdId: string; areaId: string },
  ) => ReturnType<typeof updateInventoryArea>;
  updateAreaIfVersionMatches?: (
    input: AreaInput & {
      householdId: string;
      areaId: string;
    } & VersionMatchInput,
  ) => Promise<VersionedAreaRow | null>;
  deleteArea: (input: {
    householdId: string;
    areaId: string;
  }) => ReturnType<typeof deleteInventoryArea>;
  deleteAreaIfVersionMatches?: (
    input: {
      householdId: string;
      areaId: string;
    } & VersionMatchInput,
  ) => Promise<boolean>;
  createLocation: (
    input: LocationInput & { householdId: string; createdBy?: string },
  ) => ReturnType<typeof createInventoryLocation>;
  updateLocation: (
    input: LocationInput & { householdId: string; locationId: string },
  ) => ReturnType<typeof updateInventoryLocation>;
  updateLocationIfVersionMatches?: (
    input: LocationInput & {
      householdId: string;
      locationId: string;
    } & VersionMatchInput,
  ) => Promise<VersionedLocationRow | null>;
  deleteLocation: (input: {
    householdId: string;
    locationId: string;
  }) => ReturnType<typeof deleteInventoryLocation>;
  deleteLocationIfVersionMatches?: (
    input: {
      householdId: string;
      locationId: string;
    } & VersionMatchInput,
  ) => Promise<boolean>;
  createItem: (
    input: InventoryItemInput & { householdId: string },
  ) => ReturnType<typeof createInventoryItem>;
  updateItem: (
    input: InventoryItemInput & { householdId: string; itemId: string },
  ) => ReturnType<typeof updateInventoryItem>;
  updateItemIfVersionMatches?: (
    input: InventoryItemInput & {
      householdId: string;
      itemId: string;
    } & VersionMatchInput,
  ) => Promise<VersionedItemRow | null>;
  deleteItem: (input: {
    householdId: string;
    itemId: string;
  }) => ReturnType<typeof deleteInventoryItem>;
  deleteItemIfVersionMatches?: (
    input: {
      householdId: string;
      itemId: string;
    } & VersionMatchInput,
  ) => Promise<boolean>;
};

export function createSupabaseInventoryRepository(
  supabase: InventoryActionClient,
): InventoryRepository {
  return {
    getDashboardForUser: async () => {
      throw new Error("Supabase dashboard reads are still handled by AppDashboard");
    },
    createArea: (input) => createInventoryArea(supabase, input),
    updateArea: (input) => updateInventoryArea(supabase, input),
    deleteArea: (input) => deleteInventoryArea(supabase, input),
    createLocation: (input) => createInventoryLocation(supabase, input),
    updateLocation: (input) => updateInventoryLocation(supabase, input),
    deleteLocation: (input) => deleteInventoryLocation(supabase, input),
    createItem: (input) => createInventoryItem(supabase, input),
    updateItem: (input) => updateInventoryItem(supabase, input),
    deleteItem: (input) => deleteInventoryItem(supabase, input),
  };
}

export class PostgresInventoryRepositoryNotConnectedError extends Error {
  constructor() {
    super("PostgreSQL inventory repository is not connected yet");
    this.name = "PostgresInventoryRepositoryNotConnectedError";
  }
}

export function createPostgresInventoryRepository(
  client?: PostgresQueryClient,
): InventoryRepository {
  if (!client) {
    return createNotConnectedPostgresInventoryRepository();
  }

  return {
    getDashboardForUser: async (userId, householdId) => {
      const householdParams = householdId ? [userId, householdId] : [userId];
      const householdResult = await client.query<{
        id: string;
        name: string;
        role: "owner" | "member" | "contributor" | "readonly";
      }>(
        `
          select households.id, households.name, household_members.role
          from household_members
          join households on households.id = household_members.household_id
          where household_members.user_id = $1
          ${householdId ? "and household_members.household_id = $2" : ""}
          order by household_members.created_at asc
          limit 1
        `,
        householdParams,
      );
      const household = householdResult.rows[0];

      if (!household) {
        return null;
      }

      const [areasResult, locationsResult, itemsResult] = await Promise.all([
        client.query<PostgresAreaRow>(
          `
            select id, name, color, updated_at as "updatedAt"
            from areas
            where household_id = $1
            order by sort_order asc, created_at asc
          `,
          [household.id],
        ),
        client.query<PostgresLocationRow>(
          `
            select id, name, area_id, created_by as "createdBy", updated_at as "updatedAt"
            from locations
            where household_id = $1
            order by sort_order asc, created_at asc
          `,
          [household.id],
        ),
        client.query<PostgresItemRow>(
          `
            select id, name, note, expire_date, location_id, created_by as "createdBy", photo_key, updated_at as "updatedAt"
            from items
            where household_id = $1
            order by created_at desc
          `,
          [household.id],
        ),
      ]);

      return {
        household: {
          id: household.id,
          name: household.name,
          role: household.role,
        },
        areas: areasResult.rows.map(normalizeVersionedRow),
        locations: locationsResult.rows.map(normalizeVersionedRow),
        items: itemsResult.rows.map(normalizeVersionedRow),
      };
    },
    createArea: async (input) => {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{
        id: string;
        name: string;
        color: string;
        updatedAt: string;
      }>(
        `
          insert into areas (household_id, name, color)
          values ($1, $2, $3)
          returning id, name, color, updated_at as "updatedAt"
        `,
        [
          input.householdId,
          validation.value.name,
          validation.value.color,
        ],
      );
      const area = result.rows[0];

      if (!area) {
        throw new Error("areas insert did not return a row");
      }

      return normalizeVersionedRow(area);
    },
    updateArea: async (input) => {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{
        id: string;
        name: string;
        color: string;
        updatedAt: string;
      }>(
        `
          update areas
          set
            name = $3,
            color = $4,
            updated_at = now()
          where id = $1
            and household_id = $2
          returning id, name, color, updated_at as "updatedAt"
        `,
        [
          input.areaId,
          input.householdId,
          validation.value.name,
          validation.value.color,
        ],
      );
      const area = result.rows[0];

      if (!area) {
        throw new Error("areas update did not return a row");
      }

      return normalizeVersionedRow(area);
    },
    updateAreaIfVersionMatches: async (input) => {
      const validation = validateAreaInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<PostgresAreaRow>(
        `
          update areas
          set
            name = $3,
            color = $4,
            updated_at = now()
          where id = $1
            and household_id = $2
            and updated_at = $5::timestamptz
          returning id, name, color, updated_at as "updatedAt"
        `,
        [
          input.areaId,
          input.householdId,
          validation.value.name,
          validation.value.color,
          input.baseServerUpdatedAt,
        ],
      );
      const area = result.rows[0];

      return area
        ? normalizeRequiredVersionedRow(area, "areas versioned update")
        : null;
    },
    deleteArea: async (input) => {
      await client.query(
        `
          delete from areas
          where id = $1
            and household_id = $2
        `,
        [input.areaId, input.householdId],
      );
    },
    deleteAreaIfVersionMatches: async (input) => {
      const result = await client.query<{ id: string }>(
        `
          delete from areas
          where id = $1
            and household_id = $2
            and updated_at = $3::timestamptz
          returning id
        `,
        [input.areaId, input.householdId, input.baseServerUpdatedAt],
      );

      return result.rows.length > 0;
    },
    createLocation: async (input) => {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{
        id: string;
        name: string;
        area_id: string | null;
        createdBy: string | null;
        updatedAt: string;
      }>(
        `
          insert into locations (household_id, area_id, name, created_by)
          values ($1, $2, $3, $4)
          returning id, name, area_id, created_by as "createdBy", updated_at as "updatedAt"
        `,
        [
          input.householdId,
          validation.value.areaId,
          validation.value.name,
          input.createdBy ?? null,
        ],
      );
      const location = result.rows[0];

      if (!location) {
        throw new Error("locations insert did not return a row");
      }

      return normalizeVersionedRow(location);
    },
    updateLocation: async (input) => {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{
        id: string;
        name: string;
        area_id: string | null;
        createdBy: string | null;
        updatedAt: string;
      }>(
        `
          update locations
          set
            area_id = $3,
            name = $4,
            updated_at = now()
          where id = $1
            and household_id = $2
          returning id, name, area_id, created_by as "createdBy", updated_at as "updatedAt"
        `,
        [
          input.locationId,
          input.householdId,
          validation.value.areaId,
          validation.value.name,
        ],
      );
      const location = result.rows[0];

      if (!location) {
        throw new Error("locations update did not return a row");
      }

      return normalizeVersionedRow(location);
    },
    updateLocationIfVersionMatches: async (input) => {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<PostgresLocationRow>(
        `
          update locations
          set
            area_id = $3,
            name = $4,
            updated_at = now()
          where id = $1
            and household_id = $2
            and updated_at = $5::timestamptz
          returning id, name, area_id, created_by as "createdBy", updated_at as "updatedAt"
        `,
        [
          input.locationId,
          input.householdId,
          validation.value.areaId,
          validation.value.name,
          input.baseServerUpdatedAt,
        ],
      );
      const location = result.rows[0];

      return location
        ? normalizeRequiredVersionedRow(location, "locations versioned update")
        : null;
    },
    deleteLocation: async (input) => {
      await client.query(
        `
          delete from locations
          where id = $1
            and household_id = $2
        `,
        [input.locationId, input.householdId],
      );
    },
    deleteLocationIfVersionMatches: async (input) => {
      const result = await client.query<{ id: string }>(
        `
          delete from locations
          where id = $1
            and household_id = $2
            and updated_at = $3::timestamptz
          returning id
        `,
        [input.locationId, input.householdId, input.baseServerUpdatedAt],
      );

      return result.rows.length > 0;
    },
    createItem: async (input) => {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{
        id: string;
        name: string;
        note: string;
        expire_date: string | null;
        location_id: string | null;
        photo_key: string | null;
        createdBy: string | null;
        updatedAt: string;
      }>(
        `
          insert into items (
            household_id,
            location_id,
            name,
            note,
            expire_date,
            created_by
          )
          values ($1, $2, $3, $4, $5, $6)
          returning id, name, note, expire_date, location_id, created_by as "createdBy", photo_key, updated_at as "updatedAt"
        `,
        [
          input.householdId,
          validation.value.locationId,
          validation.value.name,
          validation.value.note,
          validation.value.expireDate,
          input.createdBy ?? null,
        ],
      );
      const item = result.rows[0];

      if (!item) {
        throw new Error("items insert did not return a row");
      }

      return normalizeVersionedRow(item);
    },
    updateItem: async (input) => {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{
        id: string;
        name: string;
        note: string;
        expire_date: string | null;
        location_id: string | null;
        photo_key: string | null;
        createdBy: string | null;
        updatedAt: string;
      }>(
        `
          update items
          set
            location_id = $3,
            name = $4,
            note = $5,
            expire_date = $6,
            updated_at = now()
          where id = $1
            and household_id = $2
          returning id, name, note, expire_date, location_id, created_by as "createdBy", photo_key, updated_at as "updatedAt"
        `,
        [
          input.itemId,
          input.householdId,
          validation.value.locationId,
          validation.value.name,
          validation.value.note,
          validation.value.expireDate,
        ],
      );
      const item = result.rows[0];

      if (!item) {
        throw new Error("items update did not return a row");
      }

      return normalizeVersionedRow(item);
    },
    updateItemIfVersionMatches: async (input) => {
      const validation = validateInventoryItemInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<PostgresItemRow>(
        `
          update items
          set
            location_id = $3,
            name = $4,
            note = $5,
            expire_date = $6,
            updated_at = now()
          where id = $1
            and household_id = $2
            and updated_at = $7::timestamptz
          returning id, name, note, expire_date, location_id, created_by as "createdBy", photo_key, updated_at as "updatedAt"
        `,
        [
          input.itemId,
          input.householdId,
          validation.value.locationId,
          validation.value.name,
          validation.value.note,
          validation.value.expireDate,
          input.baseServerUpdatedAt,
        ],
      );
      const item = result.rows[0];

      return item
        ? normalizeRequiredVersionedRow(item, "items versioned update")
        : null;
    },
    deleteItem: async (input) => {
      await client.query(
        `
          delete from items
          where id = $1
            and household_id = $2
        `,
        [input.itemId, input.householdId],
      );
    },
    deleteItemIfVersionMatches: async (input) => {
      const result = await client.query<{ id: string }>(
        `
          delete from items
          where id = $1
            and household_id = $2
            and updated_at = $3::timestamptz
          returning id
        `,
        [input.itemId, input.householdId, input.baseServerUpdatedAt],
      );

      return result.rows.length > 0;
    },
  };
}

function createNotConnectedPostgresInventoryRepository(): InventoryRepository {
  return {
    getDashboardForUser: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    createArea: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateArea: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateAreaIfVersionMatches: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteArea: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteAreaIfVersionMatches: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    createLocation: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateLocation: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateLocationIfVersionMatches: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteLocation: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteLocationIfVersionMatches: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    createItem: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateItem: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateItemIfVersionMatches: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteItem: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteItemIfVersionMatches: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
  };
}

type PostgresVersionedField = {
  updatedAt?: string | Date;
};

type PostgresAreaRow = Omit<AreaRow, "updatedAt"> & PostgresVersionedField;
type PostgresLocationRow = Omit<LocationRow, "updatedAt"> &
  PostgresVersionedField;
type PostgresItemRow = Omit<ItemRow, "updatedAt"> & PostgresVersionedField;

function normalizeVersionedRow<Row extends PostgresVersionedField>(
  row: Row,
): Omit<Row, "updatedAt"> & { updatedAt?: string } {
  const updatedAt = normalizeUpdatedAt(row.updatedAt);

  if (!updatedAt) {
    return row as Omit<Row, "updatedAt"> & { updatedAt?: string };
  }

  return { ...row, updatedAt };
}

function normalizeRequiredVersionedRow<Row extends PostgresVersionedField>(
  row: Row,
  label: string,
): Omit<Row, "updatedAt"> & { updatedAt: string } {
  const updatedAt = normalizeUpdatedAt(row.updatedAt);

  if (!updatedAt) {
    throw new Error(`${label} did not return updatedAt`);
  }

  return { ...row, updatedAt };
}

function normalizeUpdatedAt(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}
