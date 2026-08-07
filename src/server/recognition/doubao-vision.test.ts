import { describe, expect, it } from "vitest";

import { createDoubaoVisionClient } from "./doubao-vision";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("doubao vision client", () => {
  it("returns the recognized name", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "牛奶" } }],
      });
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: true,
      value: "牛奶",
    });
  });

  it("normalizes an expiry date from a model answer", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "有效期至2026年8月30日" } }],
      });
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.recognizeExpireDate(Buffer.from("jpeg")),
    ).resolves.toEqual({ ok: true, value: "2026-08-30" });
  });

  it("reports not_recognized when the model cannot answer", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "无法识别" } }],
      });
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: false,
      reason: "not_recognized",
    });
  });

  it("reports api_key_missing without an api key", async () => {
    const client = createDoubaoVisionClient({ model: "model" });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: false,
      reason: "api_key_missing",
    });
  });

  it("reports upstream_error when the api fails", async () => {
    const fetchImpl = async () => jsonResponse(500, {});
    const client = createDoubaoVisionClient({
      apiKey: "key",
      model: "model",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.recognizeName(Buffer.from("jpeg"))).resolves.toEqual({
      ok: false,
      reason: "upstream_error",
    });
  });
});
