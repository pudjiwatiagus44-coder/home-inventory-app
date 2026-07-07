import { NextResponse, type NextRequest } from "next/server";
import {
  createAuthService,
  DuplicateEmailError,
  InvalidCredentialsError,
} from "../../../server/auth/auth-service";
import {
  createPostgresAuthRepository,
  PostgresAuthRepositoryNotConnectedError,
} from "../../../server/auth/postgres-auth-repository";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../server/db/postgres";
import type { createAuthService as createAuthServiceType } from "../../../server/auth/auth-service";

export const AUTH_SESSION_COOKIE = "home_inventory_session";

type JsonBody = {
  email?: unknown;
  password?: unknown;
};

export async function readAuthCredentials(request: NextRequest) {
  const body = (await request.json()) as JsonBody;

  return {
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
  };
}

type RouteAuthServiceOverrides = PostgresQueryClientFactoryOptions &
  Partial<Parameters<typeof createAuthServiceType>[0]>;

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthServiceType>,
  "getCurrentUser"
>;

export function createRouteAuthService(
  env: PostgresEnv = process.env,
  overrides: RouteAuthServiceOverrides = {},
) {
  const queryClient = createPostgresQueryClientFromEnv(env, {
    createPool: overrides.createPool,
  });

  return createAuthService({
    repository: createPostgresAuthRepository(queryClient),
    hashPassword: overrides.hashPassword,
    verifyPassword: overrides.verifyPassword,
    createSessionToken: overrides.createSessionToken,
    hashSessionToken: overrides.hashSessionToken,
    createSessionExpiry: overrides.createSessionExpiry,
  });
}

export function createAuthSuccessResponse(input: {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}) {
  const response = NextResponse.json({
    ok: true,
    userId: input.userId,
  });

  response.cookies.set(AUTH_SESSION_COOKIE, input.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: input.expiresAt,
  });

  return response;
}

export async function getCurrentUserFromRequest(
  request: NextRequest,
  authService?: CurrentUserAuthService,
) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value ?? "";

  if (!sessionToken) {
    return null;
  }

  const service = authService ?? createRouteAuthService();
  return service.getCurrentUser(sessionToken);
}

export function createLogoutSuccessResponse() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export function createAuthErrorResponse(error: unknown) {
  if (error instanceof PostgresAuthRepositoryNotConnectedError) {
    return NextResponse.json(
      {
        ok: false,
        message: "PostgreSQL auth repository is not connected yet",
      },
      { status: 501 },
    );
  }

  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      {
        ok: false,
        message: "DATABASE_URL is required for PostgreSQL auth",
      },
      { status: 501 },
    );
  }

  if (error instanceof DuplicateEmailError) {
    return NextResponse.json(
      { ok: false, message: "Email is already registered" },
      { status: 409 },
    );
  }

  if (error instanceof InvalidCredentialsError) {
    return NextResponse.json(
      { ok: false, message: "Invalid email or password" },
      { status: 401 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown auth error" },
    { status: 500 },
  );
}
