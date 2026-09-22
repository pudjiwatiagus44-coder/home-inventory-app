import { describe, expect, it, vi } from "vitest";

import { createBookkeepingVisionRerecognitionService } from "./bookkeeping-vision-rerecognition-service";

const input = {
  requestId: "11111111-1111-4111-8111-111111111111",
  ocrText: "付款 18 元",
  capturedAt: "2026-09-10T00:00:00.000Z",
  categories: [{ name: "餐饮", type: "EXPENSE", keywords: "吃饭" }],
  provider: "QWEN" as const,
};
const draft = {
  dateTime: "2026-09-10 08:00", type: "支出", category: "餐饮", amount: "18.00",
  currency: "人民币", payerPayee: "早餐店", account: "", participant: "自己", tag: "",
  merchant: "早餐店", property: "", note: "早餐",
};
const outboundTicket = {
  ...draft,
  dateTime: "2026-09-10 08:36",
  amount: "73.00",
  payerPayee: "中国铁路",
  merchant: "中国铁路",
  property: "D3123 上海虹桥-杭州东 03车08F",
  note: "上海虹桥到杭州东，03车08F",
};
const returnTicket = {
  ...draft,
  dateTime: "2026-09-12 17:48",
  amount: "146.00",
  payerPayee: "中国铁路",
  merchant: "中国铁路",
  property: "G1024 杭州东-上海虹桥 06车12A",
  note: "杭州东到上海虹桥，06车12A",
};

describe("bookkeeping vision rerecognition service", () => {
  it("sends the screenshot directly to the selected vision model without calling a text model", async () => {
    const text = vi.fn(async () => ({ ok: true as const, value: [draft], model: "qwen-text" }));
    const vision = vi.fn(async () => ({ ok: true as const, value: [draft], model: "qwen-vision" }));
    const service = createBookkeepingVisionRerecognitionService({
      textProviders: { QWEN: text },
      visionProviders: { QWEN: vision },
    });

    await expect(service.rerecognize(input, jpeg())).resolves.toEqual({
      ok: true, drafts: [draft], provider: "QWEN", model: "qwen-vision", stage: "vision",
    });
    expect(text).not.toHaveBeenCalled();
    expect(vision).toHaveBeenCalledOnce();
    expect(vision).toHaveBeenCalledWith(expect.objectContaining({ image: jpeg(), ocrText: input.ocrText }));
  });

  it("sends the hosted DeepSeek key only to deepseek-flash and strictly parses its JSON array", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-hosted-test-key" });
      expect(JSON.parse(String(init?.body)).model).toBe("deepseek-flash");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([draft]) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const service = createBookkeepingVisionRerecognitionService({
      deepseekApiKey: "sk-hosted-test-key",
      fetchImpl,
    });

    await expect(service.rerecognize({ ...input, provider: "DEEPSEEK" }, jpeg())).resolves.toMatchObject({
      ok: true, provider: "DEEPSEEK", model: "deepseek-flash", stage: "vision",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("aborts a stalled DeepSeek vision request and returns timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      })) as unknown as typeof fetch;
      const service = createBookkeepingVisionRerecognitionService({
        deepseekApiKey: "sk-hosted-test-key",
        fetchImpl,
      });
      const result = service.rerecognize({ ...input, provider: "DEEPSEEK" }, jpeg());

      await vi.advanceTimersByTimeAsync(45_000);

      await expect(result).resolves.toEqual({ ok: false, reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps DeepSeek HTTP 408 to timeout", async () => {
    const service = createBookkeepingVisionRerecognitionService({
      deepseekApiKey: "sk-hosted-test-key",
      fetchImpl: vi.fn(async () => new Response("", { status: 408 })) as unknown as typeof fetch,
    });

    await expect(service.rerecognize({ ...input, provider: "DEEPSEEK" }, jpeg()))
      .resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("uses the selected vision model once even when a text provider would fail", async () => {
    const vision = vi.fn(async () => ({ ok: true as const, value: [draft], model: "qwen3.5-ocr" }));
    const service = createBookkeepingVisionRerecognitionService({
      textProviders: { QWEN: vi.fn(async () => ({ ok: true, value: [{ ...draft, amount: "" }], model: "qwen-text" })) },
      visionProviders: { QWEN: vision },
    });

    await expect(service.rerecognize(input, jpeg())).resolves.toMatchObject({
      ok: true, provider: "QWEN", model: "qwen3.5-ocr", stage: "vision",
    });
    expect(vision).toHaveBeenCalledOnce();
    expect(vision).toHaveBeenCalledWith(expect.objectContaining({ image: jpeg(), ocrText: input.ocrText }));
  });

  it.each(["消费支出", "收入退款"])("rejects descriptive vision type %s instead of coercing it", async (type) => {
    const service = createBookkeepingVisionRerecognitionService({
      visionProviders: {
        QWEN: vi.fn(async () => ({
          ok: true as const,
          value: [{ ...draft, type }],
          model: "qwen-vision",
        })),
      },
    });

    await expect(service.rerecognize(input, jpeg())).resolves.toMatchObject({
      ok: false,
      reason: "invalid_response",
    });
  });

  it.each(["quota_exhausted", "rate_limit", "server_error", "invalid_response"])(
    "does not return a draft when vision fails with %s",
    async (reason) => {
      const service = createBookkeepingVisionRerecognitionService({
        textProviders: { QWEN: vi.fn(async () => ({ ok: false, reason: "invalid_response" })) },
        visionProviders: { QWEN: vi.fn(async () => ({ ok: false, reason })) },
      });

      await expect(service.rerecognize(input, jpeg())).resolves.toEqual({ ok: false, reason });
    },
  );

  it("does no provider request when already cancelled", async () => {
    const text = vi.fn();
    const vision = vi.fn();
    const service = createBookkeepingVisionRerecognitionService({
      textProviders: { QWEN: text },
      visionProviders: { QWEN: vision },
    });
    const controller = new AbortController();
    controller.abort();

    await expect(service.rerecognize({ ...input, signal: controller.signal }, jpeg()))
      .resolves.toEqual({ ok: false, reason: "request_aborted" });
    expect(text).not.toHaveBeenCalled();
    expect(vision).not.toHaveBeenCalled();
  });

  it("sends Qwen vision a base64 JPEG only through the configured Beijing workspace endpoint", async () => {
    const requests: Array<{ url: string; body: string }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: String(init?.body) });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([draft]) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const workspaceUrl = "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
    const service = createBookkeepingVisionRerecognitionService({
      env: {
        QWEN_API_KEY: "server-only-test-key",
        QWEN_TEXT_BASE_URL: workspaceUrl,
        QWEN_VISION_BASE_URL: workspaceUrl,
      } as NodeJS.ProcessEnv,
      fetchImpl,
    });

    await expect(service.rerecognize(input, jpeg())).resolves.toMatchObject({ ok: true, stage: "vision" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(workspaceUrl);
    expect(requests[0].body).toContain(`data:image/jpeg;base64,${jpeg().toString("base64")}`);
    expect(requests[0].body).not.toContain("server-only-test-key");
  });

  it("returns one complete draft per visible valid train-ticket card in a single vision request", async () => {
    const outboundBodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      outboundBodies.push(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify([outboundTicket, returnTicket]) } }],
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const workspaceUrl = "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
    const service = createBookkeepingVisionRerecognitionService({
      env: {
        QWEN_API_KEY: "server-only-test-key",
        QWEN_VISION_BASE_URL: workspaceUrl,
      } as NodeJS.ProcessEnv,
      fetchImpl,
    });

    await expect(service.rerecognize({
      ...input,
      ocrText: "订单1 D3123 上海虹桥-杭州东 03车08F 73元；订单2 G1024 杭州东-上海虹桥 06车12A 146元；订单3 已取消",
    }, jpeg())).resolves.toEqual({
      ok: true,
      drafts: [outboundTicket, returnTicket],
      provider: "QWEN",
      model: "qwen3.5-ocr",
      stage: "vision",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(outboundBodies[0]).toContain("逐个可见订单卡片");
    expect(outboundBodies[0]).toContain("商品");
    expect(outboundBodies[0]).toContain("订单时间");
    expect(outboundBodies[0]).toContain("支付时间");
    expect(outboundBodies[0]).toContain("不得跨卡片");
    for (const excludedContent of ["已取消", "广告", "权益", "推荐"]) {
      expect(outboundBodies[0]).toContain(excludedContent);
    }
  });

  it("rejects an empty JSON array from the vision model", async () => {
    const workspaceUrl = "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
    const service = createBookkeepingVisionRerecognitionService({
      env: { QWEN_API_KEY: "key", QWEN_VISION_BASE_URL: workspaceUrl } as NodeJS.ProcessEnv,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: "[]" } }],
      }), { status: 200 })) as unknown as typeof fetch,
    });

    await expect(service.rerecognize(input, jpeg())).resolves.toEqual({ ok: false, reason: "invalid_response" });
  });

  it("rejects a non-array JSON response from the vision model", async () => {
    const service = qwenFetchService(JSON.stringify(draft));

    await expect(service.rerecognize(input, jpeg())).resolves.toEqual({ ok: false, reason: "invalid_response" });
  });

  it("rejects an otherwise valid JSON array surrounded by explanatory text", async () => {
    const service = qwenFetchService(`识别结果如下：\n${JSON.stringify([draft])}\n请查收。`);

    await expect(service.rerecognize(input, jpeg())).resolves.toEqual({ ok: false, reason: "invalid_response" });
  });

  it("rejects the whole response when any array item is missing a required field", async () => {
    const missingAmount: Partial<typeof returnTicket> = { ...returnTicket };
    delete missingAmount.amount;
    const service = qwenFetchService(JSON.stringify([outboundTicket, missingAmount]));

    await expect(service.rerecognize(input, jpeg())).resolves.toEqual({ ok: false, reason: "invalid_response" });
  });

  it("rejects an unapproved Qwen vision model before any upstream request", async () => {
    const fetchImpl = vi.fn();
    const workspaceUrl = "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
    const service = createBookkeepingVisionRerecognitionService({
      textProviders: { QWEN: vi.fn(async () => ({ ok: false, reason: "invalid_response" })) },
      env: {
        QWEN_API_KEY: "server-only-test-key",
        QWEN_TEXT_BASE_URL: workspaceUrl,
        QWEN_VISION_BASE_URL: workspaceUrl,
        QWEN_VISION_MODEL: "unapproved-model",
      } as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(service.rerecognize(input, jpeg())).resolves.toEqual({ ok: false, reason: "configuration_invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function jpeg() {
  return Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9]);
}

function qwenFetchService(content: string) {
  const workspaceUrl = "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
  return createBookkeepingVisionRerecognitionService({
    env: { QWEN_API_KEY: "key", QWEN_VISION_BASE_URL: workspaceUrl } as NodeJS.ProcessEnv,
    fetchImpl: vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200 })) as unknown as typeof fetch,
  });
}
