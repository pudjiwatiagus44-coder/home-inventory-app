import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
} from "../../../../server/db/postgres";
import { parseBookkeepingSyncRequest } from "../../../../features/bookkeeping/bookkeeping-types";
import {
  createBookkeepingSyncService,
  UserHasNoBookkeepingAccountError,
  BookkeepingAccountNotOwnedError,
} from "../../../../features/bookkeeping/bookkeeping-service";
import type { createAuthService } from "../../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type BookkeepingSyncDependencies = {
  authService?: CurrentUserAuthService;
  env?: PostgresEnv;
};

export function createBookkeepingSyncHandlers(
  dependencies: BookkeepingSyncDependencies = {},
) {
  // 惰性创建：service 依赖 DATABASE_URL，构建期不应在模块顶层连库，故放到请求内延迟创建
  return {
    async POST(request: NextRequest) {
      try {
        const service = createBookkeepingSyncService({
          client: createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
        });

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

        const body = parseBookkeepingSyncRequest(await request.json());
        const userId = currentUser.userId;

        // 权限：若客户端指定了 accountId，校验其属于当前用户
        if (body.accountId) {
          const owned = await service.accountBelongsToUser(body.accountId, userId);
          if (!owned) {
            throw new BookkeepingAccountNotOwnedError();
          }
        }

        const result = await service.syncForCurrentUser({
          userId,
          operations: body.updates,
          since: body.since,
          accountId: body.accountId,
        });

        return NextResponse.json({
          ok: true,
          data: {
            accountId: result.accountId,
            cursor: result.data.cursor,
            changes: result.data.changes,
            conflicts: result.data.conflicts,
            results: result.data.results,
          },
        });
      } catch (error) {
        return createBookkeepingSyncErrorResponse(error);
      }
    },
  };
}

export function createBookkeepingSyncErrorResponse(error: unknown) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: "DATABASE_URL is required for bookkeeping sync" },
      { status: 501 },
    );
  }
  if (error instanceof UserHasNoBookkeepingAccountError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }
  if (error instanceof BookkeepingAccountNotOwnedError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }
  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: "Bookkeeping sync failed" },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { ok: false, message: "Unknown bookkeeping sync error" },
    { status: 500 },
  );
}
