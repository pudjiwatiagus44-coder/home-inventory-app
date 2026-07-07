import { describe, expect, test } from "vitest";

import {
  PostgresIntegrationDatabaseUnsafeError,
  getPostgresIntegrationConfig,
} from "./postgres-integration-config";

describe("getPostgresIntegrationConfig", () => {
  test("skips when TEST_DATABASE_URL is missing", () => {
    const config = getPostgresIntegrationConfig({});

    expect(config).toEqual({
      enabled: false,
      reason: "TEST_DATABASE_URL is not configured",
    });
  });

  test("does not use public database environment variables", () => {
    const config = getPostgresIntegrationConfig({
      NEXT_PUBLIC_TEST_DATABASE_URL: "postgres://local-test.example/app_test",
    });

    expect(config).toEqual({
      enabled: false,
      reason: "TEST_DATABASE_URL is not configured",
    });
  });

  test("rejects database names that do not look like test databases", () => {
    expect(() =>
      getPostgresIntegrationConfig({
        TEST_DATABASE_URL: "postgres://local.example/home_inventory",
      }),
    ).toThrow(PostgresIntegrationDatabaseUnsafeError);
  });

  test("accepts explicit test database URLs", () => {
    const config = getPostgresIntegrationConfig({
      TEST_DATABASE_URL: "postgres://local.example/home_inventory_test",
    });

    expect(config).toEqual({
      enabled: true,
      connectionString: "postgres://local.example/home_inventory_test",
    });
  });
});
