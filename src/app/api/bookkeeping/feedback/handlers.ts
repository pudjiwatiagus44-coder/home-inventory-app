import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import {
  createBookkeepingFeedbackService,
} from "../../../../features/bookkeeping/bookkeeping-feedback-service";
import {
  parseRecognitionFeedbackRequest,
  type RecognitionFeedbackRequest,
} from "../../../../features/bookkeeping/bookkeeping-feedback-types";
import type { createAuthService } from "../../../../server/auth/auth-service";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
} from "../../../../server/db/postgres";

type CurrentUserAuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type FeedbackService = Pick<
  ReturnType<typeof createBookkeepingFeedbackService>,
  "saveForCurrentUser" | "listSummariesForCurrentUser" | "deleteForCurrentUser"
>;

export type BookkeepingFeedbackDependencies = {
  authService?: CurrentUserAuthService;
  service?: FeedbackService;
  env?: PostgresEnv;
};

export function createBookkeepingFeedbackHandlers(
  dependencies: BookkeepingFeedbackDependencies = {},
) {
  async function authenticated(request: NextRequest) {
    const currentUser = await getCurrentUserFromRequest(request, dependencies.authService);
    if (!currentUser) return null;
    const service = dependencies.service ?? createBookkeepingFeedbackService({
      client: createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
    });
    return { userId: currentUser.userId, service };
  }

  return {
    async POST(request: NextRequest) {
      let context: Awaited<ReturnType<typeof authenticated>>;
      try {
        context = await authenticated(request);
      } catch (error) {
        return feedbackError(error, 500);
      }
      if (!context) return unauthorized();

      let feedback: RecognitionFeedbackRequest;
      try {
        feedback = parseRecognitionFeedbackRequest(await request.json());
      } catch (error) {
        return feedbackError(error, 400);
      }
      try {
        const data = await context.service.saveForCurrentUser(context.userId, feedback);
        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return feedbackError(error, 500);
      }
    },

    async GET(request: NextRequest) {
      try {
        const context = await authenticated(request);
        if (!context) return unauthorized();
        const data = await context.service.listSummariesForCurrentUser(context.userId);
        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return feedbackError(error, 500);
      }
    },

    async DELETE(request: NextRequest) {
      try {
        const context = await authenticated(request);
        if (!context) return unauthorized();
        const feedbackId = request.nextUrl.searchParams.get("feedbackId")?.trim() || undefined;
        if (feedbackId && !isUuid(feedbackId)) {
          return NextResponse.json({ ok: false, message: "Invalid feedback id" }, { status: 400 });
        }
        const data = await context.service.deleteForCurrentUser(context.userId, feedbackId);
        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return feedbackError(error, 500);
      }
    },
  };
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
}

function feedbackError(error: unknown, fallbackStatus: number) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json({ ok: false, message: "Feedback storage is not configured" }, { status: 501 });
  }
  return NextResponse.json(
    { ok: false, message: fallbackStatus === 400 ? "Invalid feedback request" : "Feedback request failed" },
    { status: fallbackStatus },
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
