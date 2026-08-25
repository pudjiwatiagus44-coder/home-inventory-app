import { describe, expect, it, vi } from "vitest";

import { createDoubaoBookkeepingClient } from "./doubao-bookkeeping";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("doubao bookkeeping client", () => {
  it("corrects OCR text and maps all Wacai fields", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("doubao-seed-2-0-mini-260428");
      expect(body.messages[1].content).toContain("拼夕夕平台商户");
      expect(body.messages[0].content).toContain("dateTime");
      return jsonResponse(200, {
        choices: [{
          message: {
            content: "```json\n{\"dateTime\":\"2026-08-10 22:56\",\"type\":\"支出\",\"category\":\"购物\",\"amount\":\"8.00\",\"currency\":\"人民币\",\"payerPayee\":\"拼多多平台商户\",\"account\":\"广州银行信用卡(7420)\",\"participant\":\"自己\",\"tag\":\"先用后付\",\"merchant\":\"拼多多平台商户\",\"property\":\"日常消费\",\"note\":\"先用后付订单已完成，已自动支付\"}\n```",
          },
        }],
      });
    });
    const client = createDoubaoBookkeepingClient({
      apiKey: "key",
      model: "doubao-seed-2-0-mini-260428",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.understandOcrText(
      "拼夕夕平台商户\n¥8.OO\n下单时间 8月10日 22:56",
      "2026-08-21T15:30:00+08:00",
    )).resolves.toEqual({
      ok: true,
      value: [{
        dateTime: "2026-08-10 22:56",
        type: "支出",
        category: "购物",
        amount: "8.00",
        currency: "人民币",
        payerPayee: "拼多多平台商户",
        account: "广州银行信用卡(7420)",
        participant: "自己",
        tag: "先用后付",
        merchant: "拼多多平台商户",
        property: "日常消费",
        note: "先用后付订单已完成，已自动支付",
      }],
    });
  });

  it("rejects model output that is not valid JSON", async () => {
    const client = createDoubaoBookkeepingClient({
      apiKey: "key",
      fetchImpl: (async () => jsonResponse(200, {
        choices: [{ message: { content: "金额大概是八元" } }],
      })) as typeof fetch,
    });

    await expect(client.understandOcrText("¥8.00", "2026-08-21T15:30:00+08:00"))
      .resolves.toEqual({ ok: false, reason: "invalid_response" });
  });

  it("prefers the explicit OCR transaction date over capturedAt", async () => {
    const fetchImpl = async () => jsonResponse(200, {
      choices: [{ message: { content: JSON.stringify({
        dateTime: "2026-08-21 15:30", type: "支出", category: "购物", amount: "8.00",
        currency: "人民币", payerPayee: "拼多多", account: "", participant: "自己",
        tag: "", merchant: "拼多多", property: "", note: "",
      }) } }],
    });
    const client = createDoubaoBookkeepingClient({ apiKey: "key", fetchImpl: fetchImpl as typeof fetch });

    const result = await client.understandOcrText(
      "¥8.00\n下单时间 8月10日 22:56",
      "2026-08-21T15:30:00+08:00",
    );

    expect(result.ok && result.value[0]?.dateTime).toBe("2026-08-10 22:56");
  });

  it("instructs model to recognize income (收款/到账/红包 etc.) instead of defaulting to 支出", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const systemPrompt = String(body.messages[0].content);
      expect(systemPrompt).toContain("资金流入");
      expect(systemPrompt).toContain("收款");
      expect(systemPrompt).toContain("到账");
      expect(systemPrompt).toContain("红包");
      expect(systemPrompt).toContain("不要判成支出");
      return jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify([{
          dateTime: "2026-08-21 12:30", type: "收入", category: "其他", amount: "50.00",
          currency: "人民币", payerPayee: "张三", account: "微信(1234)", participant: "自己",
          tag: "", merchant: "张三", property: "", note: "收款",
        }]) } }],
      });
    });
    const client = createDoubaoBookkeepingClient({ apiKey: "key", fetchImpl: fetchImpl as typeof fetch });

    const result = await client.understandOcrText(
      "微信到账\n张三\n收款 ¥50.00\n余额: ¥680.50",
      "2026-08-21T12:30:00+08:00",
    );

    expect(result).toEqual({
      ok: true,
      value: [{
        dateTime: "2026-08-21 12:30", type: "收入", category: "其他", amount: "50.00",
        currency: "人民币", payerPayee: "张三", account: "微信(1234)", participant: "自己",
        tag: "", merchant: "张三", property: "", note: "收款",
      }],
    });
  });

  it("instructs model to take paid amount and separate shop name from item name", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const systemPrompt = String(body.messages[0].content);
      expect(systemPrompt).toContain("最终付款价格");
      expect(systemPrompt).toContain("商品原价或划线价");
      expect(systemPrompt).toContain("店铺名");
      expect(systemPrompt).toContain("商品名");
      return jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify([{
          dateTime: "2026-08-21 15:30", type: "支出", category: "购物", amount: "26.90",
          currency: "人民币", payerPayee: "芋圆便利店精选", account: "", participant: "自己",
          tag: "", merchant: "芋圆便利店精选", property: "", note: "御姐风情万种开叉连衣裙复古...",
        }]) } }],
      });
    });
    const client = createDoubaoBookkeepingClient({ apiKey: "key", fetchImpl: fetchImpl as typeof fetch });

    const result = await client.understandOcrText(
      "芋圆便利店精选\n御姐风情万种开叉连衣裙复古...￥69.90\n确认收货后付款\n￥26.90",
      "2026-08-21T15:30:00+08:00",
    );

    expect(result).toEqual({
      ok: true,
      value: [{
        dateTime: "2026-08-21 15:30", type: "支出", category: "购物", amount: "26.90",
        currency: "人民币", payerPayee: "芋圆便利店精选", account: "", participant: "自己",
        tag: "", merchant: "芋圆便利店精选", property: "", note: "御姐风情万种开叉连衣裙复古...",
      }],
    });
  });
});
