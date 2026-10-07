import { describe, expect, it, vi } from "vitest";
import { createDeepSeekVisionClient } from "./deepseek-vision";

const jpeg = Buffer.from([255, 216, 255]);
function response(content: unknown) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
}
describe("inventory DeepSeek vision", () => {
  it("sends only the current image with the personal credential and parses inventory fields", async () => {
    const fetchImpl = vi.fn(async () => response({ name: "牛奶", note: "常温保存" }));
    const client = createDeepSeekVisionClient({ apiKey: "synthetic-key", fetchImpl });
    expect(await client.recognizeItemDetails(jpeg)).toEqual({ ok: true, value: { name: "牛奶", note: "常温保存" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-key" });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-flash");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[1].content[1].image_url.url).toBe(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  });
  it("does not fabricate a name for unrecognized or malformed output", async () => {
    for (const content of [{ name: null }, { name: "无法识别" }, { name: "x".repeat(41) }, { category: "食品" }]) {
      const client = createDeepSeekVisionClient({ apiKey: "synthetic-key", fetchImpl: async () => response(content) });
      expect(await client.recognizeItemDetails(jpeg)).toEqual({ ok: false, reason: "not_recognized" });
    }
  });
  it("validates dates rather than accepting impossible calendar values", async () => {
    const valid = createDeepSeekVisionClient({ apiKey: "synthetic-key", fetchImpl: async () => response({ expireDate: "2028-02-29" }) });
    expect(await valid.recognizeExpireDate(jpeg)).toEqual({ ok: true, value: "2028-02-29" });
    const invalid = createDeepSeekVisionClient({ apiKey: "synthetic-key", fetchImpl: async () => response({ expireDate: "2026-02-30" }) });
    expect(await invalid.recognizeExpireDate(jpeg)).toEqual({ ok: false, reason: "not_recognized" });
  });
  it("returns a safe typed authentication error without leaking upstream contents", async () => {
    const client = createDeepSeekVisionClient({ apiKey: "synthetic-key", fetchImpl: async () => new Response("synthetic-key secret upstream", { status: 401 }) });
    await expect(client.recognizeItemDetails(jpeg)).rejects.toMatchObject({ code: "DEEPSEEK_AUTH_INVALID", status: 401 });
    await expect(client.recognizeItemDetails(jpeg)).rejects.not.toThrow("synthetic-key");
  });
  it("aborts a stalled request", async () => {
    let signal: AbortSignal | undefined;
    const client = createDeepSeekVisionClient({ apiKey: "synthetic-key", timeoutMs: 10,
      fetchImpl: async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}); },
    });
    await expect(client.recognizeItemDetails(jpeg)).rejects.toMatchObject({ code: "DEEPSEEK_TIMEOUT", status: 504 });
    expect(signal?.aborted).toBe(true);
  });
});
