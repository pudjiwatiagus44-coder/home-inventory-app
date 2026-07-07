import type { NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  createAuthErrorResponse,
  createLogoutSuccessResponse,
  createRouteAuthService,
} from "../route-helpers";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value;

    if (sessionToken) {
      await createRouteAuthService().logout(sessionToken);
    }

    return createLogoutSuccessResponse();
  } catch (error) {
    return createAuthErrorResponse(error);
  }
}
