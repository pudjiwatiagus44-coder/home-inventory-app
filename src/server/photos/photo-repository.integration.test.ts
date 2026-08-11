import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAuthService } from "../auth/auth-service";
import { createPostgresAuthRepository } from "../auth/postgres-auth-repository";
import { getPostgresIntegrationConfig } from "../db/postgres-integration-config";
import { createPostgresPhotoRepository } from "./photo-repository";
import { createPostgresInventoryRepository } from "../../features/inventory/inventory-repository";

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

describe("PostgreSQL photo repository integration", () => {
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
    "stores, replaces, reads and clears area and location photo keys",
    async () => {
      if (!pool) {
        throw new Error("PostgreSQL integration pool was not initialized");
      }

      const authService = createAuthService({
        repository: createPostgresAuthRepository(pool),
        hashPassword: async (password) => `hash:${password}`,
        verifyPassword: async (password, passwordHash) =>
          passwordHash === `hash:${password}`,
        createSessionToken: () => "photo-repository-token",
        hashSessionToken: (token) => `hashed:${token}`,
        createSessionExpiry: () => new Date("2030-01-01T00:00:00.000Z"),
      });
      const inventoryRepository = createPostgresInventoryRepository(pool);
      const photoRepository = createPostgresPhotoRepository(pool);

      const user = await authService.register({
        email: "photo-repo@example.com",
        password: "valid-password",
      });
      const dashboard = await inventoryRepository.getDashboardForUser(
        user.userId,
      );
      if (!dashboard) {
        throw new Error("Default household was not created");
      }
      const householdId = dashboard.household.id;
      const area = await inventoryRepository.createArea({
        householdId,
        name: "Kitchen",
        color: "#256f6b",
      });
      const location = await inventoryRepository.createLocation({
        householdId,
        name: "Shelf",
        areaId: area.id,
      });

      await expect(
        photoRepository.updateAreaPhotoKey({
          areaId: area.id,
          householdId,
          photoKey: "area_1.jpg",
        }),
      ).resolves.toEqual({
        photoKey: "area_1.jpg",
        previousPhotoKey: null,
      });
      await expect(
        photoRepository.getAreaPhotoKey({ areaId: area.id, householdId }),
      ).resolves.toBe("area_1.jpg");
      await expect(
        photoRepository.updateAreaPhotoKey({
          areaId: area.id,
          householdId,
          photoKey: "area_2.jpg",
        }),
      ).resolves.toEqual({
        photoKey: "area_2.jpg",
        previousPhotoKey: "area_1.jpg",
      });
      await expect(
        photoRepository.clearAreaPhotoKey({ areaId: area.id, householdId }),
      ).resolves.toBe("area_2.jpg");
      await expect(
        photoRepository.getAreaPhotoKey({ areaId: area.id, householdId }),
      ).resolves.toBeNull();

      await expect(
        photoRepository.updateLocationPhotoKey({
          locationId: location.id,
          householdId,
          photoKey: "location_1.jpg",
        }),
      ).resolves.toEqual({
        photoKey: "location_1.jpg",
        previousPhotoKey: null,
      });
      await expect(
        photoRepository.listLocationPhotoKeysForArea({
          areaId: area.id,
          householdId,
        }),
      ).resolves.toEqual(["location_1.jpg"]);
      await expect(
        photoRepository.clearLocationPhotoKey({
          locationId: location.id,
          householdId,
        }),
      ).resolves.toBe("location_1.jpg");
    },
  );

  test.skipIf(integrationConfig.enabled)(
    `skips until ${integrationConfig.enabled ? "" : integrationConfig.reason}`,
    () => {
      expect(integrationConfig.enabled).toBe(false);
    },
  );
});

async function resetPublicSchema(pool: IntegrationPool) {
  const schemaSql = await readFile(
    path.join(process.cwd(), "dev-docs/sql/mainland_initial_schema.sql"),
    "utf8",
  );

  await pool.query("drop schema public cascade");
  await pool.query("create schema public");
  await pool.query(schemaSql);
}
