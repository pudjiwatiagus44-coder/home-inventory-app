import { afterEach, describe, expect, it, vi } from "vitest";

import { createBookkeepingTranslationClient } from "./translation";

const TWO_SEGMENT_RESPONSE = JSON.stringify({
  detectedSourceLanguage: "en",
  segments: [
    {
      originalText: "Hello world.",
      translatedText: "你好，世界。",
      vocabulary: [{ term: "world", meaning: "世界" }],
    },
    {
      originalText: "See more",
      translatedText: "查看更多",
      vocabulary: [],
    },
  ],
});

describe("bookkeeping translation client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets the model split raw text and returns complete original/translation pairs", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("doubao-seed-2-0-mini-260428");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("自行按自然句");
      expect(body.messages[0].content).toContain("真正影响理解");
      expect(body.messages[0].content).toContain("每句最多 2 项");
      expect(body.messages[0].content).toContain("整段最多 8 项");
      expect(body.messages[0].content).toContain("[EMAIL]");
      expect(JSON.parse(body.messages[1].content)).toEqual({
        text: "Hello world.\nSee more",
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
      });
      return new Response(JSON.stringify({
        choices: [{ message: { content: TWO_SEGMENT_RESPONSE } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createBookkeepingTranslationClient({ fetchImpl: fetchImpl as typeof fetch, env: {} });

    const result = await client.translate({
      text: "Hello world.\nSee more",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "DOUBAO",
      apiKey: "test-key",
    });

    expect(result).toEqual({
      ok: true,
      translatedText: "你好，世界。\n查看更多",
      segments: [
        {
          originalText: "Hello world.",
          translatedText: "你好，世界。",
          vocabulary: [{ term: "world", meaning: "世界" }],
        },
        {
          originalText: "See more",
          translatedText: "查看更多",
          vocabulary: [],
        },
      ],
      detectedSourceLanguage: "en",
      model: "doubao-seed-2-0-mini-260428",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("accepts a fenced JSON response with sentence vocabulary", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "```json\n{\"segments\":[{\"originalText\":\"Hello\",\"translatedText\":\"你好\",\"vocabulary\":[{\"term\":\"Hello\",\"meaning\":\"你好\"}]}]}\n```",
        },
      }],
    }), { status: 200 }));
    const client = createBookkeepingTranslationClient({ fetchImpl: fetchImpl as typeof fetch, env: {} });

    await expect(client.translate({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "DOUBAO", apiKey: "test-key",
    })).resolves.toMatchObject({
      ok: true,
      translatedText: "你好",
      segments: [{
        originalText: "Hello",
        translatedText: "你好",
        vocabulary: [{ term: "Hello", meaning: "你好" }],
      }],
    });
  });

  it("rejects extra fields, incomplete coverage and reordered text", async () => {
    const cases = [
      JSON.stringify({
        explanation: "extra",
        segments: [{ originalText: "Hello", translatedText: "你好", vocabulary: [] }],
      }),
      JSON.stringify({
        segments: [{ originalText: "Hello", translatedText: "你好", vocabulary: [] }],
      }),
      JSON.stringify({
        segments: [
          { originalText: "world", translatedText: "世界", vocabulary: [] },
          { originalText: "Hello", translatedText: "你好", vocabulary: [] },
        ],
      }),
    ];
    for (const content of cases) {
      const client = createBookkeepingTranslationClient({
        fetchImpl: (async () => new Response(JSON.stringify({
          choices: [{ message: { content } }],
        }), { status: 200 })) as typeof fetch,
        env: {},
      });
      await expect(client.translate({
        text: "Hello world", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "DOUBAO", apiKey: "test-key",
      })).resolves.toEqual({ ok: false, reason: "invalid_response" });
    }
  });

  it("drops invalid vocabulary instead of failing the whole translation", async () => {
    const client = createBookkeepingTranslationClient({
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [{
                originalText: "Hello world",
                translatedText: "你好，世界",
                vocabulary: [
                  { term: "invented", meaning: "编造的" },
                  { term: "world", meaning: "世界" },
                  { term: "world", meaning: "重复" },
                  { term: "", meaning: "空词" },
                ],
              }],
            }),
          },
        }],
      }), { status: 200 })) as typeof fetch,
      env: {},
    });

    await expect(client.translate({
      text: "Hello world", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "DOUBAO", apiKey: "test-key",
    })).resolves.toMatchObject({
      ok: true,
      translatedText: "你好，世界",
      segments: [{
        originalText: "Hello world",
        translatedText: "你好，世界",
        vocabulary: [{ term: "world", meaning: "世界" }],
      }],
    });
  });

  it("accepts AI segmentation that only differs by whitespace and punctuation variants", async () => {
    const client = createBookkeepingTranslationClient({
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [
                {
                  originalText: "A pro-life advocate",
                  translatedText: "一位反堕胎倡导者",
                  vocabulary: [{ term: "pro-life", meaning: "反堕胎的" }],
                },
                {
                  originalText: "spoke at a rally...",
                  translatedText: "在集会上发言……",
                  vocabulary: [{ term: "rally", meaning: "集会" }],
                },
              ],
            }),
          },
        }],
      }), { status: 200 })) as typeof fetch,
      env: {},
    });

    await expect(client.translate({
      text: "A pro‑life advocate spoke at a rally…",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "DOUBAO",
      apiKey: "test-key",
    })).resolves.toMatchObject({
      ok: true,
      translatedText: "一位反堕胎倡导者\n在集会上发言……",
    });
  });

  it("keeps only two difficult words in one sentence", async () => {
    const client = createBookkeepingTranslationClient({
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [{
                originalText: "Alpha beta gamma.",
                translatedText: "阿尔法 贝塔 伽马。",
                vocabulary: [
                  { term: "Alpha", meaning: "阿尔法" },
                  { term: "beta", meaning: "贝塔" },
                  { term: "gamma", meaning: "伽马" },
                ],
              }],
            }),
          },
        }],
      }), { status: 200 })) as typeof fetch,
      env: {},
    });

    await expect(client.translate({
      text: "Alpha beta gamma.", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "DOUBAO", apiKey: "test-key",
    })).resolves.toMatchObject({
      ok: true,
      segments: [{
        vocabulary: [
          { term: "Alpha", meaning: "阿尔法" },
          { term: "beta", meaning: "贝塔" },
        ],
      }],
    });
  });

  it("keeps only eight difficult words across the whole page", async () => {
    const pairs = [
      ["Alpha beta.", "Alpha", "beta"],
      ["Gamma delta.", "Gamma", "delta"],
      ["Epsilon zeta.", "Epsilon", "zeta"],
      ["Eta theta.", "Eta", "theta"],
      ["Iota kappa.", "Iota", "kappa"],
    ];
    const client = createBookkeepingTranslationClient({
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              segments: pairs.map(([originalText, first, second]) => ({
                originalText,
                translatedText: `${originalText} 的译文`,
                vocabulary: [
                  { term: first, meaning: `${first} 的解释` },
                  { term: second, meaning: `${second} 的解释` },
                ],
              })),
            }),
          },
        }],
      }), { status: 200 })) as typeof fetch,
      env: {},
    });

    const result = await client.translate({
      text: pairs.map(([originalText]) => originalText).join(" "),
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "DOUBAO",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.segments.flatMap((segment) => segment.vocabulary)).toEqual([
      { term: "Alpha", meaning: "Alpha 的解释" },
      { term: "beta", meaning: "beta 的解释" },
      { term: "Gamma", meaning: "Gamma 的解释" },
      { term: "delta", meaning: "delta 的解释" },
      { term: "Epsilon", meaning: "Epsilon 的解释" },
      { term: "zeta", meaning: "zeta 的解释" },
      { term: "Eta", meaning: "Eta 的解释" },
      { term: "theta", meaning: "theta 的解释" },
    ]);
  });

  it("splits long pages into ordered chunks so truncated model output cannot fail the page", async () => {
    const lines = Array.from(
      { length: 80 },
      (_, index) => `Sentence ${index + 1} explains how the regional team reviews evidence and documents its decisions.`,
    );
    const text = lines.join("\n");
    const chunks: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const chunk = JSON.parse(String(request.messages[1].content)).text as string;
      chunks.push(chunk);
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              detectedSourceLanguage: "en",
              segments: [{ originalText: chunk, translatedText: `译文${chunks.length}`, vocabulary: [] }],
            }),
          },
        }],
      }), { status: 200 });
    });
    const client = createBookkeepingTranslationClient({ fetchImpl: fetchImpl as typeof fetch, env: {} });

    const result = await client.translate({
      text, sourceLanguage: "en", targetLanguage: "zh-CN", provider: "DOUBAO", apiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
    expect(result.segments.map((segment) => segment.originalText).join("").replace(/\s+/g, ""))
      .toBe(text.replace(/\s+/g, ""));
    expect(result.translatedText).toBe(chunks.map((_, index) => `译文${index + 1}`).join("\n"));
    expect(result.detectedSourceLanguage).toBe("en");
  });

  it("maps provider authentication, quota, rate limit and server errors", async () => {
    const cases: Array<[number, string]> = [
      [401, "auth_invalid"],
      [403, "quota_exhausted"],
      [429, "rate_limit"],
      [500, "server_error"],
    ];
    for (const [status, reason] of cases) {
      const client = createBookkeepingTranslationClient({
        fetchImpl: (async () => new Response("{}", { status })) as typeof fetch,
        env: {},
      });
      await expect(client.translate({
        text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "DOUBAO", apiKey: "test-key",
      })).resolves.toEqual({ ok: false, reason });
    }
  });

  it("uses the configured Qwen base URL and model", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "{\"segments\":[{\"originalText\":\"Hello\",\"translatedText\":\"你好\",\"vocabulary\":[]}]}",
        },
      }],
    }), { status: 200 }));
    const client = createBookkeepingTranslationClient({
      fetchImpl: fetchImpl as typeof fetch,
      env: { QWEN_TEXT_BASE_URL: "https://qwen.example/chat", QWEN_TEXT_MODEL: "qwen3.7-flash" },
    });

    await client.translate({
      text: "Hello", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "QWEN", apiKey: "qwen-key",
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://qwen.example/chat", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer qwen-key" }),
    }));
  });
});
