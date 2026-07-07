# Local PostgreSQL Test Runbook

This runbook is for local or disposable test databases only. Do not point these commands at production.

## Safety Rules

- Use a database name that clearly contains `test`, such as `home_inventory_test`.
- Never commit real `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, database passwords, or private keys.
- Do not use a production database user for local integration tests.
- The integration tests reset the `public` schema when `TEST_DATABASE_URL` is enabled.

## Required Environment Variables

Use local shell variables or `.env.local`; do not commit actual values.

```powershell
$env:TEST_DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/home_inventory_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:SESSION_SECRET="replace-with-a-long-local-random-secret"
```

`TEST_DATABASE_URL` must point to a database whose name looks like a test database. The code rejects names that do not contain `test`.

## Schema

The integration tests apply the schema from:

```text
dev-docs/sql/mainland_initial_schema.sql
```

Manual schema setup is optional for tests because the integration test reset helper drops and recreates `public`, then runs the schema SQL.

## Verification Commands

```powershell
npm run test:postgres
npm test
npm run lint
npm run build
```

Expected `npm run test:postgres` behavior:

- Without `TEST_DATABASE_URL`: test files load, real database cases are skipped.
- With a safe test database URL: auth register/login/logout and inventory A/B negative integration flows run against PostgreSQL.

## Current Local Machine Status

As of 2026-07-07 in the current workspace:

- PostgreSQL was installed locally with Scoop: `postgresql` 18.4-2.
- PostgreSQL tools are available under the Scoop app path: `%USERPROFILE%\scoop\apps\postgresql\current\bin`.
- The local PostgreSQL data directory is `%USERPROFILE%\scoop\apps\postgresql\current\data`.
- The local PostgreSQL server was started on `localhost:5432`.
- Disposable test database `home_inventory_test` was created.
- Local integration verification used local process/user environment variables; no real database URL, database password, or session secret was committed.
- User-level local environment variables were configured for this Windows profile: `TEST_DATABASE_URL`, `DATABASE_URL`, and `SESSION_SECRET`.
- `npm run test:postgres` is intentionally configured with `--no-file-parallelism` because each PostgreSQL integration file resets the same disposable `public` schema.

Start or stop the local server with:

```powershell
$pgData = "$env:USERPROFILE\scoop\apps\postgresql\current\data"
pg_ctl -D $pgData start
pg_ctl -D $pgData stop
```

For this local Scoop install, the default local superuser is `postgres`. Keep any local connection string in the shell or `.env.local` only.
