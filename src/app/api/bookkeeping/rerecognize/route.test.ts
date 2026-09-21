import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createBookkeepingRerecognizeHandlers } from "./handlers";

const metadata = {
  requestId: "11111111-1111-4111-8111-111111111111",
  ocrText: "付款 18 元",
  capturedAt: "2026-09-10T00:00:00.000Z",
  categories: [{ name: "餐饮", type: "EXPENSE", keywords: "吃饭" }],
  provider: "QWEN",
};
const draft = {
  dateTime: "2026-09-10 08:00", type: "支出", category: "餐饮", amount: "18.00",
  currency: "人民币", payerPayee: "早餐店", account: "", participant: "自己", tag: "",
  merchant: "早餐店", property: "", note: "早餐",
};

describe("/api/bookkeeping/rerecognize", () => {
  it("authenticates the account before reading multipart content", async () => {
    const service = serviceStub();
    const handlers = createBookkeepingRerecognizeHandlers({
      authService: { getCurrentUser: async () => null },
      service,
    });

    const response = await handlers.POST(request(false));

    expect(response.status).toBe(401);
    expect(service.rerecognize).not.toHaveBeenCalled();
  });

  it("passes only validated metadata and one JPEG to the service", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, drafts: [draft], provider: "QWEN", model: "qwen3.5-ocr" });
    expect(service.rerecognize).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: metadata.requestId, provider: "QWEN" }),
      expect.any(Buffer),
    );
  });

  it("allows DEEPSEEK and injects only the current session's briefly decrypted key", async () => {
    const service = serviceStub();
    const deepseek = { decryptForProvider: vi.fn(async () => "sk-user-a-key") };
    const handlers = createBookkeepingRerecognizeHandlers({
      authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
      deepseekCredentialService: deepseek,
      serviceFactory: vi.fn(() => service),
    });
    const response = await handlers.POST(requestWithMetadata({ ...metadata, provider: "DEEPSEEK" }));

    expect(response.status).toBe(200);
    expect(deepseek.decryptForProvider).toHaveBeenCalledWith("user-a");
    expect(service.rerecognize).toHaveBeenCalledWith(expect.objectContaining({ provider: "DEEPSEEK" }), expect.any(Buffer));
  });

  it.each([
    ["quota_exhausted", 403],
    ["rate_limit", 429],
    ["server_error", 502],
    ["invalid_response", 502],
  ])("maps %s to HTTP %s without returning a draft", async (reason, status) => {
    const service = serviceStub();
    service.rerecognize.mockResolvedValue({ ok: false, reason });
    const response = await authenticatedHandlers(service).POST(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, message: reason });
  });

  it("accepts the hierarchical category contract from newer Android clients", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const hierarchical = {
      ...metadata,
      categories: [{
        stableKey: "expense.meal.breakfast",
        type: "Expense",
        parentName: "餐饮",
        childName: "早餐",
        description: "早上吃的",
        keywords: "早餐,早点",
        name: "早餐",
      }],
    };
    const response = await handlers.POST(requestWithMetadata(hierarchical));

    expect(response.status).toBe(200);
    expect(service.rerecognize).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: [{ name: "早餐", type: "Expense", keywords: "早餐,早点" }],
      }),
      expect.any(Buffer),
    );
  });

  it("accepts up to 200 hierarchical categories (100 builtin plus custom children)", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const categories = Array.from({ length: 200 }, (_, index) => ({
      stableKey: `expense.custom.${index}`,
      type: "Expense",
      parentName: "自定义",
      childName: `自定义分类${index}`,
      description: "",
      keywords: "",
      name: `自定义分类${index}`,
    }));
    const response = await handlers.POST(requestWithMetadata({ ...metadata, categories }));

    expect(response.status).toBe(200);
  });

  it("rejects category shapes outside both contracts", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(requestWithMetadata({
      ...metadata,
      categories: [{ name: "早餐", type: "Expense", keywords: "早餐", unexpected: "field" }],
    }));

    expect(response.status).toBe(400);
    expect(service.rerecognize).not.toHaveBeenCalled();
  });
});

function authenticatedHandlers(service: ReturnType<typeof serviceStub>) {
  return createBookkeepingRerecognizeHandlers({
    authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
    service,
  });
}

function serviceStub() {
  return {
    rerecognize: vi.fn(async () => ({
      ok: true as const, drafts: [draft], provider: "QWEN" as const, model: "qwen3.5-ocr", stage: "vision" as const,
    })),
  };
}

function request(authenticated = true) {
  return requestWithMetadata(metadata, authenticated);
}

function requestWithMetadata(payload: typeof metadata | Record<string, unknown>, authenticated = true) {
  const form = new FormData();
  form.append("request", JSON.stringify(payload));
  form.append("image", new Blob([new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9])], { type: "image/jpeg" }), "source.jpg");
  return new NextRequest("http://localhost/api/bookkeeping/rerecognize", {
    method: "POST",
    headers: authenticated ? { Cookie: "home_inventory_session=session-token" } : {},
    body: form,
  });
}
