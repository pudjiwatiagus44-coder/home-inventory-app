import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBookkeepingWordLookupHandlers } from "./handlers";

const CARD = {
  word: "advocate",
  phonetic: { uk: "/ˈædvəkət/", us: "/ˈædvəkeɪt/" },
  partOfSpeech: "noun",
  contextMeaning: "a person who publicly supports a cause",
  morphology: [
    { type: "prefix" as const, part: "ad-", meaning: "toward" },
    { type: "root" as const, part: "voc", meaning: "voice; call" },
  ],
  mnemonic: "ad- (toward) + voc (voice) = someone who gives voice to a cause.",
  examples: [
    "She is a strong advocate for ordinary families.",
    "He advocates keeping the library open longer.",
  ],
};

describe("POST /api/bookkeeping/word-lookup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an English word card through the platform Doubao key", async () => {
    vi.stubEnv("DOUBAO_API_KEY", "platform-key");
    const lookupClient = {
      lookup: vi.fn(async () => ({ ok: true as const, card: CARD, model: "fake-model" })),
    };
    const handlers = createBookkeepingWordLookupHandlers({ lookupClient });
    const response = await handlers.POST(request({}));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: CARD,
      model: "fake-model",
      provider: "DOUBAO",
      credentialMode: "PLATFORM",
    });
    expect(lookupClient.lookup).toHaveBeenCalledWith(expect.objectContaining({
      word: "advocate",
      context: "In the video, a peaceful advocate is interviewed at a rally.",
      provider: "DOUBAO",
    }));
  });

  it("rejects image fields, non-English words and a word absent from the context", async () => {
    const lookupClient = { lookup: vi.fn() };
    const handlers = createBookkeepingWordLookupHandlers({ lookupClient });

    const imageResponse = await handlers.POST(request({ image: "not-allowed" }));
    expect(imageResponse.status).toBe(400);

    const chineseWord = await handlers.POST(request({ word: "倡导者" }));
    expect(chineseWord.status).toBe(400);

    const absentWord = await handlers.POST(request({ word: "policy" }));
    expect(absentWord.status).toBe(400);
    await expect(absentWord.json()).resolves.toMatchObject({ errorCode: "WORD_NOT_IN_CONTEXT" });
    expect(lookupClient.lookup).not.toHaveBeenCalled();
  });

  it("rejects context over one thousand characters and bodies over eight kilobytes", async () => {
    const lookupClient = { lookup: vi.fn() };
    const handlers = createBookkeepingWordLookupHandlers({ lookupClient });

    const tooLong = await handlers.POST(request({ context: `advocate ${"x".repeat(1_000)}` }));
    expect(tooLong.status).toBe(400);

    const bodyTooLarge = await handlers.POST(request({ padding: "x".repeat(8 * 1024) }));
    expect(bodyTooLarge.status).toBe(413);
    expect(lookupClient.lookup).not.toHaveBeenCalled();
  });

  it("requires a session for personal credentials and routes Qwen keys", async () => {
    const unauthenticated = createBookkeepingWordLookupHandlers({ lookupClient: { lookup: vi.fn() } });
    const unauthorized = await unauthenticated.POST(request({ credentialMode: "PERSONAL" }));
    expect(unauthorized.status).toBe(401);

    const lookupClient = {
      lookup: vi.fn(async () => ({ ok: true as const, card: CARD, model: "fake-model" })),
    };
    const qwen = { decryptForProvider: vi.fn(async (userId: string) => userId === "user-a" ? "qwen-user-a" : null) };
    const handlers = createBookkeepingWordLookupHandlers({
      lookupClient,
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      qwenCredentialService: qwen,
    });
    const response = await handlers.POST(request({ provider: "QWEN", credentialMode: "PERSONAL" }, true));

    expect(response.status).toBe(200);
    expect(qwen.decryptForProvider).toHaveBeenCalledWith("user-a");
    expect(lookupClient.lookup).toHaveBeenCalledWith(expect.objectContaining({ provider: "QWEN", apiKey: "qwen-user-a" }));
  });

  it("maps provider failures and honors the static API token gate", async () => {
    vi.stubEnv("DOUBAO_API_KEY", "platform-key");
    const timeoutHandlers = createBookkeepingWordLookupHandlers({
      lookupClient: { lookup: vi.fn(async () => ({ ok: false as const, reason: "timeout" as const })) },
    });
    const timeoutResponse = await timeoutHandlers.POST(request({}));
    expect(timeoutResponse.status).toBe(504);
    await expect(timeoutResponse.json()).resolves.toEqual({
      ok: false,
      message: "timeout",
      errorCode: "WORD_LOOKUP_TIMEOUT",
    });

    vi.stubEnv("BOOKKEEPING_API_TOKEN", "lookup-secret");
    const gated = createBookkeepingWordLookupHandlers({ lookupClient: { lookup: vi.fn() } });
    expect((await gated.POST(request({}))).status).toBe(401);
  });
});

function request(overrides: Record<string, unknown>, authenticated = false) {
  return new NextRequest("http://localhost/api/bookkeeping/word-lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: "home_inventory_session=session-token" } : {}),
    },
    body: JSON.stringify({
      word: "advocate",
      context: "In the video, a peaceful advocate is interviewed at a rally.",
      provider: "DOUBAO",
      credentialMode: "PLATFORM",
      ...overrides,
    }),
  });
}
