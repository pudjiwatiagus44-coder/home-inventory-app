import { AUTH_SESSION_COOKIE } from "../api/auth/route-helpers";
import { createRouteAuthService } from "../api/auth/route-helpers";

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};

type AppAuthService = {
  getCurrentUser: (
    sessionToken: string,
  ) => Promise<{ userId: string; email: string } | null>;
};

type AppAuthServiceFactory = () => AppAuthService;

export async function resolveSelfHostedAppUser(
  cookieStore: CookieStore,
  createAuthService: AppAuthServiceFactory = createRouteAuthService,
) {
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? "";

  if (!sessionToken) {
    return null;
  }

  try {
    return await createAuthService().getCurrentUser(sessionToken);
  } catch (error) {
    if (isPostgresAuthNotReadyError(error)) {
      return null;
    }

    throw error;
  }
}

function isPostgresAuthNotReadyError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "PostgresDatabaseNotConfiguredError" ||
      error.name === "PostgresAuthRepositoryNotConnectedError" ||
      error.message === "DATABASE_URL is required for PostgreSQL auth" ||
      error.message === "PostgreSQL auth repository is not connected yet")
  );
}
