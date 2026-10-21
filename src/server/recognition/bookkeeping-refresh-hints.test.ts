import { describe, it, expect, vi } from "vitest";
import { createDoubaoBookkeepingClient, BOOKKEEPING_DRAFT_FIELDS } from "./doubao-bookkeeping";
const draft = { ...Object.fromEntries(BOOKKEEPING_DRAFT_FIELDS.map(key => [key, ""])), amount: "12.00", type: "支出", category: "早餐" };
const hints = { amountOptions: [{ amount: "12.00", rank: 1, reason: "实际付款", evidenceLabel: "实付" }, { amount: "15", rank: 2, reason: "优惠前", evidenceLabel: "原价" }] };
describe("refresh hints negotiation", () => {
    it("accepts optional ranked per-draft candidates only for opted-in requests", async () => {
        const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => { void _url; void _init; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ ...draft, refreshHints: hints }]) } }] })); });
        const client = createDoubaoBookkeepingClient({ apiKey: "test-only", fetchImpl });
        expect(await client.understandOcrText("实付12.00 原价15", "2026-10-21T10:00:00Z")).toEqual({ ok: false, reason: "invalid_response" });
        expect(await client.understandOcrText("实付12.00 原价15", "2026-10-21T10:00:00Z", [], [], [], { refreshHints: true })).toMatchObject({ ok: true, value: [{ refreshHints: hints }] });
        const sent = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
        expect(sent.messages[0].content).toContain("refreshHints");
    });
    it("does not invent missing candidates or keep candidates lacking the selected amount", async () => {
        const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => { void _url; void _init; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ ...draft, refreshHints: { amountOptions: [hints.amountOptions[1]] } }]) } }] })); });
        const result = await createDoubaoBookkeepingClient({ apiKey: "test-only", fetchImpl }).understandOcrText("实付12 原价15", "2026-10-21T10:00:00Z", [], [], [], { refreshHints: true });
        expect(result).toMatchObject({ ok: true, value: [{ refreshHints: { amountOptions: [] } }] });
    });
});
import { createBookkeepingVisionRerecognitionService } from "../../features/bookkeeping/bookkeeping-vision-rerecognition-service";
it("negotiates the same per-order hints in the vision path without changing old strict parsing", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ ...draft, merchant: "早餐店", refreshHints: hints }]) } }] })));
    const service = createBookkeepingVisionRerecognitionService({ deepseekApiKey: "test-only", fetchImpl });
    const input = { requestId: "test-refresh", ocrText: "实付12 原价15", capturedAt: "2026-10-21T10:00:00Z", categories: [], provider: "DEEPSEEK" as const };
    expect(await service.rerecognize(input, Buffer.from("test-image"))).toMatchObject({ ok: false, reason: "invalid_response" });
    expect(await service.rerecognize({ ...input, refreshHints: true }, Buffer.from("test-image"))).toMatchObject({ ok: true, drafts: [{ refreshHints: hints }] });
});
