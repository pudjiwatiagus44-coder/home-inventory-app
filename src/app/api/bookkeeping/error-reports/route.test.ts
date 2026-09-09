import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createBookkeepingErrorReportHandlers } from "./handlers";

const report = {
  reportId: "11111111-1111-4111-8111-111111111111",
  localTransactionId: 42,
  serverTransactionId: null,
  snapshot: {
    amount: "4.50", direction: "expense", category: "餐饮", merchant: "停车场", note: "",
    transactionTime: "2026-09-08T09:22:00.000Z", deletedAt: "2026-09-08T10:00:00.000Z", source: "photo_recognition",
  },
  reason: "wrong_amount",
  note: null,
  authorizedAt: "2026-09-08T10:01:00.000Z",
};

describe("/api/bookkeeping/error-reports", () => {
  it("returns 401 before reading multipart data without a session", async () => {
    const service = serviceStub();
    const handlers = createBookkeepingErrorReportHandlers({
      authService: { getCurrentUser: async () => null },
      service,
    });

    const response = await handlers.POST(request(report, false));

    expect(response.status).toBe(401);
    expect(service.saveForCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects invalid multipart reports without echoing private content", async () => {
    const handlers = authenticatedHandlers(serviceStub());
    const privateValue = "OCR 付款账号 6222020202020202";

    const response = await handlers.POST(request({ ...report, rawOcrText: privateValue }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(privateValue);
  });

  it("passes only a parsed report and JPEG buffer to the current-user service", async () => {
    const service = serviceStub();
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(request(report));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { reportId: report.reportId, duplicate: false } });
    expect(service.saveForCurrentUser).toHaveBeenCalledWith("user-a", report, expect.any(Buffer));
  });

  it("does not disclose storage failures", async () => {
    const service = serviceStub();
    service.saveForCurrentUser.mockRejectedValue(new Error("/private/error-reports/secret.jpg"));
    const handlers = authenticatedHandlers(service);

    const response = await handlers.POST(request(report));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret.jpg");
  });
});

function authenticatedHandlers(service: ReturnType<typeof serviceStub>) {
  return createBookkeepingErrorReportHandlers({
    authService: { getCurrentUser: async () => ({ userId: "user-a", email: "a@example.com" }) },
    service,
  });
}

function serviceStub() {
  return {
    saveForCurrentUser: vi.fn(async (_userId: string, input: typeof report, _image: Buffer) => ({
      reportId: input.reportId,
      duplicate: false,
    })),
  };
}

function request(body: unknown, authenticated = true) {
  const form = new FormData();
  form.append("report", JSON.stringify(body));
  form.append("image", new Blob([new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9])], { type: "image/jpeg" }), "evidence.jpg");
  return new NextRequest("http://localhost/api/bookkeeping/error-reports", {
    method: "POST",
    headers: authenticated ? { Cookie: "home_inventory_session=session-token" } : {},
    body: form,
  });
}
