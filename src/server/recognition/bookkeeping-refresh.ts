export type RefreshScope = "TRANSACTION" | "AMOUNT" | "MERCHANT" | "DESCRIPTION" | "CATEGORY";
export type RefreshData = {
    amount: string;
    direction: "Income" | "Expense";
    category: string;
    merchant: string;
    description: string;
};
export type RefreshHints = {
    amountOptions: Array<{
        amount: string;
        rank: number;
        reason: string;
        evidenceLabel: string;
    }>;
};
export const REFRESH_HINTS_PROMPT = `允许每笔对象额外包含 refreshHints:{amountOptions:[{amount:字符串,rank:整数,reason:字符串,evidenceLabel:字符串}]}。候选必须属于该笔交易，最多5个，按真实付款可能度排序，必须包含当前金额但不能为它改变真实可能度排序；reason解释依据，evidenceLabel为原文金额标签。不能把其他订单或广告推荐价格当候选；没有可信候选时返回空数组，禁止编造。`;
export function normalizeRefreshValue(field: string, value: string) {
    const text = value.normalize("NFKC").trim();
    if (field === "amount") {
        const numeric = Number(text.replace(/[¥￥,\s]/g, ""));
        return Number.isFinite(numeric) ? String(numeric) : text;
    }
    return text.toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
}
export function parseRefreshHints(value: unknown, currentAmount: string): RefreshHints {
    const result: RefreshHints = { amountOptions: [] };
    if (!value || typeof value !== "object" || !Array.isArray((value as RefreshHints).amountOptions))
        return result;
    const options = (value as RefreshHints).amountOptions;
    const seen = new Set<string>();
    for (const item of [...options].filter(item => item && typeof item === "object").sort((a, b) => a.rank - b.rank)) {
        if (typeof item.amount !== "string" || item.amount.length > 20 || !/^\d+(\.\d{1,2})?$/.test(item.amount) || Number(item.amount) <= 0 || !Number.isInteger(item.rank) || item.rank < 1 || typeof item.reason !== "string" || !item.reason.trim() || typeof item.evidenceLabel !== "string" || !item.evidenceLabel.trim() || item.reason.length > 300 || item.evidenceLabel.length > 100)
            continue;
        const key = normalizeRefreshValue("amount", item.amount);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.amountOptions.push({ amount: item.amount, rank: item.rank, reason: item.reason.trim(), evidenceLabel: item.evidenceLabel.trim() });
    }
    if (!result.amountOptions.some(item => normalizeRefreshValue("amount", item.amount) === normalizeRefreshValue("amount", currentAmount)))
        return { amountOptions: [] };
    result.amountOptions = result.amountOptions.slice(0, 5);
    if (!result.amountOptions.some(item => normalizeRefreshValue("amount", item.amount) === normalizeRefreshValue("amount", currentAmount)))
        return { amountOptions: [] };
    return result;
}
export function selectRefreshResult(scope: RefreshScope, current: RefreshData, proposed: RefreshData, excluded: string[]) {
    const field = ({ AMOUNT: "amount", MERCHANT: "merchant", DESCRIPTION: "description", CATEGORY: "category" } as const)[scope as Exclude<RefreshScope, "TRANSACTION">];
    const fields = field ? [field] : Object.keys(current) as Array<keyof RefreshData>;
    const requiredFields: Array<keyof RefreshData> = field ? [field] : ["amount", "direction", "category"];
    const changed = fields.some(key => normalizeRefreshValue(key, current[key]) !== normalizeRefreshValue(key, proposed[key]));
    const excludedMatch = field ? excluded.some(value => normalizeRefreshValue(field, value) === normalizeRefreshValue(field, proposed[field])) : excluded.some(value => {
        try {
            const record = JSON.parse(value);
            return fields.every(key => typeof record[key] === "string" && normalizeRefreshValue(key, record[key]) === normalizeRefreshValue(key, proposed[key]));
        }
        catch {
            return false;
        }
    });
    if (((!field || field === "amount") && (!/^\d+(\.\d{1,2})?$/.test(proposed.amount) || !Number.isFinite(Number(proposed.amount)) || Number(proposed.amount) <= 0)) || (!field && !["Income", "Expense"].includes(proposed.direction)) || !changed || excludedMatch || requiredFields.some(key => !proposed[key]?.trim()))
        return { status: "NO_ALTERNATIVE" as const, data: current };
    return { status: "CHANGED" as const, data: field ? { ...current, [field]: proposed[field] } : proposed };
}
