import { afterEach, describe, expect, it, vi } from "vitest";

import {
  contextContainsEnglishWord,
  createBookkeepingWordLookupClient,
  isValidEnglishWord,
} from "./word-lookup";

const WORD_CARD = {
  word: "advocate",
  phonetic: { uk: "ˈædvəkət", us: "[ˈædvəkeɪt]" },
  partOfSpeech: "noun",
  contextMeaning: "a person who publicly supports a cause",
  morphology: [
    { type: "prefix", part: "ad-", meaning: "toward" },
    { type: "root", part: "voc", meaning: "voice; call" },
  ],
  mnemonic: "ad- (toward) + voc (voice) = someone who gives voice to a cause.",
  examples: [
    "She is a strong advocate for ordinary families.",
    "He advocates keeping the library open longer.",
  ],
};

describe("bookkeeping word lookup client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends only the English word and its sentence and normalizes IPA", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("doubao-seed-2-0-mini-260428");
      expect(body.messages[0].content).toContain("English learner's dictionary editor");
      expect(body.messages[0].content).toContain("Use English for every explanation");
      expect(JSON.parse(body.messages[1].content)).toEqual({
        word: "advocate",
        context: "In the video, a peaceful advocate is interviewed at a rally.",
      });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(WORD_CARD) } }],
      }), { status: 200 });
    });
    const client = createBookkeepingWordLookupClient({ fetchImpl: fetchImpl as typeof fetch, env: {} });

    const result = await client.lookup({
      word: "advocate",
      context: "In the video, a peaceful advocate is interviewed at a rally.",
      provider: "DOUBAO",
      apiKey: "test-key",
    });

    expect(result).toEqual({
      ok: true,
      card: {
        ...WORD_CARD,
        phonetic: { uk: "/ˈædvəkət/", us: "/ˈædvəkeɪt/" },
      },
      model: "doubao-seed-2-0-mini-260428",
    });
  });

  it("accepts a fenced JSON object with apostrophe variants", async () => {
    const fenced = JSON.stringify({
      ...WORD_CARD,
      word: "don’t",
      examples: ["Please don't move the table."],
    });
    const client = createBookkeepingWordLookupClient({
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ message: { content: "```json\n" + fenced + "\n```" } }],
      }), { status: 200 })) as typeof fetch,
      env: {},
    });

    await expect(client.lookup({
      word: "don't",
      context: "Please don't move the table.",
      provider: "DOUBAO",
      apiKey: "test-key",
    })).resolves.toMatchObject({
      ok: true,
      card: { word: "don't" },
    });
  });

  it("rejects extra fields, mismatched words, missing IPA and too many examples", async () => {
    const cases = [
      { ...WORD_CARD, explanation: "extra" },
      { ...WORD_CARD, word: "advocacy" },
      { ...WORD_CARD, phonetic: { uk: "", us: "/ˈædvəkeɪt/" } },
      { ...WORD_CARD, examples: ["a", "b", "c", "d"] },
      { ...WORD_CARD, morphology: [{ type: "infix", part: "ad-", meaning: "toward" }] },
    ];
    for (const content of cases) {
      const client = createBookkeepingWordLookupClient({
        fetchImpl: (async () => new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(content) } }],
        }), { status: 200 })) as typeof fetch,
        env: {},
      });
      await expect(client.lookup({
        word: "advocate",
        context: "The advocate spoke.",
        provider: "DOUBAO",
        apiKey: "test-key",
      })).resolves.toEqual({ ok: false, reason: "invalid_response" });
    }
  });

  it("maps provider errors and requires an API key", async () => {
    await expect(createBookkeepingWordLookupClient({ env: {} }).lookup({
      word: "advocate",
      context: "The advocate spoke.",
      provider: "DOUBAO",
      apiKey: "",
    })).resolves.toEqual({ ok: false, reason: "api_key_missing" });

    for (const [status, reason] of [[401, "auth_invalid"], [403, "quota_exhausted"], [429, "rate_limit"], [500, "server_error"]] as const) {
      const client = createBookkeepingWordLookupClient({
        fetchImpl: (async () => new Response("{}", { status })) as typeof fetch,
        env: {},
      });
      await expect(client.lookup({
        word: "advocate",
        context: "The advocate spoke.",
        provider: "DOUBAO",
        apiKey: "test-key",
      })).resolves.toEqual({ ok: false, reason });
    }
  });
});

describe("English word validation", () => {
  it("accepts words, contractions and internal hyphens", () => {
    for (const word of ["advocate", "don't", "don’t", "pro-life", "mother-in-law", "I"]) {
      expect(isValidEnglishWord(word)).toBe(true);
    }
  });

  it("rejects Chinese, URL fragments, numbers and leading/trailing punctuation", () => {
    for (const word of ["你好", "3rd", "-word", "word-", "word!", ""]) {
      expect(isValidEnglishWord(word)).toBe(false);
    }
  });

  it("requires a whole-token match in the context", () => {
    expect(contextContainsEnglishWord("A pro-life advocate spoke.", "advocate")).toBe(true);
    expect(contextContainsEnglishWord("A pro-life advocate spoke.", "pro-life")).toBe(true);
    expect(contextContainsEnglishWord("The artistry is clear.", "art")).toBe(false);
    expect(contextContainsEnglishWord("Don’t stop.", "don't")).toBe(true);
  });
});
