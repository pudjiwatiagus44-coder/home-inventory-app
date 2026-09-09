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
type ErrorReportService = Pick<
  ReturnType<typeof createBookkeepingErrorReportService>,
  "saveForCurrentUser" | "retryPendingFileCleanup"
>;
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

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const BOOKKEEPING_ERROR_REPORT_MAX_MULTIPART_BODY_BYTES =
  2 * 1024 * 1024 + MULTIPART_OVERHEAD_BYTES;

export class BookkeepingErrorReportBodyTooLargeError extends Error {
  constructor() {
    super("bookkeeping error report multipart body is too large");
    this.name = "BookkeepingErrorReportBodyTooLargeError";
  }
}

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
    await service.retryPendingFileCleanup();
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
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLocaleLowerCase().startsWith("multipart/form-data")) {
    throw new Error("invalid multipart content type");
  }
  const body = await readLimitedMultipartBody(request);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: body.buffer as ArrayBuffer,
  }).formData();
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

async function readLimitedMultipartBody(request: NextRequest): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new Error("invalid Content-Length");
    if (Number(contentLength) > BOOKKEEPING_ERROR_REPORT_MAX_MULTIPART_BODY_BYTES) {
      throw new BookkeepingErrorReportBodyTooLargeError();
    }
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing multipart body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BOOKKEEPING_ERROR_REPORT_MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BookkeepingErrorReportBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
}

function errorResponse(error: unknown, fallbackStatus: number) {
  if (error instanceof BookkeepingErrorReportBodyTooLargeError) {
    return NextResponse.json({ ok: false, message: "Error report image is too large" }, { status: 413 });
  }
  if (error instanceof PostgresDatabaseNotConfiguredError ||
      error instanceof BookkeepingErrorReportsDirectoryNotConfiguredError) {
    return NextResponse.json({ ok: false, message: "Error report storage is not configured" }, { status: 501 });
  }
  return NextResponse.json(
    { ok: false, message: fallbackStatus === 400 ? "Invalid error report request" : "Error report request failed" },
    { status: fallbackStatus },
  );
}
