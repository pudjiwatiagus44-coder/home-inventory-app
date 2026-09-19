import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import type { createAuthService } from "../../../../server/auth/auth-service";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
} from "../../../../server/db/postgres";
import {
  createPostgresBookkeepingDoubaoCredentialRepository,
  type BookkeepingDoubaoCredentialRepository,
} from "../../../../features/bookkeeping/bookkeeping-doubao-credential-repository";
import {
  createBookkeepingDoubaoCredentialService,
  type ValidateAndSaveDoubaoCredentialResult,
} from "../../../../features/bookkeeping/bookkeeping-doubao-credential-service";
import {
  parseDoubaoCredentialRequest,
  type DoubaoCredentialStatusResponse,
} from "../../../../features/bookkeeping/bookkeeping-doubao-credential-types";

type AuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type CredentialService = Pick<
  ReturnType<typeof createBookkeepingDoubaoCredentialService>,
  "getStatus" | "validateAndSave" | "usePlatform" | "deleteCredential"
>;

export type DoubaoCredentialDependencies = {
  authService?: AuthService;
  service?: CredentialService;
  repository?: BookkeepingDoubaoCredentialRepository;
  env?: PostgresEnv;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

export function createDoubaoCredentialHandlers(dependencies: DoubaoCredentialDependencies = {}) {
  function response(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: noStoreHeaders });
  }

  function service(): CredentialService {
    if (dependencies.service) return dependencies.service;
    const client = createPostgresQueryClientFromEnv(dependencies.env ?? process.env);
    const repository = dependencies.repository ?? createPostgresBookkeepingDoubaoCredentialRepository(client);
    return createBookkeepingDoubaoCredentialService({ repository, env: process.env });
  }

  async function authenticated(request: NextRequest) {
    const configuredToken = process.env.BOOKKEEPING_API_TOKEN?.trim();
    if (process.env.NODE_ENV === "production" && !configuredToken) return { error: response({ ok: false, message: "Bookkeeping API is not enabled" }, 503) };
    if (configuredToken && request.headers.get("X-Bookkeeping-Token") !== configuredToken) return { error: response({ ok: false, message: "Unauthorized" }, 401) };
    const user = await getCurrentUserFromRequest(request, dependencies.authService).catch(() => null);
    if (!user) return { error: response({ ok: false, message: "Authentication required" }, 401) };
    return { userId: user.userId };
  }

  return {
    async GET(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if ("error" in auth) return auth.error;
        return response({ ok: true, data: await service().getStatus(auth.userId) });
      } catch (error) {
        return credentialError(error);
      }
    },

    async PUT(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if ("error" in auth) return auth.error;
        const input = parseDoubaoCredentialRequest(await request.json());
        const result: ValidateAndSaveDoubaoCredentialResult = await service().validateAndSave(auth.userId, input.apiKey);
        if (!result.ok) return response({ ok: false, message: "Doubao credential validation failed", errorCode: result.errorCode }, 422);
        return response({ ok: true, data: result.status });
      } catch (error) {
        return credentialError(error, 400);
      }
    },

    async POST(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if ("error" in auth) return auth.error;
        const status = await service().usePlatform(auth.userId);
        return response({ ok: true, data: { enabled: status.enabled } });
      } catch (error) {
        return credentialError(error);
      }
    },

    async DELETE(request: NextRequest) {
      try {
        const auth = await authenticated(request);
        if ("error" in auth) return auth.error;
        await service().deleteCredential(auth.userId);
        return response({ ok: true, data: { configured: false, enabled: false } });
      } catch (error) {
        return credentialError(error);
      }
    },
  };
}

function credentialError(error: unknown, fallbackStatus = 500) {
  const status = error instanceof PostgresDatabaseNotConfiguredError || isCredentialStorageError(error) ? 503 : fallbackStatus;
  return NextResponse.json(
    { ok: false, message: status === 503 ? "Credential storage is not configured" : "Invalid credential request", errorCode: status === 503 ? "CREDENTIAL_STORAGE_NOT_CONFIGURED" : undefined },
    { status, headers: noStoreHeaders },
  );
}

function isCredentialStorageError(error: unknown) {
  return error instanceof Error && /BOOKKEEPING_CREDENTIAL_(MASTER_KEYS|ACTIVE_KEY_VERSION)/.test(error.message);
}
