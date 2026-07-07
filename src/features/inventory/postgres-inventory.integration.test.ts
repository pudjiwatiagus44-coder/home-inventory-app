import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAuthService } from "../../server/auth/auth-service";
import { createPostgresAuthRepository } from "../../server/auth/postgres-auth-repository";
import { getPostgresIntegrationConfig } from "../../server/db/postgres-integration-config";
import {
  AreaOutsideCurrentHouseholdError,
  createInventoryService,
  ItemOutsideCurrentHouseholdError,
  LocationOutsideCurrentHouseholdError,
} from "./inventory-service";
import { createPostgresInventoryRepository } from "./inventory-repository";

const integrationConfig = getPostgresIntegrationConfig();

type IntegrationQueryResult<Row> = {
  rows: Row[];
};

type IntegrationPool = {
  query: <Row = unknown>(
    text: string,
    values?: unknown[],
  ) => Promise<IntegrationQueryResult<Row>>;
  end: () => Promise<void>;
};

describe("PostgreSQL inventory integration", () => {
  let pool: IntegrationPool | null = null;

  beforeAll(async () => {
    if (!integrationConfig.enabled) {
      return;
    }

    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: integrationConfig.connectionString });
    await resetPublicSchema(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  test.skipIf(!integrationConfig.enabled)(
    "persists the self-hosted inventory loop and rejects user B writes to user A data",
    async () => {
      if (!pool) {
        throw new Error("PostgreSQL integration pool was not initialized");
      }

      const authService = createAuthService({
        repository: createPostgresAuthRepository(pool),
        hashPassword: async (password) => `hash:${password}`,
        verifyPassword: async (password, passwordHash) =>
          passwordHash === `hash:${password}`,
        createSessionToken: createTokenSequence([
          "a-register-token",
          "b-register-token",
        ]),
        hashSessionToken: (token) => `hashed:${token}`,
        createSessionExpiry: () => new Date("2030-01-01T00:00:00.000Z"),
      });
      const inventoryService = createInventoryService({
        repository: createPostgresInventoryRepository(pool),
      });

      const userA = await authService.register({
        email: "a@example.com",
        password: "valid-password",
      });
      const userB = await authService.register({
        email: "b@example.com",
        password: "valid-password",
      });

      const areaA = await inventoryService.createAreaForCurrentUser({
        userId: userA.userId,
        name: "Kitchen",
        color: "#256f6b",
      });
      const locationA = await inventoryService.createLocationForCurrentUser({
        userId: userA.userId,
        name: "Shelf",
        areaId: areaA.id,
      });
      const itemA = await inventoryService.createItemForCurrentUser({
        userId: userA.userId,
        name: "Battery",
        note: "Spare",
        expireDate: "2030-01-02",
        locationId: locationA.id,
      });

      const dashboardA =
        await createPostgresInventoryRepository(pool).getDashboardForUser(
          userA.userId,
        );
      const dashboardB =
        await createPostgresInventoryRepository(pool).getDashboardForUser(
          userB.userId,
        );

      expect(dashboardA?.areas.map((area) => area.id)).toEqual([areaA.id]);
      expect(dashboardA?.locations.map((location) => location.id)).toEqual([
        locationA.id,
      ]);
      expect(dashboardA?.items.map((item) => item.id)).toEqual([itemA.id]);
      expect(dashboardB).toMatchObject({
        areas: [],
        locations: [],
        items: [],
      });

      await expect(
        inventoryService.createLocationForCurrentUser({
          userId: userB.userId,
          name: "Borrowed shelf",
          areaId: areaA.id,
        }),
      ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
      await expect(
        inventoryService.updateAreaForCurrentUser({
          userId: userB.userId,
          areaId: areaA.id,
          name: "Kitchen",
          color: "#64748b",
        }),
      ).rejects.toBeInstanceOf(AreaOutsideCurrentHouseholdError);
      await expect(
        inventoryService.updateLocationForCurrentUser({
          userId: userB.userId,
          locationId: locationA.id,
          name: "Shelf",
          areaId: null,
        }),
      ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
      await expect(
        inventoryService.createItemForCurrentUser({
          userId: userB.userId,
          name: "Battery",
          note: "",
          expireDate: null,
          locationId: locationA.id,
        }),
      ).rejects.toBeInstanceOf(LocationOutsideCurrentHouseholdError);
      await expect(
        inventoryService.updateItemForCurrentUser({
          userId: userB.userId,
          itemId: itemA.id,
          name: "Battery",
          note: "",
          expireDate: null,
          locationId: null,
        }),
      ).rejects.toBeInstanceOf(ItemOutsideCurrentHouseholdError);
      await expect(
        inventoryService.deleteItemForCurrentUser({
          userId: userB.userId,
          itemId: itemA.id,
        }),
      ).rejects.toBeInstanceOf(ItemOutsideCurrentHouseholdError);

      const stillOwnedByA =
        await createPostgresInventoryRepository(pool).getDashboardForUser(
          userA.userId,
        );
      expect(stillOwnedByA?.items).toHaveLength(1);
      expect(stillOwnedByA?.items[0]).toMatchObject({
        id: itemA.id,
        name: "Battery",
        note: "Spare",
        location_id: locationA.id,
      });
    },
  );

  test.skipIf(integrationConfig.enabled)(
    `skips until ${integrationConfig.enabled ? "" : integrationConfig.reason}`,
    () => {
      expect(integrationConfig.enabled).toBe(false);
    },
  );
});

function createTokenSequence(tokens: string[]) {
  return () => tokens.shift() ?? "unexpected-token";
}

async function resetPublicSchema(pool: IntegrationPool) {
  const schemaSql = await readFile(
    path.join(process.cwd(), "dev-docs/sql/mainland_initial_schema.sql"),
    "utf8",
  );

  await pool.query("drop schema public cascade");
  await pool.query("create schema public");
  await pool.query(schemaSql);
}
