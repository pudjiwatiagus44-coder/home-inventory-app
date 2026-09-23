import { NextResponse, type NextRequest } from "next/server";

import {
  createDoubaoBookkeepingClient,
  type BookkeepingCategoryContext,
  type BookkeepingCorrectionExample,
} from "../../../../server/recognition/doubao-bookkeeping";
import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import { createBookkeepingFeedbackService } from "../../../../features/bookkeeping/bookkeeping-feedback-service";
import type { createAuthService } from "../../../../server/auth/auth-service";
import { createPostgresQueryClientFromEnv, type PostgresEnv } from "../../../../server/db/postgres";
import { parsePaymentAmountCandidates, type PaymentAmountCandidate } from "../../../../server/recognition/payment-amount-candidates";
import { createPostgresBookkeepingDoubaoCredentialRepository } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-repository";
import { createBookkeepingDoubaoCredentialService } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-service";
import { createDeepSeekCredentialService } from "../../../../features/bookkeeping/deepseek-credential-service";
import { createPostgresDeepSeekCredentialRepository } from "../../../../features/bookkeeping/deepseek-credential-repository";
import { createQwenCredentialService } from "../../../../features/bookkeeping/qwen-credential-service";
import { createPostgresQwenCredentialRepository } from "../../../../features/bookkeeping/qwen-credential-repository";
import { detectSuspectedMultiOrder } from "../../../../server/recognition/multi-order-detection";
import {
  understandWithFallback,
  createTextUnderstandingProviders,
  type TextUnderstandingMode,
  type TextUnderstandingProviders,
} from "../../../../features/bookkeeping/bookkeeping-understanding-service";

type BookkeepingClient = ReturnType<typeof createDoubaoBookkeepingClient>;
type CurrentUserAuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type FeedbackLookupService = Pick<
  ReturnType<typeof createBookkeepingFeedbackService>,
  "findSimilarForCurrentUser"
>;

export type BookkeepingUnderstandDependencies = {
  client?: BookkeepingClient;
  authService?: CurrentUserAuthService;
  feedbackService?: FeedbackLookupService;
  env?: PostgresEnv;
  providers?: TextUnderstandingProviders;
  credentialService?: Pick<ReturnType<typeof createBookkeepingDoubaoCredentialService>, "resolveForUser" | "recordProviderFailure" | "recordProviderSuccess">;
  deepseekCredentialService?: Pick<ReturnType<typeof createDeepSeekCredentialService>, "decryptForProvider">;
  qwenCredentialService?: Pick<ReturnType<typeof createQwenCredentialService>, "decryptForProvider">;
};

const MAX_OCR_TEXT_LENGTH = 12_000;
const MAX_UNDERSTAND_BODY_BYTES = 256 * 1024;
const ALLOWED_UNDERSTAND_FIELDS = new Set([
  "ocrText", "capturedAt", "categories", "amountCandidates", "modelMode", "provider", "credentialMode",
]);

export function createBookkeepingUnderstandHandlers(
  dependencies: BookkeepingUnderstandDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      const configuredToken = process.env.BOOKKEEPING_API_TOKEN?.trim();
      if (process.env.NODE_ENV === "production" && !configuredToken) {
        return NextResponse.json(
          { ok: false, message: "Bookkeeping API is not enabled" },
          { status: 503 },
        );
      }
      if (configuredToken && request.headers.get("X-Bookkeeping-Token") !== configuredToken) {
        return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readBoundedJsonObject(request);
      } catch (error) {
        return NextResponse.json(
          { ok: false, message: error instanceof BodyTooLargeError ? "Request body is too large" : "Invalid request body" },
          { status: error instanceof BodyTooLargeError ? 413 : 400 },
        );
      }
      if (!body || Object.keys(body).some((key) => !ALLOWED_UNDERSTAND_FIELDS.has(key))) {
        return NextResponse.json({ ok: false, message: "Invalid request fields" }, { status: 400 });
      }
      const ocrText = typeof body?.ocrText === "string" ? body.ocrText.trim() : "";
      if (!ocrText) {
        return NextResponse.json({ ok: false, message: "OCR text is required" }, { status: 400 });
      }
      if (ocrText.length > MAX_OCR_TEXT_LENGTH) {
        return NextResponse.json({ ok: false, message: "OCR text is too long" }, { status: 413 });
      }

      if (body.capturedAt !== undefined && (typeof body.capturedAt !== "string" || body.capturedAt.length > 100 || Number.isNaN(Date.parse(body.capturedAt)))) {
        return NextResponse.json({ ok: false, message: "Invalid capturedAt" }, { status: 400 });
      }
      if (body.modelMode !== undefined && body.modelMode !== "AUTOMATIC" && body.modelMode !== "DOUBAO_ONLY" &&
          body.modelMode !== "QWEN_ONLY" && body.modelMode !== "DEEPSEEK_ONLY") {
        return NextResponse.json({ ok: false, message: "Invalid modelMode" }, { status: 400 });
      }
      const capturedAt = typeof body.capturedAt === "string" && body.capturedAt.trim()
        ? body.capturedAt.trim()
        : new Date().toISOString();
      let categories: BookkeepingCategoryContext[];
      try {
        categories = parseCategoryContracts(body.categories);
      } catch {
        return NextResponse.json({ ok: false, message: "Invalid categories" }, { status: 400 });
      }
      let amountCandidates: PaymentAmountCandidate[];
      try {
        amountCandidates = parsePaymentAmountCandidates(body?.amountCandidates);
      } catch {
        return NextResponse.json({ ok: false, message: "Invalid amount candidates" }, { status: 400 });
      }
      const currentUser = await getCurrentUserFromRequest(request, dependencies.authService).catch(() => null);
      const route = parseProviderRoute(body?.provider, body?.credentialMode);
      if (!route) return routeContractFailure();
      if (route.provider !== "DOUBAO" && route.credentialMode !== "PERSONAL") return personalApiRequired();
      if (route.provider === "DOUBAO" && route.credentialMode === "PERSONAL" && !currentUser) {
        return NextResponse.json({ ok: false, message: "authentication_required", errorCode: "AUTHENTICATION_REQUIRED" }, { status: 401 });
      }
      let correctionExamples: BookkeepingCorrectionExample[] = [];
      try {
        if (currentUser) {
          const feedbackService = dependencies.feedbackService ?? createBookkeepingFeedbackService({
            client: createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
          });
          correctionExamples = await feedbackService.findSimilarForCurrentUser(currentUser.userId, ocrText, 10);
        }
      } catch {
        console.warn("bookkeeping_feedback_lookup_failed");
      }
      const modelMode: TextUnderstandingMode = route.provider === "DOUBAO" ? "DOUBAO_ONLY" : route.provider === "QWEN" ? "QWEN_ONLY" : "DEEPSEEK_ONLY";
      let credentialSource: "PERSONAL" | "PLATFORM" = "PLATFORM";
      let credentialRevision: string | null = null;
      let deepseekApiKey: string | undefined;
      let qwenApiKey: string | undefined;
      let doubaoApiKey: string | undefined;
      if (route.provider === "DEEPSEEK") {
        if (!currentUser) {
          return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
        }
        let deepseekCredentialService = dependencies.deepseekCredentialService;
        if (!deepseekCredentialService) {
          try {
            deepseekCredentialService = createDeepSeekCredentialService({
              database: createPostgresDeepSeekCredentialRepository(
                createPostgresQueryClientFromEnv(dependencies.env ?? process.env),
              ),
              env: process.env,
            });
          } catch {
            return deepseekFailure("configuration_missing");
          }
        }
        try {
          deepseekApiKey = await deepseekCredentialService.decryptForProvider(currentUser.userId) ?? undefined;
        } catch {
          return deepseekFailure("configuration_missing");
        }
        if (!deepseekApiKey) return deepseekFailure("api_key_missing");
        credentialSource = "PERSONAL";
      }
      if (route.provider === "QWEN") {
        if (!currentUser) return NextResponse.json({ ok: false, message: "authentication_required", errorCode: "AUTHENTICATION_REQUIRED" }, { status: 401 });
        let qwenCredentialService = dependencies.qwenCredentialService;
        if (!qwenCredentialService) {
          try {
            qwenCredentialService = createQwenCredentialService({
              database: createPostgresQwenCredentialRepository(createPostgresQueryClientFromEnv(dependencies.env ?? process.env)),
              env: process.env,
            });
          } catch {
            return qwenFailure("configuration_missing");
          }
        }
        try {
          qwenApiKey = await qwenCredentialService.decryptForProvider(currentUser.userId) ?? undefined;
        } catch {
          return qwenFailure("configuration_invalid");
        }
        if (!qwenApiKey) return personalApiRequired();
        credentialSource = "PERSONAL";
      }
      let credentialService = dependencies.credentialService;
      if (!credentialService && currentUser && route.provider === "DOUBAO" && route.credentialMode === "PERSONAL") {
        try {
          const client = createPostgresQueryClientFromEnv(dependencies.env ?? process.env);
          credentialService = createBookkeepingDoubaoCredentialService({
            repository: createPostgresBookkeepingDoubaoCredentialRepository(client),
            env: process.env,
          });
        } catch {
          return NextResponse.json({ ok: false, message: "personal_credential_unavailable", errorCode: "PERSONAL_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
        }
      }
      let providers = dependencies.providers;
      if (route.provider === "DOUBAO" && route.credentialMode === "PERSONAL" && currentUser && credentialService) {
        try {
          const resolved = await credentialService.resolveForUser(currentUser.userId);
          if (resolved.source !== "PERSONAL") return NextResponse.json({ ok: false, message: "personal_api_required", errorCode: "PERSONAL_API_REQUIRED" }, { status: 409 });
          credentialSource = "PERSONAL";
          credentialRevision = resolved.revision;
          doubaoApiKey = resolved.apiKey;
        } catch {
          return NextResponse.json({ ok: false, message: "personal_api_required", errorCode: "PERSONAL_API_REQUIRED" }, { status: 409 });
        }
      }
      if (!providers && !(route.provider === "DOUBAO" && route.credentialMode === "PLATFORM" && dependencies.client)) {
        providers = createTextUnderstandingProviders(process.env, undefined, { doubaoApiKey, qwenApiKey, deepseekApiKey });
      }
      console.info("bookkeeping understanding started", { modelMode });
      const recognize = (reviewInstruction?: string) => route.provider === "DOUBAO" && route.credentialMode === "PLATFORM" && dependencies.client
        ? dependencies.client.understandOcrText(
          ocrText,
          capturedAt,
          categories,
          correctionExamples,
          amountCandidates,
          { signal: request.signal, ...(reviewInstruction ? { reviewInstruction } : {}) },
        )
        : understandWithFallback(
          { mode: modelMode, ocrText, capturedAt, categories, correctionExamples, amountCandidates, signal: request.signal, reviewInstruction },
          providers,
        );
      let result = await recognize();
      if (!result.ok) {
        if (currentUser && credentialSource === "PERSONAL" && credentialRevision && credentialService &&
          (result.reason === "auth_invalid" || result.reason === "quota_exhausted")) {
          await credentialService.recordProviderFailure(currentUser.userId, credentialRevision, result.reason).catch(() => undefined);
          return NextResponse.json({ ok: false, message: result.reason, errorCode: result.reason === "auth_invalid" ? "PERSONAL_AUTH_INVALID" : "PERSONAL_QUOTA_EXHAUSTED", credentialSource }, { status: result.reason === "auth_invalid" ? 401 : 403 });
        }
        console.warn("bookkeeping understanding failed", { modelMode, reason: result.reason });
        if (route.provider === "DEEPSEEK") return deepseekFailure(result.reason);
        if (route.provider === "QWEN") return qwenFailure(result.reason);
        const status = result.reason === "api_key_missing" ? 501 : 502;
        return NextResponse.json({ ok: false, message: result.reason, errorCode: doubaoErrorCode(result.reason) }, { status });
      }
      let data = Array.isArray(result.value) ? result.value : [result.value];
      const multiOrder = detectSuspectedMultiOrder(ocrText);
      if (multiOrder.suspected && data.length <= 1) {
        console.info("bookkeeping multi-order review started", { modelMode, evidenceCount: multiOrder.evidenceCount });
        const reviewed = await recognize(
          `检测到至少 ${multiOrder.evidenceCount} 个独立实付区块。请逐个订单卡片复核并输出全部真实订单；不要把推荐商品、广告、优惠、运费或原价作为订单。`,
        );
        if (!reviewed.ok || reviewed.value.length <= 1) {
          console.warn("bookkeeping multi-order review incomplete", { modelMode, evidenceCount: multiOrder.evidenceCount });
          return NextResponse.json(
            { ok: false, message: "incomplete_multi_order", errorCode: "INCOMPLETE_MULTI_ORDER" },
            { status: 422 },
          );
        }
        result = reviewed;
        data = reviewed.value;
      }
      // 硬规则：命中"提现/体现"的，无论豆包判成什么，一律覆盖为"收入"（用户确认的记账口径）。
      const finalData = applyIncomeKeywordOverride(data, ocrText);
      console.info("bookkeeping understanding succeeded", { modelMode, model: result.model });
      if (currentUser && credentialSource === "PERSONAL" && credentialRevision && credentialService) {
        await credentialService.recordProviderSuccess(currentUser.userId, credentialRevision).catch(() => undefined);
      }
      return NextResponse.json({ ok: true, data: finalData, model: result.model, provider: route.provider, credentialMode: route.credentialMode, ...(credentialSource === "PERSONAL" ? { credentialSource } : {}) });
    },
  };
}

function parseProviderRoute(provider: unknown, credentialMode: unknown): { provider: "DOUBAO" | "QWEN" | "DEEPSEEK"; credentialMode: "PLATFORM" | "PERSONAL" } | null {
  if ((provider !== "DOUBAO" && provider !== "QWEN" && provider !== "DEEPSEEK") ||
      (credentialMode !== "PLATFORM" && credentialMode !== "PERSONAL")) return null;
  return { provider, credentialMode };
}

function routeContractFailure() { return NextResponse.json({ ok: false, message: "invalid_provider_route", errorCode: "INVALID_PROVIDER_ROUTE" }, { status: 400 }); }
function personalApiRequired() { return NextResponse.json({ ok: false, message: "personal_api_required", errorCode: "PERSONAL_API_REQUIRED" }, { status: 409 }); }
function qwenFailure(reason: string) {
  const errorCode = reason === "api_key_missing" ? "PERSONAL_API_REQUIRED" : reason === "auth_invalid" ? "QWEN_AUTH_INVALID" : reason === "timeout" ? "QWEN_TIMEOUT" : reason === "invalid_request" ? "QWEN_INVALID_REQUEST" : reason === "configuration_missing" || reason === "configuration_invalid" ? "QWEN_PROVIDER_UNAVAILABLE" : "QWEN_REQUEST_FAILED";
  const status = errorCode === "PERSONAL_API_REQUIRED" ? 409 : errorCode === "QWEN_AUTH_INVALID" ? 401 : errorCode === "QWEN_TIMEOUT" ? 504 : errorCode === "QWEN_INVALID_REQUEST" ? 400 : 502;
  return NextResponse.json({ ok: false, message: errorCode.toLowerCase(), errorCode }, { status });
}
function doubaoErrorCode(reason: string) { return reason === "timeout" ? "DOUBAO_TIMEOUT" : reason === "api_key_missing" ? "DOUBAO_PROVIDER_UNAVAILABLE" : "DOUBAO_REQUEST_FAILED"; }

function parseCategoryContracts(value: unknown): BookkeepingCategoryContext[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw new Error("invalid_categories");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_category");
    const category = item as Record<string, unknown>;
    const keys = Object.keys(category).sort().join(",");
    if (keys === "keywords,name,type") {
      if (typeof category.name !== "string" || typeof category.type !== "string" || typeof category.keywords !== "string" ||
          category.name.length > 100 || category.type.length > 30 || category.keywords.length > 500 || !category.name.trim()) {
        throw new Error("invalid_category");
      }
      return { name: category.name.trim(), type: category.type.trim(), keywords: category.keywords.trim() };
    }
    if (keys === "childName,description,keywords,parentName,stableKey,type" ||
        keys === "childName,description,keywords,name,parentName,stableKey,type") {
      const { childName, description, keywords, name, parentName, stableKey, type } = category;
      if (typeof childName !== "string" || typeof description !== "string" || typeof keywords !== "string" ||
          typeof parentName !== "string" || typeof stableKey !== "string" || typeof type !== "string" ||
          childName.length > 100 || description.length > 500 || keywords.length > 500 ||
          parentName.length > 100 || stableKey.length > 120 || type.length > 30 || !childName.trim() ||
          (name !== undefined && (typeof name !== "string" || name.length > 100))) {
        throw new Error("invalid_category");
      }
      return { name: childName.trim(), type: type.trim(), keywords: keywords.trim() };
    }
    throw new Error("invalid_category");
  });
}

class BodyTooLargeError extends Error {}

async function readBoundedJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new Error("invalid_content_length");
    if (Number(contentLength) > MAX_UNDERSTAND_BODY_BYTES) throw new BodyTooLargeError();
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
      if (total > MAX_UNDERSTAND_BODY_BYTES) {
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json_object");
  return parsed as Record<string, unknown>;
}

function deepseekFailure(reason: string) {
  const errorCode = reason === "api_key_missing" ? "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED" :
    reason === "auth_invalid" ? "DEEPSEEK_AUTH_INVALID" :
    reason === "timeout" ? "DEEPSEEK_TIMEOUT" :
    reason === "invalid_response" ? "DEEPSEEK_INVALID_JSON" : "DEEPSEEK_REQUEST_FAILED";
  const status = errorCode === "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED" ? 409 :
    errorCode === "DEEPSEEK_AUTH_INVALID" ? 401 :
      errorCode === "DEEPSEEK_TIMEOUT" ? 504 : 502;
  return NextResponse.json({ ok: false, message: errorCode.toLowerCase(), errorCode }, { status });
}

const INCOME_KEYWORDS = ["提现", "体现"];

function applyIncomeKeywordOverride(
  data: Array<Record<string, unknown>>,
  ocrText: string,
): Array<Record<string, unknown>> {
  const haystack = `${ocrText}`.toLowerCase();
  const hasKeyword = INCOME_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
  if (!hasKeyword) {
    return data;
  }
  return data.map((item) => {
    if (item && typeof item === "object" && "type" in item) {
      return { ...item, type: "收入" };
    }
    return item;
  });
}
