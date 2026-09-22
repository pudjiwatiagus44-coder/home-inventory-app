import { describe, expect, it, vi } from "vitest";

import {
  createTextUnderstandingProviders,
  type TextUnderstandingProvider,
  understandWithFallback,
} from "./bookkeeping-understanding-service";

const input = {
  ocrText: "早餐 12 元",
  capturedAt: "2026-09-10T10:00:00Z",
};

const draft = [{
  dateTime: "2026-09-10 10:00", type: "支出", category: "餐饮", amount: "12",
  currency: "人民币", payerPayee: "", account: "", participant: "自己", tag: "",
  merchant: "", property: "", note: "",
}];

function provider(result: ReturnType<TextUnderstandingProvider["understand"]> extends Promise<infer Value> ? Value : never) {
  return { understand: vi.fn(async () => result) } satisfies TextUnderstandingProvider;
}

describe("understandWithFallback", () => {
  it.each(["rate_limit", "server_error", "upstream_error"] as const)(
    "uses qwen3.7-flash after a retryable Doubao %s failure",
    async (reason) => {
      const doubao = provider({ ok: false, reason });
      const qwen = provider({ ok: true, value: draft, model: "qwen3.7-flash" });

      await expect(understandWithFallback({ mode: "AUTOMATIC", ...input }, { doubao, qwen }))
        .resolves.toEqual({ ok: true, value: draft, model: "qwen3.7-flash" });
      expect(doubao.understand).toHaveBeenCalledOnce();
      expect(qwen.understand).toHaveBeenCalledOnce();
    },
  );

  it.each(["invalid_request", "invalid_response"] as const)(
    "does not switch providers for a Doubao %s failure",
    async (reason) => {
      const doubao = provider({ ok: false, reason });
      const qwen = provider({ ok: true, value: draft, model: "qwen3.7-flash" });

      await expect(understandWithFallback({ mode: "AUTOMATIC", ...input }, { doubao, qwen }))
        .resolves.toEqual({ ok: false, reason });
      expect(qwen.understand).not.toHaveBeenCalled();
    },
  );

  it.each(["401 unauthorized", "403 forbidden"])(
    "does not switch providers when Doubao returns %s",
    async (label) => {
      const doubao = provider({ ok: false, reason: "invalid_request" });
      const qwen = provider({ ok: true, value: draft, model: "qwen3.7-flash" });

      await expect(understandWithFallback({ mode: "AUTOMATIC", ...input }, { doubao, qwen }))
        .resolves.toEqual({ ok: false, reason: "invalid_request" });
      expect(qwen.understand).not.toHaveBeenCalled();
      expect(label).toMatch(/^(401|403)/);
    },
  );

  it("honors a manually selected provider without fallback", async () => {
    const doubao = provider({ ok: false, reason: "rate_limit" });
    const qwen = provider({ ok: true, value: draft, model: "qwen3.7-flash" });

    await expect(understandWithFallback({ mode: "DOUBAO_ONLY", ...input }, { doubao, qwen }))
      .resolves.toEqual({ ok: false, reason: "rate_limit" });
    expect(qwen.understand).not.toHaveBeenCalled();
  });

  it("uses the selected DeepSeek provider without falling back to Doubao or Qwen", async () => {
    const doubao = provider({ ok: true, value: draft, model: "doubao" });
    const qwen = provider({ ok: true, value: draft, model: "qwen" });
    const deepseek = provider({ ok: true, value: draft, model: "deepseek-flash" });

    await expect(understandWithFallback(
      { mode: "DEEPSEEK_ONLY", ...input },
      { doubao, qwen, deepseek },
    )).resolves.toEqual({ ok: true, value: draft, model: "deepseek-flash" });
    expect(deepseek.understand).toHaveBeenCalledOnce();
    expect(doubao.understand).not.toHaveBeenCalled();
    expect(qwen.understand).not.toHaveBeenCalled();
  });

  it("uses deepseek-flash and strictly parses its JSON result when a hosted key is supplied", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("deepseek-flash");
      expect(body.messages).toBeInstanceOf(Array);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    });
    const providers = createTextUnderstandingProviders({}, fetchImpl as typeof fetch, {
      deepseekApiKey: "sk-hosted-test-key",
    });

    await expect(providers.deepseek.understand(input)).resolves.toMatchObject({ ok: true, model: "deepseek-flash" });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer sk-hosted-test-key" }),
    }));
  });

  it("uses qwen3.7-flash when QWEN_TEXT_MODEL is not configured", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).model).toBe("qwen3.7-flash");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft[0]) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const providers = createTextUnderstandingProviders({
      QWEN_API_KEY: "test-key",
      QWEN_TEXT_BASE_URL: "https://example.invalid/compatible-mode/v1/chat/completions",
    }, fetchImpl as typeof fetch);

    await expect(providers.qwen.understand(input)).resolves.toEqual({
      ok: true,
      value: draft,
      model: "qwen3.7-flash",
    });
  });

  it("allows a Qwen text response that takes longer than the shared 15 second default", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(draft[0]) } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } })), 20_000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      })) as unknown as typeof fetch;
      const providers = createTextUnderstandingProviders({
        QWEN_API_KEY: "test-key",
        QWEN_TEXT_BASE_URL: "https://example.invalid/compatible-mode/v1/chat/completions",
      }, fetchImpl);

      const result = providers.qwen.understand(input);
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(result).resolves.toEqual({ ok: true, value: draft, model: "qwen3.7-flash" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start either cloud request after the HTTP request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const doubao = provider({ ok: false, reason: "timeout" });
    const qwen = provider({ ok: true, value: draft, model: "qwen3.7-flash" });

    await expect(understandWithFallback({ mode: "AUTOMATIC", ...input, signal: controller.signal }, { doubao, qwen }))
      .resolves.toEqual({ ok: false, reason: "request_aborted" });
    expect(doubao.understand).not.toHaveBeenCalled();
    expect(qwen.understand).not.toHaveBeenCalled();
  });

  it("does not call Qwen when the HTTP request is aborted while Doubao is pending", async () => {
    const controller = new AbortController();
    const doubao = {
      understand: vi.fn(({ signal }: { signal?: AbortSignal }) => new Promise((resolve) => {
        signal?.addEventListener("abort", () => resolve({ ok: false as const, reason: "request_aborted" }), { once: true });
      })),
    } satisfies TextUnderstandingProvider;
    const qwen = provider({ ok: true, value: draft, model: "qwen3.7-flash" });

    const result = understandWithFallback(
      { mode: "AUTOMATIC", ...input, signal: controller.signal },
      { doubao, qwen },
    );
    controller.abort();

    await expect(result).resolves.toEqual({ ok: false, reason: "request_aborted" });
    expect(qwen.understand).not.toHaveBeenCalled();
  });

  it("falls back to Qwen when the Doubao client receives HTTP 408", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("doubao")) return new Response("", { status: 408 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft[0]) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const providers = createTextUnderstandingProviders({
      DOUBAO_API_KEY: "doubao-test-key",
      DOUBAO_TEXT_BASE_URL: "https://doubao.invalid/chat/completions",
      QWEN_API_KEY: "qwen-test-key",
      QWEN_TEXT_BASE_URL: "https://qwen.invalid/compatible-mode/v1/chat/completions",
    }, fetchImpl as typeof fetch);

    await expect(understandWithFallback({ mode: "AUTOMATIC", ...input }, providers)).resolves.toEqual({
      ok: true,
      value: draft,
      model: "qwen3.7-flash",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("distinguishes a missing Qwen key from a missing Qwen workspace URL", async () => {
    const noKey = createTextUnderstandingProviders({
      QWEN_TEXT_BASE_URL: "https://qwen.invalid/compatible-mode/v1/chat/completions",
    });
    const noUrl = createTextUnderstandingProviders({ QWEN_API_KEY: "test-key" });

    await expect(noKey.qwen.understand(input)).resolves.toEqual({ ok: false, reason: "api_key_missing" });
    await expect(noUrl.qwen.understand(input)).resolves.toEqual({ ok: false, reason: "configuration_missing" });
  });

  it("rejects an unapproved Qwen fallback model instead of silently switching models", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("must not call provider"); });
    const providers = createTextUnderstandingProviders({
      QWEN_API_KEY: "test-key",
      QWEN_TEXT_BASE_URL: "https://qwen.invalid/compatible-mode/v1/chat/completions",
      QWEN_TEXT_MODEL: "qwen-max",
    }, fetchImpl as typeof fetch);

    await expect(providers.qwen.understand(input)).resolves.toEqual({ ok: false, reason: "configuration_invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
