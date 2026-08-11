import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../auth/route-helpers";
import {
  createFeedbackRateLimiter,
  FeedbackRateLimitExceededError,
} from "../../../server/feedback/feedback-rate-limiter";
import {
  createFeedbackService,
  type FeedbackService,
} from "../../../server/feedback/feedback-service";
import {
  createSmtpMailer,
  SmtpNotConfiguredError,
  SmtpSendFailedError,
} from "../../../server/mail/smtp-mailer";
import type { createAuthService as createAuthServiceType } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthServiceType>,
  "getCurrentUser"
>;

type FeedbackHandlerDependencies = {
  authService?: CurrentUserAuthService;
  service?: FeedbackService;
  rateLimiter?: ReturnType<typeof createFeedbackRateLimiter>;
  to?: string;
};

const defaultRateLimiter = createFeedbackRateLimiter();

export function createFeedbackHandlers(
  deps: FeedbackHandlerDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          deps.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          message?: unknown;
          source?: unknown;
          appVersion?: unknown;
        };
        const message =
          typeof body.message === "string" ? body.message.trim() : "";
        const source =
          body.source === "android" ? "android" : ("web" as const);
        const appVersion =
          typeof body.appVersion === "string" ? body.appVersion : undefined;

        if (!message || message.length > 2000) {
          return NextResponse.json(
            { ok: false, message: "反馈内容需为 1-2000 个字符" },
            { status: 400 },
          );
        }

        const rateLimiter = deps.rateLimiter ?? defaultRateLimiter;
        rateLimiter.check(currentUser.userId);

        const service =
          deps.service ??
          createFeedbackService({
            mailer: createSmtpMailer(),
            to: deps.to ?? process.env.FEEDBACK_TO_EMAIL ?? "736259416@qq.com",
          });

        await service.sendFeedback({
          email: currentUser.email,
          message,
          source,
          appVersion,
        });

        return NextResponse.json({ ok: true });
      } catch (error) {
        return createFeedbackErrorResponse(error);
      }
    },
  };
}

function createFeedbackErrorResponse(error: unknown) {
  if (error instanceof FeedbackRateLimitExceededError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 429 },
    );
  }

  if (error instanceof SmtpNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 501 },
    );
  }

  if (error instanceof SmtpSendFailedError) {
    return NextResponse.json(
      { ok: false, message: "反馈邮件发送失败" },
      { status: 500 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown feedback error" },
    { status: 500 },
  );
}
