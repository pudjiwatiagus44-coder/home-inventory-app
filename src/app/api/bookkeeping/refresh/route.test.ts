import { NextRequest } from "next/server";
import { describe, it, expect, vi } from "vitest";
import { createBookkeepingRefreshHandlers } from "./handlers";
const current = { amount: "12.00", direction: "Expense", category: "早餐", merchant: "A店", description: "面包" };
const draft = { dateTime: "2026-10-21 10:00", type: "收入", category: "咖啡", amount: "20", currency: "人民币", payerPayee: "B店", account: "", participant: "自己", tag: "", merchant: "B店", property: "", note: "茶" };
function request(overrides = {}) { return new NextRequest("http://localhost/api/bookkeeping/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: "refresh-1", scope: "MERCHANT", current, excludedValues: [], provider: "DOUBAO", credentialMode: "PLATFORM", ocrText: "A店 B店 实付12.00", capturedAt: "2026-10-21T10:00:00+08:00", ...overrides }) }); }
describe("refresh route", () => {
    it("changes only requested field and reuses selected provider with generated instructions", async () => {
        const understandOcrText = vi.fn(async () => ({ ok: true as const, value: [draft], model: "test" }));
        const response = await createBookkeepingRefreshHandlers({ client: { understandOcrText } }).POST(request());
        expect(await response.json()).toMatchObject({ ok: true, status: "CHANGED", data: { ...current, merchant: "B店" } });
        expect(understandOcrText.mock.calls[0]).toBeDefined();
    });
    it("no alternatives for same or excluded answer, without adding a transaction", async () => {
        const client = { understandOcrText: vi.fn(async () => ({ ok: true as const, value: [draft], model: "test" })) };
        const response = await createBookkeepingRefreshHandlers({ client }).POST(request({ excludedValues: ["b 店"] }));
        expect(await response.json()).toMatchObject({ status: "NO_ALTERNATIVE", data: current });
    });
    it("does not turn multiple returned drafts into a new current transaction", async () => {
        const client = { understandOcrText: vi.fn(async () => ({ ok: true as const, value: [draft, draft], model: "test" })) };
        expect(await (await createBookkeepingRefreshHandlers({ client }).POST(request())).json()).toMatchObject({ status: "NO_ALTERNATIVE", data: current });
    });
    it("requires evidenced amount candidates before changing amount", async () => {
        const client = { understandOcrText: vi.fn(async () => ({ ok: true as const, value: [draft], model: "test" })) };
        expect(await (await createBookkeepingRefreshHandlers({ client }).POST(request({ scope: "AMOUNT" }))).json()).toMatchObject({ status: "NO_ALTERNATIVE", data: current });
    });
    it("rejects invalid body before calling model and preserves provider auth errors", async () => {
        const understandOcrText = vi.fn();
        const handlers = createBookkeepingRefreshHandlers({ client: { understandOcrText } });
        expect((await handlers.POST(request({ scope: "DIRECTION" }))).status).toBe(400);
        expect(understandOcrText).not.toHaveBeenCalled();
        expect((await handlers.POST(request({ provider: "DEEPSEEK", credentialMode: "PERSONAL" }))).status).toBe(401);
    });
});
