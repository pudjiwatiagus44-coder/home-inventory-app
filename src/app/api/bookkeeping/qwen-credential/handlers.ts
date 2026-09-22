import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import type { createAuthService } from "../../../../server/auth/auth-service";
import { createQwenCredentialService, type QwenValidationCode } from "../../../../features/bookkeeping/qwen-credential-service";
import { createPostgresQwenCredentialRepository } from "../../../../features/bookkeeping/qwen-credential-repository";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
} from "../../../../server/db/postgres";

type AuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type CredentialService = Pick<
  ReturnType<typeof createQwenCredentialService>,
  | "getStatusForUser"
  | "validateAndSaveForUser"
  | "validateConnectivityForUser"
  | "deleteForUser"
  | "acquireValidationSlotForUser"
  | "releaseValidationSlotForUser"
>;

export type QwenCredentialHandlerDependencies = {
  authService?: AuthService;
  service?: CredentialService;
  env?: PostgresEnv & NodeJS.ProcessEnv;
};

const MAX_BODY_BYTES = 8 * 1024;
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };

export function createQwenCredentialHandlers(dependencies: QwenCredentialHandlerDependencies = {}) {
  function response(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: noStoreHeaders });
  }

  function credentialService(): CredentialService {
    if (dependencies.service) return dependencies.service;
    const env = dependencies.env ?? process.env;
    const client = createPostgresQueryClientFromEnv(env);
    return createQwenCredentialService({
      database: createPostgresQwenCredentialRepository(client),
      env,
    });
  }

  async function authenticated(request: NextRequest) {
    const user = await getCurrentUserFromRequest(request, dependencies.authService);
    return user ? { userId: user.userId } : null;
  }

  return {
    async GET(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if (!auth) return response({ ok: false, message: "Authentication required" }, 401);
        return response({ ok: true, data: await credentialService().getStatusForUser(auth.userId) });
      } catch (error) {
        return internalError(error);
      }
    },

    async PUT(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if (!auth) return response({ ok: false, message: "Authentication required" }, 401);
        let body: unknown;
        try {
          body = await readBoundedJson(request);
        } catch (error) {
          if (error instanceof BodyTooLargeError) return response({ ok: false, code: "invalid_request" }, 413);
          return response({ ok: false, code: "invalid_request" }, 400);
        }
        if (!isRecord(body) || typeof body.apiKey !== "string") {
          return response({ ok: false, code: "invalid_request" }, 400);
        }
        const service = credentialService();
        const requestId = randomUUID();
        const acquired = await service.acquireValidationSlotForUser(auth.userId, requestId);
        if (!acquired) return response({ ok: false, code: "rate_limited" }, 429);
        try {
          const result = await service.validateAndSaveForUser(auth.userId, body.apiKey);
          if (!result.ok) return response({ ok: false, code: publicCode(result.code) }, validationStatus(result.code));
          return response({ ok: true, data: result.status });
        } catch (error) {
          return internalError(error);
        } finally {
          await service.releaseValidationSlotForUser(auth.userId, requestId);
        }
      } catch (error) {
        return internalError(error);
      }
    },

    async POST(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if (!auth) return response({ ok: false, message: "Authentication required" }, 401);
        const service = credentialService();
        const requestId = randomUUID();
        const acquired = await service.acquireValidationSlotForUser(auth.userId, requestId);
        if (!acquired) return response({ ok: false, code: "rate_limited" }, 429);
        try {
          const result = await service.validateConnectivityForUser(auth.userId);
          if (!result.ok) return response({ ok: false, code: publicCode(result.code) }, validationStatus(result.code));
          return response({ ok: true, data: { status: result.status, elapsedMs: result.elapsedMs } });
        } finally {
          await service.releaseValidationSlotForUser(auth.userId, requestId);
        }
      } catch (error) {
        return internalError(error);
      }
    },

    async DELETE(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if (!auth) return response({ ok: false, message: "Authentication required" }, 401);
        const deleted = await credentialService().deleteForUser(auth.userId);
        return response({ ok: true, data: { deleted } });
      } catch (error) {
        return internalError(error);
      }
    },
  };
}

class BodyTooLargeError extends Error {}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new Error("invalid_content_length");
    if (Number(contentLength) > MAX_BODY_BYTES) throw new BodyTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicCode(code: QwenValidationCode): string {
  switch (code) {
    case "QWEN_CREDENTIAL_NOT_CONFIGURED": return "credential_not_configured";
    case "QWEN_AUTH_INVALID": return "invalid_key";
    case "QWEN_QUOTA_EXHAUSTED": return "provider_unavailable";
    case "QWEN_TIMEOUT": return "timeout";
    case "QWEN_INVALID_REQUEST": return "invalid_request";
    case "QWEN_INVALID_JSON":
    case "QWEN_VALIDATION_FAILED": return "provider_unavailable";
  }
}

function validationStatus(code: QwenValidationCode): number {
  switch (code) {
    case "QWEN_CREDENTIAL_NOT_CONFIGURED": return 404;
    case "QWEN_AUTH_INVALID": return 422;
    case "QWEN_INVALID_REQUEST": return 400;
    case "QWEN_TIMEOUT": return 504;
    default: return 502;
  }
}

function internalError(error: unknown) {
  const status = error instanceof PostgresDatabaseNotConfiguredError ? 503 : 500;
  return NextResponse.json(
    { ok: false, code: status === 503 ? "provider_unavailable" : "internal_error" },
    { status, headers: noStoreHeaders },
  );
}
