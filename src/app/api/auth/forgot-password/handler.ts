import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createAuthErrorResponse,
  createRoutePasswordResetService,
} from "../route-helpers";
import {
  createForgotPasswordRateLimiter,
  type ForgotPasswordRateLimiter,
} from "../../../../server/auth/forgot-password-rate-limiter";
import type { PasswordResetService } from "../../../../server/auth/password-reset-service";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultRateLimiter = createForgotPasswordRateLimiter();

type ForgotPasswordHandlerDependencies = {
  service?: PasswordResetService;
  rateLimiter?: ForgotPasswordRateLimiter;
};

export function createForgotPasswordHandler(
  deps: ForgotPasswordHandlerDependencies = {},
) {
  return async function POST(request: NextRequest) {
    try {
      const service = deps.service ?? createRoutePasswordResetService();
      const rateLimiter = deps.rateLimiter ?? defaultRateLimiter;
      const body = (await request.json().catch(() => ({}))) as {
        email?: unknown;
      };
      const email = typeof body.email === "string" ? body.email.trim() : "";

      if (!EMAIL_PATTERN.test(email)) {
        return NextResponse.json(
          { ok: false, message: "请输入有效邮箱" },
          { status: 400 },
        );
      }

      const forwardedFor = request.headers.get("x-forwarded-for");
      const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
      rateLimiter.check(`${email.toLowerCase()}|${clientIp}`);

      await service.requestPasswordReset(email);

      return NextResponse.json({ ok: true });
    } catch (error) {
      return createAuthErrorResponse(error);
    }
  };
}
