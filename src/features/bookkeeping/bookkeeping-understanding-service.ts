import {
  createDoubaoBookkeepingClient,
  type BookkeepingCategoryContext,
  type BookkeepingCorrectionExample,
  type BookkeepingUnderstandingResult,
} from "../../server/recognition/doubao-bookkeeping";
import type { PaymentAmountCandidate } from "../../server/recognition/payment-amount-candidates";

export type TextUnderstandingMode = "AUTOMATIC" | "DOUBAO_ONLY" | "QWEN_ONLY" | "DEEPSEEK_ONLY";

const DEFAULT_QWEN_TEXT_MODEL = "qwen3.7-flash";
const QWEN_TEXT_TIMEOUT_MS = 45_000;
const APPROVED_QWEN_TEXT_MODELS = new Set([
  DEFAULT_QWEN_TEXT_MODEL,
  "qwen3.7-flash-2026-07-15",
]);

export type TextUnderstandingInput = {
  ocrText: string;
  capturedAt: string;
  categories?: BookkeepingCategoryContext[];
  correctionExamples?: BookkeepingCorrectionExample[];
  amountCandidates?: PaymentAmountCandidate[];
  signal?: AbortSignal;
  timeoutMs?: number;
  reviewInstruction?: string;
};

export type TextUnderstandingProvider = {
  understand(input: TextUnderstandingInput): Promise<BookkeepingUnderstandingResult>;
};

export type TextUnderstandingProviders = {
  doubao: TextUnderstandingProvider;
  qwen: TextUnderstandingProvider;
  deepseek: TextUnderstandingProvider;
};

export type TextUnderstandingProviderOptions = {
  doubaoApiKey?: string;
  deepseekApiKey?: string;
};

export async function understandWithFallback(
  { mode = "AUTOMATIC", ...input }: TextUnderstandingInput & { mode?: TextUnderstandingMode },
  providers: TextUnderstandingProviders = createTextUnderstandingProviders(),
): Promise<BookkeepingUnderstandingResult> {
  if (input.signal?.aborted) return { ok: false, reason: "request_aborted" };
  if (mode === "QWEN_ONLY") return providers.qwen.understand(input);
  if (mode === "DEEPSEEK_ONLY") return providers.deepseek.understand(input);

  const doubaoResult = await providers.doubao.understand(input);
  if (mode !== "AUTOMATIC" || doubaoResult.ok || !isRetryableDoubaoFailure(doubaoResult.reason) || input.signal?.aborted) {
    return doubaoResult;
  }
  return providers.qwen.understand(input);
}

function isRetryableDoubaoFailure(reason: string): boolean {
  return reason === "timeout" || reason === "rate_limit" || reason === "server_error" || reason === "upstream_error";
}

export function createTextUnderstandingProviders(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
  options: TextUnderstandingProviderOptions = {},
): TextUnderstandingProviders {
  return {
    doubao: toProvider(createDoubaoBookkeepingClient({
      apiKey: options.doubaoApiKey ?? env.DOUBAO_API_KEY,
      model: env.DOUBAO_TEXT_MODEL,
      baseUrl: env.DOUBAO_TEXT_BASE_URL,
      fetchImpl,
    })),
    qwen: createQwenProvider(env, fetchImpl),
    deepseek: toProvider(createDoubaoBookkeepingClient({
      apiKey: options.deepseekApiKey,
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com/chat/completions",
      fetchImpl,
    })),
  };
}

function createQwenProvider(env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): TextUnderstandingProvider {
  const apiKey = env.QWEN_API_KEY?.trim();
  const model = env.QWEN_TEXT_MODEL?.trim() || DEFAULT_QWEN_TEXT_MODEL;
  const baseUrl = env.QWEN_TEXT_BASE_URL?.trim();
  if (!apiKey) {
    return { understand: async () => ({ ok: false, reason: "api_key_missing" }) };
  }
  if (!baseUrl) return { understand: async () => ({ ok: false, reason: "configuration_missing" }) };
  if (!APPROVED_QWEN_TEXT_MODELS.has(model)) {
    return { understand: async () => ({ ok: false, reason: "configuration_invalid" }) };
  }
  return toProvider(createDoubaoBookkeepingClient({
    apiKey,
    model,
    baseUrl,
    fetchImpl,
    timeoutMs: QWEN_TEXT_TIMEOUT_MS,
  }));
}

function toProvider(client: ReturnType<typeof createDoubaoBookkeepingClient>): TextUnderstandingProvider {
  return {
    understand: ({ ocrText, capturedAt, categories, correctionExamples, amountCandidates, signal, timeoutMs, reviewInstruction }) =>
      client.understandOcrText(ocrText, capturedAt, categories, correctionExamples, amountCandidates, { signal, timeoutMs, reviewInstruction }),
  };
}
