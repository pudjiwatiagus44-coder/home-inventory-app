import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createBookkeepingFeedbackHandlers } from "./handlers";
import type { RecognitionFeedbackRequest } from "../../../../features/bookkeeping/bookkeeping-feedback-types";

const validBody: RecognitionFeedbackRequest = {
  feedbackId: "11111111-1111-4111-8111-111111111111",
  sourceText: "早餐12元",
  original: draft({ amount: "21", category: "其他" }),
  corrected: draft({ amount: "12", category: "餐饮" }),
  differences: ["amount", "category"],
  model: "doubao-test",
  authorizedAt: "2026-09-01T02:00:00.000Z",
};

describe("/api/bookkeeping/feedback", () => {
  it("returns 401 without a login cookie", async () => {
    const service = serviceStub();
    const handlers = createBookkeepingFeedbackHandlers({
      authService: { getCurrentUser: async () => null },
      service,
    });

    const response = await handlers.POST(request("POST", validBody, false));

    expect(response.status).toBe(401);
    expect(service.saveForCurrentUser).not.toHaveBeenCalled();
  });

  it("parses and idempotently saves for the authenticated user", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(request("POST", validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { feedbackId: validBody.feedbackId },
    });
    expect(service.saveForCurrentUser).toHaveBeenCalledWith("user-a", validBody);
  });

  it("lists summaries only and never returns source or corrected content", async () => {
    const service = serviceStub();
    service.listSummariesForCurrentUser.mockResolvedValue([{
      feedbackId: validBody.feedbackId,
      differences: ["amount"],
      model: "doubao-test",
      authorizedAt: validBody.authorizedAt,
    }]);
    const handlers = authenticatedHandlers(service);

    const response = await handlers.GET(request("GET"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(json)).not.toContain("早餐12元");
    expect(json.data).toHaveLength(1);
    expect(service.listSummariesForCurrentUser).toHaveBeenCalledWith("user-a");
  });

  it("physically deletes only through the authenticated user scope", async () => {
    const service = serviceStub();
    service.deleteForCurrentUser.mockResolvedValue({ deleted: 2 });
    const handlers = authenticatedHandlers(service);

    const response = await handlers.DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { deleted: 2 } });
    expect(service.deleteForCurrentUser).toHaveBeenCalledWith("user-a", undefined);
  });

  it("does not echo rejected feedback content in errors", async () => {
    const handlers = authenticatedHandlers(serviceStub());
    const secret = "用户不应看到被回显的敏感正文";

    const response = await handlers.POST(request("POST", { ...validBody, sourceText: secret, accountId: "attack" }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it("reports storage failures as 500 without leaking database details", async () => {
    const service = serviceStub();
    service.saveForCurrentUser.mockRejectedValue(new Error("database failed near 早餐12元"));
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(request("POST", validBody));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("早餐12元");
  });
});

function authenticatedHandlers(service: ReturnType<typeof serviceStub>) {
  return createBookkeepingFeedbackHandlers({
    authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
    service,
  });
}

function serviceStub() {
  return {
    saveForCurrentUser: vi.fn(async (_userId: string, body: typeof validBody) => ({ feedbackId: body.feedbackId })),
    listSummariesForCurrentUser: vi.fn(async (_userId: string) => [] as Array<{
      feedbackId: string;
      differences: string[];
      model: string;
      authorizedAt: string;
    }>),
    deleteForCurrentUser: vi.fn(async (_userId: string, _feedbackId?: string) => ({ deleted: 0 })),
  };
}

function request(method: string, body?: unknown, authenticated = true) {
  return new NextRequest("http://localhost/api/bookkeeping/feedback", {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authenticated ? { Cookie: "home_inventory_session=session-token" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function draft(overrides: Record<string, string> = {}) {
  return {
    dateTime: "", type: "", category: "", amount: "", currency: "",
    payerPayee: "", account: "", participant: "", tag: "", merchant: "",
    property: "", note: "", ...overrides,
  };
}
