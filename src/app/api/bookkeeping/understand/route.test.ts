import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createBookkeepingUnderstandHandlers } from "./handlers";

describe("POST /api/bookkeeping/understand", () => {
  it("returns all structured fields", async () => {
    const value = {
      dateTime: "2026-08-10 22:56", type: "支出", category: "购物", amount: "8.00",
      currency: "人民币", payerPayee: "拼多多平台商户", account: "信用卡(7420)",
      participant: "自己", tag: "先用后付", merchant: "拼多多平台商户",
      property: "日常消费", note: "订单已完成",
    };
    const understandOcrText = vi.fn(async () => ({ ok: true as const, value: [value], model: "doubao-test" }));
    const handlers = createBookkeepingUnderstandHandlers({ client: { understandOcrText } });

    const response = await handlers.POST(request({
      ocrText: "¥8.00\n下单时间 8月10日 22:56",
      capturedAt: "2026-08-21T15:30:00+08:00",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: [value], model: "doubao-test" });
    expect(understandOcrText).toHaveBeenCalledOnce();
  });

  it("uses only the current session's hosted DeepSeek key for provider=DEEPSEEK", async () => {
    const deepseek = { decryptForProvider: vi.fn(async () => "sk-user-a-key") };
    const doubaoCredentialService = {
      resolveForUser: vi.fn(async () => ({ source: "PERSONAL" as const, apiKey: "ark-user-a-key", revision: "rev-a" })),
      recordProviderFailure: vi.fn(),
      recordProviderSuccess: vi.fn(),
    };
    const deepseekProvider = { understand: vi.fn(async () => ({ ok: true as const, value: [draft("12", "早餐")], model: "deepseek-flash" })) };
    const handlers = createBookkeepingUnderstandHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      deepseekCredentialService: deepseek,
      credentialService: doubaoCredentialService,
      providers: { doubao: deepseekProvider, qwen: deepseekProvider, deepseek: deepseekProvider },
    });

    const response = await handlers.POST(request({ ocrText: "早餐 12 元", provider: "DEEPSEEK" }, true));

    expect(response.status).toBe(200);
    expect(deepseek.decryptForProvider).toHaveBeenCalledWith("user-a");
    expect(doubaoCredentialService.resolveForUser).not.toHaveBeenCalled();
    expect(doubaoCredentialService.recordProviderSuccess).not.toHaveBeenCalled();
    expect(doubaoCredentialService.recordProviderFailure).not.toHaveBeenCalled();
    expect(deepseekProvider.understand).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ ok: true, model: "deepseek-flash" });
  });

  it("maps a DeepSeek text timeout to 504 without mutating a Doubao credential", async () => {
    const doubaoCredentialService = {
      resolveForUser: vi.fn(), recordProviderFailure: vi.fn(), recordProviderSuccess: vi.fn(),
    };
    const deepseekProvider = { understand: vi.fn(async () => ({ ok: false as const, reason: "timeout" })) };
    const handlers = createBookkeepingUnderstandHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      deepseekCredentialService: { decryptForProvider: async () => "sk-user-a-key" },
      credentialService: doubaoCredentialService,
      providers: { doubao: deepseekProvider, qwen: deepseekProvider, deepseek: deepseekProvider },
    });

    const response = await handlers.POST(request({ ocrText: "早餐 12 元", provider: "DEEPSEEK" }, true));

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "deepseek_timeout", errorCode: "DEEPSEEK_TIMEOUT" });
    expect(doubaoCredentialService.resolveForUser).not.toHaveBeenCalled();
    expect(doubaoCredentialService.recordProviderFailure).not.toHaveBeenCalled();
  });

  it("returns a stable code without calling a provider when DeepSeek is not configured", async () => {
    const deepseek = { decryptForProvider: vi.fn(async () => null) };
    const handlers = createBookkeepingUnderstandHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      deepseekCredentialService: deepseek,
    });

    const response = await handlers.POST(request({ ocrText: "早餐 12 元", provider: "DEEPSEEK" }, true));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "deepseek_credential_not_configured", errorCode: "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED" });
  });

  it("rejects blank OCR text", async () => {
    const handlers = createBookkeepingUnderstandHandlers();
    const response = await handlers.POST(request({ ocrText: "  " }));
    expect(response.status).toBe(400);
  });

  it("rejects oversized OCR text", async () => {
    const handlers = createBookkeepingUnderstandHandlers();
    const response = await handlers.POST(request({ ocrText: "x".repeat(12_001) }));
    expect(response.status).toBe(413);
  });

  it("passes enabled category context to the recognizer", async () => {
    const understandOcrText = vi.fn(async () => ({ ok: true as const, value: [], model: "doubao-test" }));
    const handlers = createBookkeepingUnderstandHandlers({ client: { understandOcrText } });
    await handlers.POST(request({
      ocrText: "早餐 12 元",
      categories: [{ name: "餐饮/早餐", type: "Expense", keywords: "早餐" }],
    }));
    expect(understandOcrText).toHaveBeenCalledWith(
      "早餐 12 元",
      expect.any(String),
      [{ name: "餐饮/早餐", type: "Expense", keywords: "早餐" }],
      [],
      [],
      { signal: expect.any(AbortSignal) },
    );
  });

  it("loads at most ten private examples when a login session exists", async () => {
    const examples = Array.from({ length: 10 }, (_, index) => ({
      sourceText: `历史文本${index}`,
      corrected: {
        dateTime: "", type: "支出", category: "餐饮", amount: String(index + 1), currency: "人民币",
        payerPayee: "", account: "", participant: "自己", tag: "", merchant: "", property: "", note: "",
      },
    }));
    const feedbackService = {
      findSimilarForCurrentUser: vi.fn(async () => examples),
    };
    const understandOcrText = vi.fn(async () => ({ ok: true as const, value: [], model: "doubao-test" }));
    const handlers = createBookkeepingUnderstandHandlers({
      client: { understandOcrText },
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      feedbackService,
    });

    await handlers.POST(request({ ocrText: "早餐12元" }, true));

    expect(feedbackService.findSimilarForCurrentUser).toHaveBeenCalledWith("user-a", "早餐12元", 10);
    expect(understandOcrText).toHaveBeenCalledWith(
      "早餐12元", expect.any(String), [], examples, [], { signal: expect.any(AbortSignal) },
    );
  });

  it("uses no examples without a login session and degrades on feedback lookup failure", async () => {
    const feedbackService = {
      findSimilarForCurrentUser: vi.fn(async () => { throw new Error("database unavailable with secret text"); }),
    };
    const understandOcrText = vi.fn(async () => ({ ok: true as const, value: [], model: "doubao-test" }));
    const unauthenticated = createBookkeepingUnderstandHandlers({ client: { understandOcrText }, feedbackService });
    await unauthenticated.POST(request({ ocrText: "午餐20元" }));
    expect(feedbackService.findSimilarForCurrentUser).not.toHaveBeenCalled();
    expect(understandOcrText).toHaveBeenLastCalledWith(
      "午餐20元", expect.any(String), [], [], [], { signal: expect.any(AbortSignal) },
    );

    const authenticated = createBookkeepingUnderstandHandlers({
      client: { understandOcrText },
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      feedbackService,
    });
    const response = await authenticated.POST(request({ ocrText: "晚餐30元" }, true));
    expect(response.status).toBe(200);
    expect(understandOcrText).toHaveBeenLastCalledWith(
      "晚餐30元", expect.any(String), [], [], [], { signal: expect.any(AbortSignal) },
    );
  });

  it("reviews a suspected multi-order result and returns every reviewed draft", async () => {
    const first = draft("18.20", "纸巾");
    const reviewed = [first, draft("32.50", "洗衣液")];
    const understandOcrText = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: [first], model: "doubao-test" })
      .mockResolvedValueOnce({ ok: true as const, value: reviewed, model: "doubao-test" });
    const handlers = createBookkeepingUnderstandHandlers({ client: { understandOcrText } });

    const response = await handlers.POST(request({
      ocrText: "纸巾 实付 ¥18.20\n洗衣液 实付 ¥32.50",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: reviewed });
    expect(understandOcrText).toHaveBeenCalledTimes(2);
    expect(understandOcrText.mock.calls[1]?.[5]).toMatchObject({
      reviewInstruction: expect.stringContaining("逐个订单卡片"),
    });
  });

  it("rejects an incomplete multi-order review instead of returning one draft", async () => {
    const first = draft("18.20", "纸巾");
    const understandOcrText = vi.fn(async () => ({ ok: true as const, value: [first], model: "doubao-test" }));
    const handlers = createBookkeepingUnderstandHandlers({ client: { understandOcrText } });

    const response = await handlers.POST(request({
      ocrText: "纸巾 实付 ¥18.20\n洗衣液 实付 ¥32.50",
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "incomplete_multi_order",
      errorCode: "INCOMPLETE_MULTI_ORDER",
    });
  });
});

function draft(amount: string, note: string) {
  return {
    dateTime: "2026-09-12 22:50", type: "支出", category: "购物", amount,
    currency: "人民币", payerPayee: "测试商店", account: "", participant: "自己",
    tag: "", merchant: "测试商店", property: "", note,
  };
}

function request(body: unknown, authenticated = false) {
  return new NextRequest("http://localhost/api/bookkeeping/understand", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: "home_inventory_session=session-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}
