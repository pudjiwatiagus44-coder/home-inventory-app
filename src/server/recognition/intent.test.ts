import { describe, expect, it, vi } from "vitest";

import { createBookkeepingIntentClient } from "./intent";

describe("bookkeeping intent client", () => {
  it("returns a strict bookkeeping or translation decision", async () => {
    const fetchImpl = vi.fn(async () => response({
      intent: "translation",
      confidence: 0.87,
      reason: "英文新闻正文",
    }));
    const client = createBookkeepingIntentClient({ fetchImpl: fetchImpl as typeof fetch, env: {} });

    await expect(client.classify({ text: "Breaking news...", provider: "DOUBAO", apiKey: "key" }))
      .resolves.toEqual({
        ok: true,
        intent: "translation",
        confidence: 0.87,
        reason: "英文新闻正文",
        model: "doubao-seed-2-0-mini-260428",
      });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[1].content).toContain("Breaking news");
  });

  it("rejects unknown intents, invalid confidence and extra fields", async () => {
    const clientFor = (payload: unknown) => createBookkeepingIntentClient({
      fetchImpl: (async () => response(payload)) as typeof fetch,
      env: {},
    });

    await expect(clientFor({ intent: "other", confidence: 0.9 }).classify({ text: "x", provider: "DOUBAO", apiKey: "key" }))
      .resolves.toEqual({ ok: false, reason: "invalid_response" });
    await expect(clientFor({ intent: "bookkeeping", confidence: 1.2 }).classify({ text: "x", provider: "DOUBAO", apiKey: "key" }))
      .resolves.toEqual({ ok: false, reason: "invalid_response" });
    await expect(clientFor({ intent: "bookkeeping", confidence: 0.8, extra: true }).classify({ text: "x", provider: "DOUBAO", apiKey: "key" }))
      .resolves.toEqual({ ok: false, reason: "invalid_response" });
  });

  it("maps provider failures without leaking the upstream body", async () => {
    const client = createBookkeepingIntentClient({
      fetchImpl: (async () => new Response("secret upstream", { status: 401 })) as typeof fetch,
      env: {},
    });
    await expect(client.classify({ text: "x", provider: "DOUBAO", apiKey: "key" }))
      .resolves.toEqual({ ok: false, reason: "auth_invalid" });
  });
});

function response(payload: unknown) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }), { status: 200 });
}
