import {
  BOOKKEEPING_DRAFT_FIELDS,
  type BookkeepingCategoryContext,
  type BookkeepingDraft,
  type BookkeepingUnderstandingResult,
} from "../../server/recognition/doubao-bookkeeping";

type PersonalDoubaoModel = "doubao-seed-2-0-mini-260428" | "doubao-seed-2-0-lite-260428";
const DEEPSEEK_VISION_TIMEOUT_MS = 45_000;

export type RerecognitionProvider = "DOUBAO" | "QWEN" | "DEEPSEEK";
export type RerecognitionInput = {
  requestId: string;
  ocrText: string;
  capturedAt: string;
  categories: BookkeepingCategoryContext[];
  provider: RerecognitionProvider;
  signal?: AbortSignal;
};
type ProviderResult = BookkeepingUnderstandingResult | { ok: false; reason: string };
type TextProvider = (input: RerecognitionInput) => Promise<ProviderResult>;
type VisionProvider = (input: RerecognitionInput & { image: Buffer }) => Promise<ProviderResult>;
type Dependencies = {
  textProviders?: Partial<Record<RerecognitionProvider, TextProvider>>;
  visionProviders?: Partial<Record<RerecognitionProvider, VisionProvider>>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  doubaoApiKey?: string;
  doubaoModel?: PersonalDoubaoModel;
  deepseekApiKey?: string;
  qwenApiKey?: string;
};

export function createBookkeepingVisionRerecognitionService(deps: Dependencies = {}) {
  const env = deps.env ?? process.env;
  const visionProviders = {
    ...createDefaultVisionProviders(env, deps.fetchImpl, deps.doubaoApiKey, deps.doubaoModel, deps.deepseekApiKey, deps.qwenApiKey),
    ...deps.visionProviders,
  };
  return {
    async rerecognize(input: RerecognitionInput, image: Buffer) {
      if (input.signal?.aborted) return { ok: false as const, reason: "request_aborted" };
      const vision = await visionProviders[input.provider]!({ ...input, image });
      if (!vision.ok) return { ok: false as const, reason: vision.reason };
      const drafts = vision.value;
      if (drafts.length === 0 || drafts.some((draft) => !isCompleteDraft(draft))) {
        return { ok: false as const, reason: "invalid_response" };
      }
      return { ok: true as const, drafts, provider: input.provider, model: vision.model, stage: "vision" as const };
    },
  };
}

function createDefaultVisionProviders(
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
  doubaoApiKey?: string,
  doubaoModel?: PersonalDoubaoModel,
  deepseekApiKey?: string,
  qwenApiKey?: string,
) {
  return {
    DOUBAO: createOpenAiVisionProvider({
      apiKey: doubaoApiKey ?? env.DOUBAO_API_KEY,
      model: doubaoModel ?? env.DOUBAO_RERECOGNITION_VISION_MODEL ?? env.DOUBAO_VISION_MODEL ?? "doubao-1.5-vision-lite-250315",
      baseUrl: env.DOUBAO_VISION_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      fetchImpl,
    }),
    QWEN: createOpenAiVisionProvider({
      apiKey: qwenApiKey,
      model: env.QWEN_VISION_MODEL ?? "qwen3.5-ocr",
      baseUrl: env.QWEN_VISION_BASE_URL,
      requireBeijingWorkspace: true,
      approvedModels: new Set(["qwen3.5-ocr"]),
      fetchImpl,
    }),
    DEEPSEEK: createOpenAiVisionProvider({
      apiKey: deepseekApiKey,
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com/chat/completions",
      timeoutMs: DEEPSEEK_VISION_TIMEOUT_MS,
      fetchImpl,
    }),
  };
}

function createOpenAiVisionProvider(config: {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  requireBeijingWorkspace?: boolean;
  approvedModels?: ReadonlySet<string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): VisionProvider {
  return async (input) => {
    const apiKey = config.apiKey?.trim();
    const baseUrl = config.baseUrl?.trim();
    if (!apiKey) return { ok: false, reason: "api_key_missing" };
    if (!baseUrl) return { ok: false, reason: "configuration_missing" };
    if (config.approvedModels && !config.approvedModels.has(config.model)) {
      return { ok: false, reason: "configuration_invalid" };
    }
    if (config.requireBeijingWorkspace && !isBeijingWorkspaceUrl(baseUrl)) {
      return { ok: false, reason: "configuration_invalid" };
    }
    if (input.signal?.aborted) return { ok: false, reason: "request_aborted" };
    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => controller.abort();
    input.signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer = config.timeoutMs ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs) : undefined;
    let response: Response;
    try {
      response = await (config.fetchImpl ?? globalThis.fetch)(baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: visionPrompt(input) },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.image.toString("base64")}` } },
            ],
          }],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (input.signal?.aborted) return { ok: false, reason: "request_aborted" };
      if (timedOut) return { ok: false, reason: "timeout" };
      if (isAbortError(error)) return { ok: false, reason: "request_aborted" };
      return { ok: false, reason: "upstream_error" };
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener("abort", onCallerAbort);
    }
    if (!response.ok) {
      if (response.status === 401) return { ok: false, reason: "auth_invalid" };
      if (response.status === 403) return { ok: false, reason: "quota_exhausted" };
      if (response.status === 429) return { ok: false, reason: "rate_limit" };
      if (response.status === 408) return { ok: false, reason: "timeout" };
      if (response.status >= 500) return { ok: false, reason: "server_error" };
      return { ok: false, reason: "invalid_request" };
    }
    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, reason: "invalid_response" };
    const drafts = parseStrictDrafts(content);
    return drafts ? { ok: true, value: drafts, model: config.model } : { ok: false, reason: "invalid_response" };
  };
}

function parseStrictDrafts(content: string): BookkeepingDraft[] | null {
  try {
    const trimmed = content.trim();
    const fence = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
    const jsonText = fence ? fence[1].trim() : trimmed;
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid draft");
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length !== BOOKKEEPING_DRAFT_FIELDS.length ||
          Object.keys(record).some((field) => !BOOKKEEPING_DRAFT_FIELDS.includes(field as typeof BOOKKEEPING_DRAFT_FIELDS[number]))) {
        throw new Error("unexpected draft field");
      }
      return Object.fromEntries(BOOKKEEPING_DRAFT_FIELDS.map((field) => {
        if (typeof record[field] !== "string") throw new Error("invalid draft field");
        return [field, record[field].trim()];
      })) as BookkeepingDraft;
    });
  } catch {
    return null;
  }
}

function isCompleteDraft(draft: BookkeepingDraft) {
  const amount = Number(draft.amount);
  return Number.isFinite(amount) && amount > 0 && draft.category.trim() !== "" &&
    (draft.merchant.trim() !== "" || draft.payerPayee.trim() !== "") &&
    ["支出", "收入"].includes(draft.type);
}

function visionPrompt(input: RerecognitionInput) {
  return `用户已明确授权对这张订单截图重新识别。必须以截图画面为主要依据重新理解订单，OCR 文字只作辅助。逐个可见订单卡片识别，每个仍然有效的真实交易输出一个草稿；过滤已取消订单、广告、权益和推荐内容。每个草稿的金额、商户、商品、订单时间、支付时间、路线、车次、座位等字段只能来自同一张订单卡片，不得跨卡片拼接。category 由你按自己的理解直接给出非空的自由细分分类名称；建议四字内但不限制长度（如：早餐、咖啡茶饮、网约车、停车费、宠物食品、火车票）；不依赖任何预设分类表，预设里没有的细分名称同样允许使用；禁止输出“餐饮”“购物”“交通”等一级大类。只输出一个 JSON 数组，不要解释；没有有效订单时输出空数组。数组中每个对象必须且只能包含字符串字段：${BOOKKEEPING_DRAFT_FIELDS.join(",")}。type 必须严格为“支出”或“收入”之一。\nOCR:${input.ocrText}\n时间:${input.capturedAt}`;
}

function isBeijingWorkspaceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".cn-beijing.maas.aliyuncs.com") &&
      url.pathname.includes("/compatible-mode/");
  } catch {
    return false;
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
