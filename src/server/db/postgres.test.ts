import { describe, expect, it } from "vitest";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
} from "./postgres";

describe("createPostgresQueryClientFromEnv", () => {
  it("rejects missing DATABASE_URL", () => {
    expect(() => createPostgresQueryClientFromEnv({})).toThrow(
      new PostgresDatabaseNotConfiguredError(),
    );
  });

  it("rejects public database environment variables", () => {
    expect(() =>
      createPostgresQueryClientFromEnv({
        NEXT_PUBLIC_DATABASE_URL: "postgres://leaked.example/db",
      }),
    ).toThrow(new PostgresDatabaseNotConfiguredError());
  });

  it("delegates parameterized queries to a server-side pool", async () => {
    const queries: unknown[] = [];
    const createdPools: string[] = [];
    const client = createPostgresQueryClientFromEnv(
      { DATABASE_URL: "postgres://local-test.example/home_inventory" },
      {
        createPool: (connectionString) => {
          createdPools.push(connectionString);
          return {
            query: async (text, values) => {
              queries.push({ text, values });
              return { rows: [{ id: "row-1" }] };
            },
          };
        },
      },
    );

    await expect(
      client.query("select * from users where id = $1", ["user-1"]),
    ).resolves.toEqual({ rows: [{ id: "row-1" }] });

    expect(createdPools).toEqual([
      "postgres://local-test.example/home_inventory",
    ]);
    expect(queries).toEqual([
      {
        text: "select * from users where id = $1",
        values: ["user-1"],
      },
    ]);
  });

  it("runs a callback on one checked-out connection and always commits or rolls back", async () => {
    const statements: string[] = [];
    let released = 0;
    const client = createPostgresQueryClientFromEnv(
      { DATABASE_URL: "postgres://transaction-test.example/home_inventory" },
      {
        createPool: () => ({
          query: async () => ({ rows: [] }),
          connect: async () => ({
            query: async (text: string) => { statements.push(text); return { rows: [] }; },
            release: () => { released += 1; },
          }),
        }),
      },
    );

    await expect(client.transaction?.(async (transaction) => {
      await transaction.query("select pg_advisory_xact_lock($1)", [1]);
      return "done";
    })).resolves.toBe("done");
    expect(statements).toEqual(["begin", "select pg_advisory_xact_lock($1)", "commit"]);
    expect(released).toBe(1);
  });
});
