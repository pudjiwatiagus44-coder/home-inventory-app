export type PostgresIntegrationEnv = {
  TEST_DATABASE_URL?: string;
  NEXT_PUBLIC_TEST_DATABASE_URL?: string;
  [key: string]: string | undefined;
};

export type PostgresIntegrationConfig =
  | {
      enabled: false;
      reason: string;
    }
  | {
      enabled: true;
      connectionString: string;
    };

export class PostgresIntegrationDatabaseUnsafeError extends Error {
  constructor(databaseName: string) {
    super(
      `TEST_DATABASE_URL must point to a test database; got "${databaseName}"`,
    );
    this.name = "PostgresIntegrationDatabaseUnsafeError";
  }
}

export function getPostgresIntegrationConfig(
  env: PostgresIntegrationEnv = process.env,
): PostgresIntegrationConfig {
  const connectionString = env.TEST_DATABASE_URL?.trim();

  if (!connectionString) {
    return {
      enabled: false,
      reason: "TEST_DATABASE_URL is not configured",
    };
  }

  const databaseName = getDatabaseName(connectionString);

  if (!isTestDatabaseName(databaseName)) {
    throw new PostgresIntegrationDatabaseUnsafeError(databaseName);
  }

  return {
    enabled: true,
    connectionString,
  };
}

function getDatabaseName(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const databaseName = url.pathname.split("/").filter(Boolean).at(-1);
    return databaseName ?? "";
  } catch {
    throw new PostgresIntegrationDatabaseUnsafeError("unparseable-url");
  }
}

function isTestDatabaseName(databaseName: string) {
  return /(^|[_-])test($|[_-])|_test$/i.test(databaseName);
}
