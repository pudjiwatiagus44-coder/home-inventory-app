import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createAuthErrorResponse,
  createRoutePasswordResetService,
} from "../route-helpers";
import type { PasswordResetService } from "../../../../server/auth/password-reset-service";

type ResetPasswordHandlerDependencies = {
  service?: PasswordResetService;
};

export function createResetPasswordHandler(
  deps: ResetPasswordHandlerDependencies = {},
) {
  const service = deps.service ?? createRoutePasswordResetService();

  return async function POST(request: NextRequest) {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        token?: unknown;
        password?: unknown;
      };
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!token) {
        return NextResponse.json(
          { ok: false, message: "重置链接无效或已过期" },
          { status: 400 },
        );
      }

      await service.resetPassword({ token, password });

      return NextResponse.json({ ok: true });
    } catch (error) {
      return createAuthErrorResponse(error);
    }
  };
}
