import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import {
  createBookkeepingErrorReportService,
} from "../../../../features/bookkeeping/bookkeeping-error-report-service";
import {
  parseBookkeepingErrorReportRequest,
  validateBookkeepingErrorReportJpeg,
  type BookkeepingErrorReportRequest,
} from "../../../../features/bookkeeping/bookkeeping-error-report-types";
import type { createAuthService } from "../../../../server/auth/auth-service";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
} from "../../../../server/db/postgres";
import { createLocalPhotoStore } from "../../../../server/photos/photo-store";

type CurrentUserAuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type ErrorReportService = Pick<ReturnType<typeof createBookkeepingErrorReportService>, "saveForCurrentUser">;
type ErrorReportEnv = PostgresEnv & { BOOKKEEPING_ERROR_REPORTS_DIR?: string };

export class BookkeepingErrorReportsDirectoryNotConfiguredError extends Error {
  constructor() {
    super("BOOKKEEPING_ERROR_REPORTS_DIR is required");
    this.name = "BookkeepingErrorReportsDirectoryNotConfiguredError";
  }
}

export type BookkeepingErrorReportDependencies = {
  authService?: CurrentUserAuthService;
  service?: ErrorReportService;
  env?: ErrorReportEnv;
};

export function createBookkeepingErrorReportHandlers(
  dependencies: BookkeepingErrorReportDependencies = {},
) {
  async function authenticated(request: NextRequest) {
    const currentUser = await getCurrentUserFromRequest(request, dependencies.authService);
    if (!currentUser) return null;
    const env = dependencies.env ?? process.env;
    const directory = env.BOOKKEEPING_ERROR_REPORTS_DIR?.trim();
    if (!dependencies.service && !directory) throw new BookkeepingErrorReportsDirectoryNotConfiguredError();
    const service = dependencies.service ?? createBookkeepingErrorReportService({
      client: createPostgresQueryClientFromEnv(env),
      store: createLocalPhotoStore(directory!),
    });
    return { userId: currentUser.userId, service };
  }

  return {
    async POST(request: NextRequest) {
      let context: Awaited<ReturnType<typeof authenticated>>;
      try {
        context = await authenticated(request);
      } catch (error) {
        return errorResponse(error, 500);
      }
      if (!context) return unauthorized();

      let input: BookkeepingErrorReportRequest;
      let image: Buffer;
      try {
        ({ input, image } = await parseMultipartRequest(request));
      } catch (error) {
        return errorResponse(error, 400);
      }

      try {
        const data = await context.service.saveForCurrentUser(context.userId, input, image);
        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return errorResponse(error, 500);
      }
    },
  };
}

async function parseMultipartRequest(request: NextRequest) {
  const form = await request.formData();
  const entries = [...form.entries()];
  if (entries.length !== 2 || new Set(entries.map(([key]) => key)).size !== 2 ||
      !entries.some(([key]) => key === "report") || !entries.some(([key]) => key === "image")) {
    throw new Error("invalid multipart fields");
  }
  const report = form.get("report");
  const image = form.get("image");
  if (typeof report !== "string" || !image || typeof image === "string" || !("arrayBuffer" in image)) {
    throw new Error("invalid multipart content");
  }
  const parsed = parseBookkeepingErrorReportRequest(JSON.parse(report));
  const buffer = Buffer.from(await image.arrayBuffer());
  validateBookkeepingErrorReportJpeg(buffer);
  return { input: parsed, image: buffer };
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
}

function errorResponse(error: unknown, fallbackStatus: number) {
  if (error instanceof PostgresDatabaseNotConfiguredError ||
      error instanceof BookkeepingErrorReportsDirectoryNotConfiguredError) {
    return NextResponse.json({ ok: false, message: "Error report storage is not configured" }, { status: 501 });
  }
  return NextResponse.json(
    { ok: false, message: fallbackStatus === 400 ? "Invalid error report request" : "Error report request failed" },
    { status: fallbackStatus },
  );
}
