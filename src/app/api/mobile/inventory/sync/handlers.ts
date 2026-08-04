import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../../auth/route-helpers";
import {
  parseMobileSyncRequest,
  type MobileSyncOperation,
  type MobileSyncResponse,
} from "../../../../../features/inventory/mobile-sync";
import type { createAuthService } from "../../../../../server/auth/auth-service";

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
};

class MobileInventorySyncServiceNotConnectedError extends Error {
  constructor() {
    super("Mobile inventory sync service is not connected yet");
    this.name = "MobileInventorySyncServiceNotConnectedError";
  }
}

function createRouteMobileInventorySyncService(): MobileInventorySyncService {
  return {
    async syncQueuedOperationsForCurrentUser() {
      throw new MobileInventorySyncServiceNotConnectedError();
    },
  };
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
          dependencies.inventoryService ?? createRouteMobileInventorySyncService();
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
  if (error instanceof MobileInventorySyncServiceNotConnectedError) {
    return NextResponse.json(
      { ok: false, message: error.message },
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
