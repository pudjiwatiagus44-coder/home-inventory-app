import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import { createDeepSeekCredentialService } from "../../../../features/bookkeeping/deepseek-credential-service";
import { createPostgresDeepSeekCredentialRepository } from "../../../../features/bookkeeping/deepseek-credential-repository";
import type { createAuthService } from "../../../../server/auth/auth-service";
import { createPostgresQueryClientFromEnv, PostgresDatabaseNotConfiguredError, type PostgresEnv } from "../../../../server/db/postgres";

type AuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type CredentialService = Pick<
  ReturnType<typeof createDeepSeekCredentialService>,
  "getStatusForUser" | "saveForUser" | "deleteForUser"
>;

export type DeepSeekCredentialHandlerDependencies = {
  authService?: AuthService;
  service?: CredentialService;
  env?: PostgresEnv & NodeJS.ProcessEnv;
};

export function createDeepSeekCredentialHandlers(
  dependencies: DeepSeekCredentialHandlerDependencies = {},
) {
  async function authenticated(request: NextRequest) {
    const currentUser = await getCurrentUserFromRequest(request, dependencies.authService);
    if (!currentUser) return null;
    const env = dependencies.env ?? process.env;
    const service = dependencies.service ?? createDeepSeekCredentialService({
      database: createPostgresDeepSeekCredentialRepository(
        createPostgresQueryClientFromEnv(env),
      ),
      env,
    });
    // userId 仅由 httpOnly home_inventory_session 解析；请求体没有 userId 输入。
    return { userId: currentUser.userId, service };
  }

  return {
    async GET(request: NextRequest) {
      try {
        const context = await authenticated(request);
        if (!context) return unauthorized();
        return NextResponse.json({ ok: true, data: await context.service.getStatusForUser(context.userId) });
      } catch (error) {
        return credentialError(error);
      }
    },

    async PUT(request: NextRequest) {
      let context: Awaited<ReturnType<typeof authenticated>>;
      try {
        context = await authenticated(request);
      } catch (error) {
        return credentialError(error);
      }
      if (!context) return unauthorized();

      let apiKey: string;
      try {
        const body = await request.json() as { apiKey?: unknown };
        if (typeof body.apiKey !== "string") throw new Error("invalid");
        apiKey = body.apiKey;
      } catch {
        return NextResponse.json({ ok: false, message: "Invalid credential request" }, { status: 400 });
      }
      try {
        return NextResponse.json({ ok: true, data: await context.service.saveForUser(context.userId, apiKey) });
      } catch (error) {
        return credentialError(error);
      }
    },

    async DELETE(request: NextRequest) {
      try {
        const context = await authenticated(request);
        if (!context) return unauthorized();
        const deleted = await context.service.deleteForUser(context.userId);
        return NextResponse.json({ ok: true, data: { deleted } });
      } catch (error) {
        return credentialError(error);
      }
    },

    async POST(request: NextRequest) {
      try {
        const context = await authenticated(request);
        if (!context) return unauthorized();
        return NextResponse.json({ ok: false, message: "DeepSeek validation is not implemented" }, { status: 501 });
      } catch (error) {
        return credentialError(error);
      }
    },
  };
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
}

function credentialError(error: unknown) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json({ ok: false, message: "Credential storage is not configured" }, { status: 501 });
  }
  return NextResponse.json({ ok: false, message: "DeepSeek credential request failed" }, { status: 500 });
}
