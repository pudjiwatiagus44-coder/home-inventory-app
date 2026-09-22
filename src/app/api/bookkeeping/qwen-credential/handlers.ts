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
  "getStatusForUser" | "validateAndSaveForUser" | "validateConnectivityForUser" | "deleteForUser"
>;

export type QwenCredentialHandlerDependencies = {
  authService?: AuthService;
  service?: CredentialService;
  env?: PostgresEnv & NodeJS.ProcessEnv;
};

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
          body = await request.json();
        } catch {
          return response({ ok: false, code: "invalid_request" }, 400);
        }
        if (!isRecord(body) || typeof body.apiKey !== "string") {
          return response({ ok: false, code: "invalid_request" }, 400);
        }
        const result = await credentialService().validateAndSaveForUser(auth.userId, body.apiKey);
        if (!result.ok) return response({ ok: false, code: publicCode(result.code) }, validationStatus(result.code));
        return response({ ok: true, data: result.status });
      } catch (error) {
        return internalError(error);
      }
    },

    async POST(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if (!auth) return response({ ok: false, message: "Authentication required" }, 401);
        const result = await credentialService().validateConnectivityForUser(auth.userId);
        if (!result.ok) return response({ ok: false, code: publicCode(result.code) }, validationStatus(result.code));
        return response({ ok: true, data: { status: result.status, elapsedMs: result.elapsedMs } });
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
