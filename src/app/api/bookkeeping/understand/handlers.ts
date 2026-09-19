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
};

const MAX_OCR_TEXT_LENGTH = 12_000;

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

      const body = await request.json().catch(() => null) as {
        ocrText?: unknown;
        capturedAt?: unknown;
        categories?: unknown;
        amountCandidates?: unknown;
        modelMode?: unknown;
      } | null;
      const ocrText = typeof body?.ocrText === "string" ? body.ocrText.trim() : "";
      if (!ocrText) {
        return NextResponse.json({ ok: false, message: "OCR text is required" }, { status: 400 });
      }
      if (ocrText.length > MAX_OCR_TEXT_LENGTH) {
        return NextResponse.json({ ok: false, message: "OCR text is too long" }, { status: 413 });
      }

      const capturedAt = typeof body?.capturedAt === "string" && body.capturedAt.trim()
        ? body.capturedAt.trim()
        : new Date().toISOString();
      const categories: BookkeepingCategoryContext[] = Array.isArray(body?.categories)
        ? body.categories.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const value = item as Record<string, unknown>;
            if (typeof value.name !== "string" || typeof value.type !== "string" || typeof value.keywords !== "string") return [];
            return [{ name: value.name.trim(), type: value.type.trim(), keywords: value.keywords.trim() }];
          }).filter((item) => item.name.length > 0)
        : [];
      let amountCandidates: PaymentAmountCandidate[];
      try {
        amountCandidates = parsePaymentAmountCandidates(body?.amountCandidates);
      } catch {
        return NextResponse.json({ ok: false, message: "Invalid amount candidates" }, { status: 400 });
      }
      const currentUser = await getCurrentUserFromRequest(request, dependencies.authService).catch(() => null);
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
      const modelMode = parseModelMode(body?.modelMode);
      let credentialSource: "PERSONAL" | "PLATFORM" = "PLATFORM";
      let credentialRevision: string | null = null;
      let credentialService = dependencies.credentialService;
      if (!credentialService && currentUser && modelMode !== "QWEN_ONLY") {
        const client = createPostgresQueryClientFromEnv(dependencies.env ?? process.env);
        credentialService = createBookkeepingDoubaoCredentialService({
          repository: createPostgresBookkeepingDoubaoCredentialRepository(client),
          env: process.env,
        });
      }
      let providers = dependencies.providers;
      if (currentUser && modelMode !== "QWEN_ONLY" && credentialService) {
        try {
          const resolved = await credentialService.resolveForUser(currentUser.userId);
          credentialSource = resolved.source;
          credentialRevision = resolved.revision;
          providers ??= createTextUnderstandingProviders(process.env, undefined, {
            doubaoApiKey: resolved.source === "PERSONAL" ? resolved.apiKey : undefined,
          });
        } catch {
          credentialService = undefined;
          credentialSource = "PLATFORM";
        }
      }
      console.info("bookkeeping understanding started", { modelMode });
      const recognize = (reviewInstruction?: string) => dependencies.client
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
        const status = result.reason === "api_key_missing" ? 501 : 502;
        return NextResponse.json({ ok: false, message: result.reason }, { status });
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
      return NextResponse.json({ ok: true, data: finalData, model: result.model, ...(credentialSource === "PERSONAL" ? { credentialSource } : {}) });
    },
  };
}

function parseModelMode(value: unknown): TextUnderstandingMode {
  return value === "DOUBAO_ONLY" || value === "QWEN_ONLY" || value === "AUTOMATIC"
    ? value
    : "AUTOMATIC";
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
