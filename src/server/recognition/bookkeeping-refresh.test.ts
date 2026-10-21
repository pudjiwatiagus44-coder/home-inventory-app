import { describe, it, expect } from "vitest";
import { parseRefreshHints, normalizeRefreshValue, selectRefreshResult } from "./bookkeeping-refresh";
describe("refresh contract", () => {
    it("normalizes amount formatting and rejects equivalent merchant formatting", () => {
        expect(normalizeRefreshValue("amount", "￥1,200.00")).toBe(normalizeRefreshValue("amount", "1200"));
        expect(normalizeRefreshValue("merchant", "Ａ B店")).toBe(normalizeRefreshValue("merchant", "ab店"));
    });
    it("keeps only evidenced distinct candidates ranked with current first", () => {
        expect(parseRefreshHints({ amountOptions: [{ amount: "12.00", rank: 1, reason: "实付", evidenceLabel: "实付" }, { amount: "12", rank: 2, reason: "重复", evidenceLabel: "原价" }, { amount: "999", rank: 3, reason: "", evidenceLabel: "" }] }, "12").amountOptions).toHaveLength(1);
    });
    it("only replaces selected field and rejects excluded or equivalent answers", () => {
        const current = { amount: "12.00", direction: "Expense" as const, category: "早餐", merchant: "A店", description: "面包" };
        const draft = { amount: "99", direction: "Income" as const, category: "咖啡", merchant: "B店", description: "茶" };
        expect(selectRefreshResult("MERCHANT", current, draft, []).data).toEqual({ ...current, merchant: "B店" });
        expect(selectRefreshResult("MERCHANT", current, { ...draft, merchant: "Ａ 店" }, []).status).toBe("NO_ALTERNATIVE");
        expect(selectRefreshResult("MERCHANT", current, draft, ["b 店"]).status).toBe("NO_ALTERNATIVE");
    });
});
it("allows whole-transaction refresh to retain unknown merchant and description", () => {
    const current = { amount: "18.00", direction: "Expense" as const, category: "午餐", merchant: "", description: "" };
    const proposed = { ...current, amount: "20.00" };
    expect(selectRefreshResult("TRANSACTION", current, proposed, [])).toEqual({ status: "CHANGED", data: proposed });
    expect(selectRefreshResult("TRANSACTION", current, current, []).status).toBe("NO_ALTERNATIVE");
    expect(selectRefreshResult("TRANSACTION", current, proposed, [JSON.stringify(proposed)]).status).toBe("NO_ALTERNATIVE");
    expect(selectRefreshResult("TRANSACTION", current, { ...proposed, category: "" }, []).status).toBe("NO_ALTERNATIVE");
});
it("still rejects an empty value when refreshing an individual text field", () => {
    const current = { amount: "18.00", direction: "Expense" as const, category: "午餐", merchant: "小店", description: "午餐" };
    expect(selectRefreshResult("MERCHANT", current, { ...current, merchant: "" }, []).status).toBe("NO_ALTERNATIVE");
    expect(selectRefreshResult("DESCRIPTION", current, { ...current, description: "" }, []).status).toBe("NO_ALTERNATIVE");
});
