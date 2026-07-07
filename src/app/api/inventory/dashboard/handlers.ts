import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import {
  createPostgresInventoryRepository,
  PostgresInventoryRepositoryNotConnectedError,
  type InventoryRepository,
} from "../../../../features/inventory/inventory-repository";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../../server/db/postgres";
import type { createAuthService } from "../../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type DashboardDependencies = {
  authService?: CurrentUserAuthService;
  inventoryRepository?: Pick<InventoryRepository, "getDashboardForUser">;
};

type DashboardServiceOverrides = PostgresQueryClientFactoryOptions;

export function createRouteDashboardRepository(
  env: PostgresEnv = process.env,
  overrides: DashboardServiceOverrides = {},
) {
  const queryClient = createPostgresQueryClientFromEnv(env, {
    createPool: overrides.createPool,
  });

  return createPostgresInventoryRepository(queryClient);
}

export function createDashboardHandlers(
  dependencies: DashboardDependencies = {},
) {
  return {
    async GET(request: NextRequest) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const repository =
          dependencies.inventoryRepository ?? createRouteDashboardRepository();
        const data = await repository.getDashboardForUser(currentUser.userId);

        if (!data) {
          return NextResponse.json(
            { ok: false, message: "No household found for current user" },
            { status: 404 },
          );
        }

        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return createDashboardErrorResponse(error);
      }
    },
  };
}

function createDashboardErrorResponse(error: unknown) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      {
        ok: false,
        message: "DATABASE_URL is required for PostgreSQL inventory",
      },
      { status: 501 },
    );
  }

  if (error instanceof PostgresInventoryRepositoryNotConnectedError) {
    return NextResponse.json(
      {
        ok: false,
        message: "PostgreSQL inventory repository is not connected yet",
      },
      { status: 501 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown inventory dashboard error" },
    { status: 500 },
  );
}
