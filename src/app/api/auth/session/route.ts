import { NextResponse, type NextRequest } from "next/server";
import { createSessionExpiry } from "../../../../server/auth/session-security";
import {
  AUTH_SESSION_COOKIE,
  createRouteAuthService,
  createSessionRefreshResponse,
} from "../route-helpers";

type SessionAuthService = Pick<
  ReturnType<typeof createRouteAuthService>,
  "getCurrentUser"
>;

type SessionHandlerDependencies = {
  authService?: SessionAuthService;
  now?: () => Date;
};

function createAuthenticationRequiredResponse() {
  return NextResponse.json(
    { ok: false, message: "Authentication required" },
    { status: 401 },
  );
}

export function createSessionHandlers(
  dependencies: SessionHandlerDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      const sessionToken =
        request.cookies.get(AUTH_SESSION_COOKIE)?.value ?? "";

      if (!sessionToken) {
        return createAuthenticationRequiredResponse();
      }

      const authService = dependencies.authService ?? createRouteAuthService();
      const user = await authService.getCurrentUser(sessionToken);

      if (!user) {
        return createAuthenticationRequiredResponse();
      }

      const now = dependencies.now?.() ?? new Date();
      return createSessionRefreshResponse({
        sessionToken,
        expiresAt: createSessionExpiry(now),
      });
    },
  };
}

export const { POST } = createSessionHandlers();
