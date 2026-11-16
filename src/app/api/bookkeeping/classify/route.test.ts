import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBookkeepingClassifyHandlers } from "./handlers";

describe("POST /api/bookkeeping/classify", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("classifies sanitized text through the current account's personal Doubao key", async () => {
    const classifier = {
      classify: vi.fn(async () => ({
        ok: true as const,
        intent: "translation" as const,
        confidence: 0.91,
        reason: "英文文章正文",
        model: "fake-model",
      })),
    };
    const credentialService = {
      resolveForUser: vi.fn(async () => ({ source: "PERSONAL" as const, apiKey: "ark-user-a", revision: "rev-a" })),
      recordProviderFailure: vi.fn(async () => undefined),
      recordProviderSuccess: vi.fn(async () => undefined),
    };
    const handlers = createBookkeepingClassifyHandlers({
      classifier,
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      credentialService,
    });

    const response = await handlers.POST(request({
      text: "Breaking news: today...",
      provider: "DOUBAO",
      credentialMode: "PERSONAL",
    }, true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { intent: "translation", confidence: 0.91, reason: "英文文章正文" },
      model: "fake-model",
      provider: "DOUBAO",
      credentialMode: "PERSONAL",
      credentialSource: "PERSONAL",
    });
    expect(classifier.classify).toHaveBeenCalledWith(expect.objectContaining({
      text: "Breaking news: today...",
      provider: "DOUBAO",
      apiKey: "ark-user-a",
    }));
    expect(credentialService.recordProviderSuccess).toHaveBeenCalledWith("user-a", "rev-a");
  });

  it("rejects image fields, empty text and over-limit text before model calls", async () => {
    const classifier = { classify: vi.fn() };
    const handlers = createBookkeepingClassifyHandlers({ classifier });

    const image = await handlers.POST(request({ text: "x", image: "not-allowed" }));
    expect(image.status).toBe(400);

    const empty = await handlers.POST(request({ text: "   " }));
    expect(empty.status).toBe(400);

    const tooLong = await handlers.POST(request({ text: "x".repeat(12_001) }));
    expect(tooLong.status).toBe(413);
    await expect(tooLong.json()).resolves.toMatchObject({ errorCode: "TEXT_TOO_LONG" });
    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it("requires a session for personal credentials and maps provider failures", async () => {
    const handlers = createBookkeepingClassifyHandlers({ classifier: { classify: vi.fn() } });
    const unauthorized = await handlers.POST(request({
      text: "x",
      provider: "DOUBAO",
      credentialMode: "PERSONAL",
    }));
    expect(unauthorized.status).toBe(401);

    const timeoutHandlers = createBookkeepingClassifyHandlers({
      classifier: { classify: vi.fn(async () => ({ ok: false as const, reason: "timeout" as const })) },
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      qwenCredentialService: { decryptForProvider: async () => "qwen-key" },
    });
    const timeout = await timeoutHandlers.POST(request({
      text: "x",
      provider: "QWEN",
      credentialMode: "PERSONAL",
    }, true));
    expect(timeout.status).toBe(504);
    await expect(timeout.json()).resolves.toEqual({
      ok: false,
      message: "timeout",
      errorCode: "INTENT_TIMEOUT",
    });
  });

  it("honors the existing static API token gate", async () => {
    vi.stubEnv("BOOKKEEPING_API_TOKEN", "classify-secret");
    const handlers = createBookkeepingClassifyHandlers({ classifier: { classify: vi.fn() } });
    const unauthorized = await handlers.POST(request({ text: "x" }));
    expect(unauthorized.status).toBe(401);
  });
});

function request(body: unknown, authenticated = false) {
  return new NextRequest("http://localhost/api/bookkeeping/classify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: "home_inventory_session=session-token" } : {}),
    },
    body: JSON.stringify({ provider: "DOUBAO", credentialMode: "PLATFORM", ...(body as Record<string, unknown>) }),
  });
}
