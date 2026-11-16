import { NextResponse, type NextRequest } from "next/server";

import { createBookkeepingDoubaoCredentialService } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-service";
import { createPostgresBookkeepingDoubaoCredentialRepository } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-repository";
import { createDeepSeekCredentialService } from "../../../../features/bookkeeping/deepseek-credential-service";
import { createPostgresDeepSeekCredentialRepository } from "../../../../features/bookkeeping/deepseek-credential-repository";
import { createQwenCredentialService } from "../../../../features/bookkeeping/qwen-credential-service";
import { createPostgresQwenCredentialRepository } from "../../../../features/bookkeeping/qwen-credential-repository";
import type { createAuthService } from "../../../../server/auth/auth-service";
import { createPostgresQueryClientFromEnv, type PostgresEnv } from "../../../../server/db/postgres";
import {
  createBookkeepingIntentClient,
  type IntentClient,
  type IntentProvider,
  type IntentResult,
} from "../../../../server/recognition/intent";
import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import {
  BodyTooLargeError,
  readBoundedJsonObject,
} from "../understand/handlers";

type CurrentUserAuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type DoubaoCredentialService = Pick<
  ReturnType<typeof createBookkeepingDoubaoCredentialService>,
  "resolveForUser" | "recordProviderFailure" | "recordProviderSuccess"
>;

export type BookkeepingClassifyDependencies = {
  classifier?: IntentClient;
  authService?: CurrentUserAuthService;
  credentialService?: DoubaoCredentialService;
  deepseekCredentialService?: Pick<ReturnType<typeof createDeepSeekCredentialService>, "decryptForProvider">;
  qwenCredentialService?: Pick<ReturnType<typeof createQwenCredentialService>, "decryptForProvider">;
  env?: PostgresEnv;
};

const MAX_TEXT_LENGTH = 12_000;
const MAX_CLASSIFY_BODY_BYTES = 32 * 1024;
const ALLOWED_FIELDS = new Set(["text", "provider", "credentialMode"]);

export function createBookkeepingClassifyHandlers(
  dependencies: BookkeepingClassifyDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      const configuredToken = process.env.BOOKKEEPING_API_TOKEN?.trim();
      if (process.env.NODE_ENV === "production" && !configuredToken) {
        return NextResponse.json({ ok: false, message: "Bookkeeping API is not enabled" }, { status: 503 });
      }
      if (configuredToken && request.headers.get("X-Bookkeeping-Token") !== configuredToken) {
        return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readBoundedJsonObject(request, MAX_CLASSIFY_BODY_BYTES);
      } catch (error) {
        return NextResponse.json(
          { ok: false, message: error instanceof BodyTooLargeError ? "Request body is too large" : "Invalid request body" },
          { status: error instanceof BodyTooLargeError ? 413 : 400 },
        );
      }
      if (!body || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
        return NextResponse.json({ ok: false, message: "Invalid request fields", errorCode: "INVALID_REQUEST" }, { status: 400 });
      }

      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        return NextResponse.json({ ok: false, message: "Text is required", errorCode: "INVALID_REQUEST" }, { status: 400 });
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return NextResponse.json({ ok: false, message: "Text is too long", errorCode: "TEXT_TOO_LONG" }, { status: 413 });
      }

      const route = parseProviderRoute(body.provider, body.credentialMode);
      if (!route) {
        return NextResponse.json({ ok: false, message: "Invalid provider route", errorCode: "INVALID_REQUEST" }, { status: 400 });
      }

      const currentUser = await getCurrentUserFromRequest(request, dependencies.authService).catch(() => null);
      if (route.provider !== "DOUBAO" && route.credentialMode !== "PERSONAL") {
        return personalApiRequired();
      }
      if (route.provider === "DOUBAO" && route.credentialMode === "PERSONAL" && !currentUser) {
        return NextResponse.json({ ok: false, message: "authentication_required", errorCode: "AUTHENTICATION_REQUIRED" }, { status: 401 });
      }

      let apiKey = "";
      let credentialSource: "PERSONAL" | "PLATFORM" = "PLATFORM";
      let credentialRevision: string | null = null;
      let credentialService = dependencies.credentialService;
      if (route.provider === "DOUBAO" && route.credentialMode === "PERSONAL") {
        if (!credentialService) {
          try {
            credentialService = createBookkeepingDoubaoCredentialService({
              repository: createPostgresBookkeepingDoubaoCredentialRepository(
                createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
              ),
              env: process.env,
            });
          } catch {
            return providerUnavailable();
          }
        }
        const resolved = await credentialService.resolveForUser(currentUser!.userId).catch(() => null);
        if (!resolved || resolved.source !== "PERSONAL") return personalApiRequired();
        apiKey = resolved.apiKey;
        credentialSource = "PERSONAL";
        credentialRevision = resolved.revision;
      } else if (route.provider === "DOUBAO") {
        apiKey = process.env.DOUBAO_API_KEY?.trim() ?? "";
        if (!apiKey) return providerUnavailable();
      } else if (route.provider === "QWEN") {
        if (!currentUser) {
          return NextResponse.json({ ok: false, message: "authentication_required", errorCode: "AUTHENTICATION_REQUIRED" }, { status: 401 });
        }
        let service = dependencies.qwenCredentialService;
        if (!service) {
          try {
            service = createQwenCredentialService({
              database: createPostgresQwenCredentialRepository(
                createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
              ),
              env: process.env,
            });
          } catch {
            return providerUnavailable("QWEN");
          }
        }
        apiKey = (await service.decryptForProvider(currentUser.userId).catch(() => null)) ?? "";
        if (!apiKey) return personalApiRequired();
        credentialSource = "PERSONAL";
      } else {
        if (!currentUser) {
          return NextResponse.json({ ok: false, message: "authentication_required", errorCode: "AUTHENTICATION_REQUIRED" }, { status: 401 });
        }
        let service = dependencies.deepseekCredentialService;
        if (!service) {
          try {
            service = createDeepSeekCredentialService({
              database: createPostgresDeepSeekCredentialRepository(
                createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
              ),
              env: process.env,
            });
          } catch {
            return providerUnavailable("DEEPSEEK");
          }
        }
        apiKey = (await service.decryptForProvider(currentUser.userId).catch(() => null)) ?? "";
        if (!apiKey) return providerUnavailable("DEEPSEEK");
        credentialSource = "PERSONAL";
      }

      const classifier = dependencies.classifier ?? createBookkeepingIntentClient({ env: process.env });
      const result = await classifier.classify({
        text,
        provider: route.provider,
        apiKey,
        signal: request.signal,
      });
      if (!result.ok) {
        if (route.provider === "DOUBAO" && credentialSource === "PERSONAL" && credentialRevision && credentialService &&
          (result.reason === "auth_invalid" || result.reason === "quota_exhausted")) {
          await credentialService.recordProviderFailure(currentUser!.userId, credentialRevision, result.reason).catch(() => undefined);
        }
        return classifyFailure(result, route.provider, credentialSource);
      }
      if (route.provider === "DOUBAO" && credentialSource === "PERSONAL" && credentialRevision && credentialService) {
        await credentialService.recordProviderSuccess(currentUser!.userId, credentialRevision).catch(() => undefined);
      }
      return NextResponse.json({
        ok: true,
        data: {
          intent: result.intent,
          confidence: result.confidence,
          reason: result.reason,
        },
        model: result.model,
        provider: route.provider,
        credentialMode: route.credentialMode,
        ...(credentialSource === "PERSONAL" ? { credentialSource } : {}),
      });
    },
  };
}

function parseProviderRoute(provider: unknown, credentialMode: unknown): {
  provider: IntentProvider;
  credentialMode: "PLATFORM" | "PERSONAL";
} | null {
  if ((provider !== "DOUBAO" && provider !== "QWEN" && provider !== "DEEPSEEK") ||
    (credentialMode !== "PLATFORM" && credentialMode !== "PERSONAL")) return null;
  return { provider, credentialMode };
}

function personalApiRequired() {
  return NextResponse.json({ ok: false, message: "personal_api_required", errorCode: "PERSONAL_API_REQUIRED" }, { status: 409 });
}

function providerUnavailable(provider?: IntentProvider) {
  return NextResponse.json({
    ok: false,
    message: "provider_unavailable",
    errorCode: provider ? `${provider}_PROVIDER_UNAVAILABLE` : "PROVIDER_UNAVAILABLE",
  }, { status: 503 });
}

function classifyFailure(
  result: Extract<IntentResult, { ok: false }>,
  provider: IntentProvider,
  credentialSource: "PERSONAL" | "PLATFORM",
) {
  const errorCode = result.reason === "auth_invalid"
    ? credentialSource === "PERSONAL" ? "PERSONAL_AUTH_INVALID" : `${provider}_AUTH_INVALID`
    : result.reason === "quota_exhausted"
      ? credentialSource === "PERSONAL" ? "PERSONAL_QUOTA_EXHAUSTED" : `${provider}_QUOTA_EXHAUSTED`
      : result.reason === "timeout" ? "INTENT_TIMEOUT"
        : result.reason === "rate_limit" ? "INTENT_RATE_LIMIT"
          : result.reason === "invalid_request" ? "INVALID_REQUEST"
            : result.reason === "invalid_response" ? "INTENT_INVALID_RESPONSE"
              : result.reason === "api_key_missing" ? "PERSONAL_API_REQUIRED"
                : "INTENT_PROVIDER_UNAVAILABLE";
  const status = errorCode === "PERSONAL_AUTH_INVALID" || errorCode.endsWith("_AUTH_INVALID") ? 401
    : errorCode === "PERSONAL_QUOTA_EXHAUSTED" || errorCode.endsWith("_QUOTA_EXHAUSTED") ? 403
      : errorCode === "PERSONAL_API_REQUIRED" ? 409
        : errorCode === "INTENT_RATE_LIMIT" ? 429
          : errorCode === "INTENT_TIMEOUT" ? 504
            : errorCode === "INVALID_REQUEST" ? 400
              : 502;
  return NextResponse.json({ ok: false, message: result.reason, errorCode }, { status });
}
