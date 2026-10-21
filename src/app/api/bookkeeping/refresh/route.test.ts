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
import { parseRefreshHints } from "../../../../server/recognition/bookkeeping-refresh";
it("keeps model ranking without moving the required current amount", () => {
    const hints = { amountOptions: [{ amount: "18", rank: 3, reason: "当前", evidenceLabel: "当前" }, { amount: "20", rank: 1, reason: "实付", evidenceLabel: "实付" }, { amount: "25", rank: 2, reason: "原价", evidenceLabel: "原价" }] };
    expect(parseRefreshHints(hints, "18").amountOptions.map(item => item.amount)).toEqual(["20", "25", "18"]);
});
it("amount refresh only returns original-bound ranked hints and leaves the current data unchanged", async () => {
    const hints = { amountOptions: [{ amount: "12", rank: 1, reason: "实付", evidenceLabel: "实付" }, { amount: "20", rank: 2, reason: "原价", evidenceLabel: "原价" }, { amount: "25", rank: 3, reason: "合计", evidenceLabel: "合计" }] };
    const client = { understandOcrText: vi.fn(async () => ({ ok: true as const, value: [{ ...draft, refreshHints: hints }], model: "test" })) };
    const response = await createBookkeepingRefreshHandlers({ client }).POST(request({ scope: "AMOUNT" }));
    expect(await response.json()).toMatchObject({ status: "NO_ALTERNATIVE", data: current, refreshHints: hints });
});
it("amount refresh rejects hints lacking the original current amount even when proposed amount exists", async () => {
    const hints = { amountOptions: [{ amount: "20", rank: 1, reason: "实付", evidenceLabel: "实付" }] };
    const client = { understandOcrText: vi.fn(async () => ({ ok: true as const, value: [{ ...draft, refreshHints: hints }], model: "test" })) };
    expect(await (await createBookkeepingRefreshHandlers({ client }).POST(request({ scope: "AMOUNT" }))).json()).toMatchObject({ status: "NO_ALTERNATIVE", data: current, refreshHints: { amountOptions: [] } });
});
it("refresh never reads or submits other records as correction examples", async () => {
    const feedbackService = { findSimilarForCurrentUser: vi.fn(async () => []) };
    const understandOcrText = vi.fn(async (...args: unknown[]) => { void args; return { ok: true as const, value: [draft], model: "test" }; });
    const req = request();
    req.headers.set("Cookie", "home_inventory_session=session-token");
    await createBookkeepingRefreshHandlers({ client: { understandOcrText }, feedbackService, authService: { getCurrentUser: async () => ({ userId: "test-user", email: "test@example.com" }) } }).POST(req);
    expect(feedbackService.findSimilarForCurrentUser).not.toHaveBeenCalled();
    expect(understandOcrText.mock.calls[0][3]).toEqual([]);
});
it("accepts at least 32 exclusions and still rejects an older displayed value", async () => {
    const excludedValues = Array.from({ length: 32 }, (_, index) => index === 0 ? "B店" : `店${index}`);
    const client = { understandOcrText: vi.fn(async () => ({ ok: true as const, value: [draft], model: "test" })) };
    const response = await createBookkeepingRefreshHandlers({ client }).POST(request({ excludedValues }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "NO_ALTERNATIVE", data: current });
});
