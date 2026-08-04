import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../../auth/route-helpers";
import { createRouteInventoryService } from "../../../inventory/route-helpers";
import {
  parseMobileSyncRequest,
  type MobileSyncOperation,
  type MobileSyncResponse,
} from "../../../../../features/inventory/mobile-sync";
import {
  PostgresInventoryRepositoryNotConnectedError,
} from "../../../../../features/inventory/inventory-repository";
import type { createAuthService } from "../../../../../server/auth/auth-service";
import {
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../../../server/db/postgres";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type MobileInventorySyncService = {
  syncQueuedOperationsForCurrentUser(input: {
    userId: string;
    operations: MobileSyncOperation[];
  }): Promise<Omit<MobileSyncResponse, "ok">>;
};

type MobileSyncDependencies = {
  authService?: CurrentUserAuthService;
  inventoryService?: MobileInventorySyncService;
  env?: PostgresEnv;
  createPool?: PostgresQueryClientFactoryOptions["createPool"];
};

function createRouteMobileInventorySyncService(
  env: PostgresEnv = process.env,
  overrides: PostgresQueryClientFactoryOptions = {},
): MobileInventorySyncService {
  return createRouteInventoryService(env, overrides);
}

export function createMobileSyncHandlers(
  dependencies: MobileSyncDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
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

        const syncRequest = parseMobileSyncRequest(await request.json());
        const service =
          dependencies.inventoryService ??
          createRouteMobileInventorySyncService(dependencies.env, {
            createPool: dependencies.createPool,
          });
        const data = await service.syncQueuedOperationsForCurrentUser({
          userId: currentUser.userId,
          operations: syncRequest.operations,
        });

        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return createMobileSyncErrorResponse(error);
      }
    },
  };
}

function createMobileSyncErrorResponse(error: unknown) {
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
    { ok: false, message: "Unknown mobile inventory sync error" },
    { status: 500 },
  );
}
