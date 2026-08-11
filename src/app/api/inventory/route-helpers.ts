import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_SESSION_COOKIE,
  getCurrentUserFromRequest,
} from "../auth/route-helpers";
import {
  createInventoryService,
  AreaOutsideCurrentHouseholdError,
  ContributorAreaPermissionError,
  ContributorDeletePermissionError,
  ContributorOwnRecordPermissionError,
  CurrentUserHouseholdNotFoundError,
  ItemOutsideCurrentHouseholdError,
  ReadOnlyMemberError,
  LocationOutsideCurrentHouseholdError,
} from "../../../features/inventory/inventory-service";
import {
  createPostgresInventoryRepository,
  PostgresInventoryRepositoryNotConnectedError,
} from "../../../features/inventory/inventory-repository";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../server/db/postgres";
import type { createAuthService } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type InventoryRouteService = ReturnType<typeof createInventoryService>;

type JsonObject = Record<string, unknown>;

type MutationContext = {
  userId: string;
  householdId?: string;
  body: JsonObject;
  service: InventoryRouteService;
};

export type InventoryMutationDependencies = {
  authService?: CurrentUserAuthService;
  inventoryService?: InventoryRouteService;
};

type RouteInventoryServiceOverrides = PostgresQueryClientFactoryOptions;

export function createRouteInventoryService(
  env: PostgresEnv = process.env,
  overrides: RouteInventoryServiceOverrides = {},
) {
  const queryClient = createPostgresQueryClientFromEnv(env, {
    createPool: overrides.createPool,
  });

  return createInventoryService({
    repository: createPostgresInventoryRepository(queryClient),
  });
}

export async function runInventoryMutation<T>(
  request: NextRequest,
  mutation: (context: MutationContext) => Promise<T>,
  dependencies: InventoryMutationDependencies = {},
) {
  try {
    const currentUser = await getCurrentUserFromRequest(
      request,
      dependencies.authService,
    );

    if (!currentUser) {
      return createInventoryUnauthorizedResponse();
    }

    const body = await readJsonObject(request);
    const householdId = selectedHouseholdId(request, body);
    const data = await mutation({
      userId: currentUser.userId,
      householdId,
      body,
      get service() {
        return dependencies.inventoryService ?? createRouteInventoryService();
      },
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return createInventoryErrorResponse(error);
  }
}

function createInventoryUnauthorizedResponse() {
  return NextResponse.json(
    { ok: false, message: "Authentication required" },
    { status: 401 },
  );
}

async function readJsonObject(request: NextRequest): Promise<JsonObject> {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  const body = JSON.parse(text) as unknown;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  return body as JsonObject;
}

function createInventoryErrorResponse(error: unknown) {
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

  if (error instanceof CurrentUserHouseholdNotFoundError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 404 },
    );
  }

  if (
    error instanceof AreaOutsideCurrentHouseholdError ||
    error instanceof LocationOutsideCurrentHouseholdError ||
    error instanceof ItemOutsideCurrentHouseholdError
  ) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }

  if (error instanceof ReadOnlyMemberError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }

  if (
    error instanceof ContributorAreaPermissionError ||
    error instanceof ContributorOwnRecordPermissionError ||
    error instanceof ContributorDeletePermissionError
  ) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown inventory error" },
    { status: 500 },
  );
}

export function textField(body: JsonObject, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

export function optionalTextField(body: JsonObject, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

function selectedHouseholdId(request: NextRequest, body: JsonObject) {
  const bodyValue = body.householdId;
  if (typeof bodyValue === "string" && bodyValue.trim()) {
    return bodyValue;
  }

  const queryValue = request.nextUrl.searchParams.get("householdId");
  return queryValue?.trim() || undefined;
}

export { AUTH_SESSION_COOKIE };
