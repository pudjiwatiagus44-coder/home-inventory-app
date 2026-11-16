import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBookkeepingTranslateHandlers } from "./handlers";

describe("POST /api/bookkeeping/translate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("translates sanitized text through the current account's personal Doubao key", async () => {
    const translator = {
      translate: vi.fn(async () => overridesSuccess("你好，世界")),
    };
    const credentialService = {
      resolveForUser: vi.fn(async () => ({ source: "PERSONAL" as const, apiKey: "ark-user-a", revision: "rev-a" })),
      recordProviderFailure: vi.fn(async () => undefined),
      recordProviderSuccess: vi.fn(async () => undefined),
    };
    const handlers = createBookkeepingTranslateHandlers({
      translator,
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      credentialService,
    });

    const response = await handlers.POST(request({
      text: "Hello world",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "DOUBAO",
      credentialMode: "PERSONAL",
    }, true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        translatedText: "你好，世界",
        segments: [{
          originalText: "Hello world",
          translatedText: "你好，世界",
          vocabulary: [{ term: "world", meaning: "世界" }],
        }],
      },
      model: "fake-model",
      provider: "DOUBAO",
      credentialMode: "PERSONAL",
      credentialSource: "PERSONAL",
    });
    expect(translator.translate).toHaveBeenCalledWith(expect.objectContaining({
      text: "Hello world",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "DOUBAO",
      apiKey: "ark-user-a",
    }));
    expect(credentialService.recordProviderSuccess).toHaveBeenCalledWith("user-a", "rev-a");
  });

  it("rejects image fields and same-language requests before model calls", async () => {
    const translator = { translate: vi.fn() };
    const handlers = createBookkeepingTranslateHandlers({ translator });

    const imageResponse = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN", image: "not-allowed",
    }));
    expect(imageResponse.status).toBe(400);

    const sameLanguageResponse = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "en",
    }));
    expect(sameLanguageResponse.status).toBe(400);
    await expect(sameLanguageResponse.json()).resolves.toMatchObject({ errorCode: "SAME_LANGUAGE" });
    expect(translator.translate).not.toHaveBeenCalled();
  });

  it("rejects auto as a target and text over the limit", async () => {
    const handlers = createBookkeepingTranslateHandlers({ translator: { translate: vi.fn() } });

    const autoTarget = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "auto",
    }));
    expect(autoTarget.status).toBe(400);
    await expect(autoTarget.json()).resolves.toMatchObject({ errorCode: "INVALID_LANGUAGE" });

    const tooLong = await handlers.POST(request({
      text: "x".repeat(12_001), sourceLanguage: "en", targetLanguage: "zh-CN",
    }));
    expect(tooLong.status).toBe(413);
    await expect(tooLong.json()).resolves.toMatchObject({ errorCode: "TEXT_TOO_LONG" });
  });

  it("rejects a translation body over the dedicated 64 KB boundary", async () => {
    const translator = { translate: vi.fn() };
    const handlers = createBookkeepingTranslateHandlers({ translator });

    const response = await handlers.POST(request({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      padding: "x".repeat(64 * 1024),
    }));

    expect(response.status).toBe(413);
    expect(translator.translate).not.toHaveBeenCalled();
  });

  it("requires a session for personal credentials", async () => {
    const handlers = createBookkeepingTranslateHandlers({ translator: { translate: vi.fn() } });
    const response = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN",
      provider: "DOUBAO", credentialMode: "PERSONAL",
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ errorCode: "AUTHENTICATION_REQUIRED" });
  });

  it("routes Qwen through the current user's key without exposing it", async () => {
    const translator = { translate: vi.fn(async () => overridesSuccess("你好")) };
    const qwen = { decryptForProvider: vi.fn(async (userId: string) => userId === "user-a" ? "qwen-user-a" : null) };
    const handlers = createBookkeepingTranslateHandlers({
      translator,
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      qwenCredentialService: qwen,
    });

    const response = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN",
      provider: "QWEN", credentialMode: "PERSONAL",
    }, true));

    expect(response.status).toBe(200);
    expect(qwen.decryptForProvider).toHaveBeenCalledWith("user-a");
    expect(translator.translate).toHaveBeenCalledWith(expect.objectContaining({ provider: "QWEN", apiKey: "qwen-user-a" }));
  });

  it("maps provider failures without leaking the provider response", async () => {
    const translator = { translate: vi.fn(async () => ({ ok: false as const, reason: "timeout" as const })) };
    const handlers = createBookkeepingTranslateHandlers({
      translator,
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      qwenCredentialService: { decryptForProvider: async () => "qwen-key" },
    });

    const response = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN",
      provider: "QWEN", credentialMode: "PERSONAL",
    }, true));

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      ok: false, message: "timeout", errorCode: "TRANSLATION_TIMEOUT",
    });
  });

  it("honors the existing static API token gate", async () => {
    vi.stubEnv("BOOKKEEPING_API_TOKEN", "translation-secret");
    const handlers = createBookkeepingTranslateHandlers({ translator: { translate: vi.fn() } });

    const unauthorized = await handlers.POST(request({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN",
    }));
    expect(unauthorized.status).toBe(401);
  });
});

function overridesSuccess(translatedText: string) {
  return {
    ok: true as const,
    translatedText,
    segments: [{
      originalText: "Hello world",
      translatedText,
      vocabulary: [{ term: "world", meaning: "世界" }],
    }],
    model: "fake-model",
  };
}

function request(body: unknown, authenticated = false) {
  return new NextRequest("http://localhost/api/bookkeeping/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: "home_inventory_session=session-token" } : {}),
    },
    body: JSON.stringify({ provider: "DOUBAO", credentialMode: "PLATFORM", ...(body as Record<string, unknown>) }),
  });
}
