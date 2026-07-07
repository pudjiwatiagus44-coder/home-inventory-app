import type { PostgresQueryClient } from "../auth/postgres-auth-repository";

type QueryResult<Row> = {
  rows: Row[];
};

export type PostgresEnv = {
  DATABASE_URL?: string;
  NEXT_PUBLIC_DATABASE_URL?: string;
  [key: string]: string | undefined;
};

type PoolLike = {
  query: <Row = unknown>(
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult<Row>>;
};

type FactoryOptions = {
  createPool?: (connectionString: string) => PoolLike;
};

export type PostgresQueryClientFactoryOptions = FactoryOptions;

export class PostgresDatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is required for PostgreSQL auth");
    this.name = "PostgresDatabaseNotConfiguredError";
  }
}

let cachedPool: PoolLike | null = null;
let cachedConnectionString: string | null = null;

export function createPostgresQueryClientFromEnv(
  env: PostgresEnv = process.env,
  { createPool = createPgPool }: FactoryOptions = {},
): PostgresQueryClient {
  const connectionString = env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new PostgresDatabaseNotConfiguredError();
  }

  return createPostgresQueryClient(connectionString, createPool);
}

function createPostgresQueryClient(
  connectionString: string,
  createPool: (connectionString: string) => PoolLike,
): PostgresQueryClient {
  return {
    query: async (text, values) => {
      const pool = getPool(connectionString, createPool);
      return pool.query(text, values);
    },
  };
}

function getPool(
  connectionString: string,
  createPool: (connectionString: string) => PoolLike,
) {
  if (cachedPool && cachedConnectionString === connectionString) {
    return cachedPool;
  }

  cachedPool = createPool(connectionString);
  cachedConnectionString = connectionString;
  return cachedPool;
}

function createPgPool(connectionString: string): PoolLike {
  let poolPromise: Promise<PoolLike> | null = null;

  async function getPool() {
    if (!poolPromise) {
      poolPromise = import("pg").then(({ Pool }) => {
        return new Pool({
          connectionString,
          max: 5,
        });
      });
    }

    return poolPromise;
  }

  return {
    query: async (text, values) => {
      const pool = await getPool();
      return pool.query(text, values);
    },
  };
}
