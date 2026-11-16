import { NextResponse, type NextRequest } from "next/server";

import { createBookkeepingDoubaoCredentialService } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-service";
import { createPostgresBookkeepingDoubaoCredentialRepository } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-repository";
import { createDeepSeekCredentialService } from "../../../../features/bookkeeping/deepseek-credential-service";
import { createPostgresDeepSeekCredentialRepository } from "../../../../features/bookkeeping/deepseek-credential-repository";
import { createQwenCredentialService } from "../../../../features/bookkeeping/qwen-credential-service";
import { createPostgresQwenCredentialRepository } from "../../../../features/bookkeeping/qwen-credential-repository";
import type { createAuthService } from "../../../../server/auth/auth-service";
import { createPostgresQueryClientFromEnv, type PostgresEnv } from "../../../../server/db/postgres";
import type { TranslationProvider } from "../../../../server/recognition/translation";
import {
  contextContainsEnglishWord,
  createBookkeepingWordLookupClient,
  isValidEnglishWord,
  MAX_WORD_LOOKUP_CONTEXT_LENGTH,
  type WordLookupClient,
  type WordLookupResult,
} from "../../../../server/recognition/word-lookup";
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

export type BookkeepingWordLookupDependencies = {
  lookupClient?: WordLookupClient;
  authService?: CurrentUserAuthService;
  credentialService?: DoubaoCredentialService;
  deepseekCredentialService?: Pick<ReturnType<typeof createDeepSeekCredentialService>, "decryptForProvider">;
  qwenCredentialService?: Pick<ReturnType<typeof createQwenCredentialService>, "decryptForProvider">;
  env?: PostgresEnv;
};

const MAX_WORD_LOOKUP_BODY_BYTES = 8 * 1024;
const ALLOWED_FIELDS = new Set(["word", "context", "provider", "credentialMode"]);

export function createBookkeepingWordLookupHandlers(
  dependencies: BookkeepingWordLookupDependencies = {},
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
        body = await readBoundedJsonObject(request, MAX_WORD_LOOKUP_BODY_BYTES);
      } catch (error) {
        return NextResponse.json(
          { ok: false, message: error instanceof BodyTooLargeError ? "Request body is too large" : "Invalid request body" },
          { status: error instanceof BodyTooLargeError ? 413 : 400 },
        );
      }
      if (!body || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
        return NextResponse.json({ ok: false, message: "Invalid request fields", errorCode: "INVALID_REQUEST" }, { status: 400 });
      }

      const word = typeof body.word === "string" ? body.word.trim() : "";
      const context = typeof body.context === "string" ? body.context.trim() : "";
      if (!isValidEnglishWord(word)) {
        return NextResponse.json(
          { ok: false, message: "An English word is required", errorCode: "INVALID_REQUEST" },
          { status: 400 },
        );
      }
      if (!context || context.length > MAX_WORD_LOOKUP_CONTEXT_LENGTH) {
        return NextResponse.json(
          { ok: false, message: "Context is missing or too long", errorCode: "INVALID_REQUEST" },
          { status: 400 },
        );
      }
      if (!contextContainsEnglishWord(context, word)) {
        return NextResponse.json(
          { ok: false, message: "Word is not present in context", errorCode: "WORD_NOT_IN_CONTEXT" },
          { status: 400 },
        );
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

      const lookupClient = dependencies.lookupClient ?? createBookkeepingWordLookupClient({ env: process.env });
      const result = await lookupClient.lookup({
        word,
        context,
        provider: route.provider,
        apiKey,
        signal: request.signal,
      });
      if (!result.ok) {
        if (route.provider === "DOUBAO" && credentialSource === "PERSONAL" && credentialRevision && credentialService &&
          (result.reason === "auth_invalid" || result.reason === "quota_exhausted")) {
          await credentialService.recordProviderFailure(currentUser!.userId, credentialRevision, result.reason).catch(() => undefined);
        }
        return wordLookupFailure(result, route.provider, credentialSource);
      }
      if (route.provider === "DOUBAO" && credentialSource === "PERSONAL" && credentialRevision && credentialService) {
        await credentialService.recordProviderSuccess(currentUser!.userId, credentialRevision).catch(() => undefined);
      }
      return NextResponse.json({
        ok: true,
        data: result.card,
        model: result.model,
        provider: route.provider,
        credentialMode: route.credentialMode,
        ...(credentialSource === "PERSONAL" ? { credentialSource } : {}),
      });
    },
  };
}

function parseProviderRoute(provider: unknown, credentialMode: unknown): {
  provider: TranslationProvider;
  credentialMode: "PLATFORM" | "PERSONAL";
} | null {
  if ((provider !== "DOUBAO" && provider !== "QWEN" && provider !== "DEEPSEEK") ||
    (credentialMode !== "PLATFORM" && credentialMode !== "PERSONAL")) return null;
  return { provider, credentialMode };
}

function personalApiRequired() {
  return NextResponse.json({ ok: false, message: "personal_api_required", errorCode: "PERSONAL_API_REQUIRED" }, { status: 409 });
}

function providerUnavailable(provider?: TranslationProvider) {
  return NextResponse.json({
    ok: false,
    message: "provider_unavailable",
    errorCode: provider ? `${provider}_PROVIDER_UNAVAILABLE` : "WORD_LOOKUP_PROVIDER_UNAVAILABLE",
  }, { status: 503 });
}

function wordLookupFailure(
  result: Extract<WordLookupResult, { ok: false }>,
  provider: TranslationProvider,
  credentialSource: "PERSONAL" | "PLATFORM",
) {
  const errorCode = result.reason === "auth_invalid"
    ? credentialSource === "PERSONAL" ? "PERSONAL_AUTH_INVALID" : `${provider}_AUTH_INVALID`
    : result.reason === "quota_exhausted"
      ? credentialSource === "PERSONAL" ? "PERSONAL_QUOTA_EXHAUSTED" : `${provider}_QUOTA_EXHAUSTED`
      : result.reason === "timeout" ? "WORD_LOOKUP_TIMEOUT"
        : result.reason === "rate_limit" ? "WORD_LOOKUP_RATE_LIMIT"
          : result.reason === "invalid_request" ? "INVALID_REQUEST"
            : result.reason === "invalid_response" ? "WORD_LOOKUP_INVALID_RESPONSE"
              : result.reason === "api_key_missing" ? "PERSONAL_API_REQUIRED"
                : "WORD_LOOKUP_PROVIDER_UNAVAILABLE";
  const status = errorCode === "PERSONAL_AUTH_INVALID" || errorCode.endsWith("_AUTH_INVALID") ? 401
    : errorCode === "PERSONAL_QUOTA_EXHAUSTED" || errorCode.endsWith("_QUOTA_EXHAUSTED") ? 403
      : errorCode === "PERSONAL_API_REQUIRED" ? 409
        : errorCode === "WORD_LOOKUP_RATE_LIMIT" ? 429
          : errorCode === "WORD_LOOKUP_TIMEOUT" ? 504
            : errorCode === "INVALID_REQUEST" ? 400
              : 502;
  return NextResponse.json({ ok: false, message: result.reason, errorCode }, { status });
}
