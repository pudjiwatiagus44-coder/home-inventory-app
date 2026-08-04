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
import type { DashboardData } from "./dashboard-data";
import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";

export type InventoryRepository = {
  getDashboardForUser: (userId: string) => Promise<DashboardData | null>;
  createArea: (
    input: AreaInput & { householdId: string },
  ) => ReturnType<typeof createInventoryArea>;
  updateArea: (
    input: AreaInput & { householdId: string; areaId: string },
  ) => ReturnType<typeof updateInventoryArea>;
  deleteArea: (input: {
    householdId: string;
    areaId: string;
  }) => ReturnType<typeof deleteInventoryArea>;
  createLocation: (
    input: LocationInput & { householdId: string },
  ) => ReturnType<typeof createInventoryLocation>;
  updateLocation: (
    input: LocationInput & { householdId: string; locationId: string },
  ) => ReturnType<typeof updateInventoryLocation>;
  deleteLocation: (input: {
    householdId: string;
    locationId: string;
  }) => ReturnType<typeof deleteInventoryLocation>;
  createItem: (
    input: InventoryItemInput & { householdId: string },
  ) => ReturnType<typeof createInventoryItem>;
  updateItem: (
    input: InventoryItemInput & { householdId: string; itemId: string },
  ) => ReturnType<typeof updateInventoryItem>;
  deleteItem: (input: {
    householdId: string;
    itemId: string;
  }) => ReturnType<typeof deleteInventoryItem>;
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
    getDashboardForUser: async (userId) => {
      const householdResult = await client.query<{
        id: string;
        name: string;
      }>(
        `
          select households.id, households.name
          from household_members
          join households on households.id = household_members.household_id
          where household_members.user_id = $1
          order by household_members.created_at asc
          limit 1
        `,
        [userId],
      );
      const household = householdResult.rows[0];

      if (!household) {
        return null;
      }

      const [areasResult, locationsResult, itemsResult] = await Promise.all([
        client.query<DashboardData["areas"][number]>(
          `
            select id, name, color, updated_at as "updatedAt"
            from areas
            where household_id = $1
            order by sort_order asc, created_at asc
          `,
          [household.id],
        ),
        client.query<DashboardData["locations"][number]>(
          `
            select id, name, area_id, updated_at as "updatedAt"
            from locations
            where household_id = $1
            order by sort_order asc, created_at asc
          `,
          [household.id],
        ),
        client.query<DashboardData["items"][number]>(
          `
            select id, name, note, expire_date, location_id, updated_at as "updatedAt"
            from items
            where household_id = $1
            order by created_at desc
          `,
          [household.id],
        ),
      ]);

      return {
        household,
        areas: areasResult.rows,
        locations: locationsResult.rows,
        items: itemsResult.rows,
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
      }>(
        `
          insert into areas (household_id, name, color)
          values ($1, $2, $3)
          returning id, name, color
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

      return area;
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
      }>(
        `
          update areas
          set
            name = $3,
            color = $4,
            updated_at = now()
          where id = $1
            and household_id = $2
          returning id, name, color
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

      return area;
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
    createLocation: async (input) => {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{ id: string; name: string }>(
        `
          insert into locations (household_id, area_id, name)
          values ($1, $2, $3)
          returning id, name
        `,
        [
          input.householdId,
          validation.value.areaId,
          validation.value.name,
        ],
      );
      const location = result.rows[0];

      if (!location) {
        throw new Error("locations insert did not return a row");
      }

      return location;
    },
    updateLocation: async (input) => {
      const validation = validateLocationInput(input);

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const result = await client.query<{ id: string; name: string }>(
        `
          update locations
          set
            area_id = $3,
            name = $4,
            updated_at = now()
          where id = $1
            and household_id = $2
          returning id, name
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

      return location;
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
          returning id, name, note, expire_date, location_id
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

      return item;
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
          returning id, name, note, expire_date, location_id
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

      return item;
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
    deleteArea: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    createLocation: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateLocation: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteLocation: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    createItem: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    updateItem: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
    deleteItem: async () => {
      throw new PostgresInventoryRepositoryNotConnectedError();
    },
  };
}
