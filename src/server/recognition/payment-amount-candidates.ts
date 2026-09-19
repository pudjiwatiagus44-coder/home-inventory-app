import type { BookkeepingDraft } from "./doubao-bookkeeping";

export type PaymentAmountCandidate = {
  label: string;
  amount: string;
  priority: "TRUSTED" | "HINT";
};

const trustedLabels = new Set(["实付款", "成交价", "支付成功", "付款金额"]);

export function parsePaymentAmountCandidates(value: unknown): PaymentAmountCandidate[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new Error("invalid amountCandidates");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid amountCandidates");
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.label !== "string" || typeof candidate.amount !== "string" ||
      (candidate.priority !== "TRUSTED" && candidate.priority !== "HINT") ||
      !/^\d+(?:\.\d{1,2})?$/.test(candidate.amount)) throw new Error("invalid amountCandidates");
    return {
      label: candidate.label.trim().slice(0, 20),
      amount: Number(candidate.amount).toFixed(2),
      priority: candidate.priority as PaymentAmountCandidate["priority"],
    };
  }).filter((candidate) => candidate.label.length > 0);
}

export function applyTrustedPaymentAmount(drafts: BookkeepingDraft[], candidates: PaymentAmountCandidate[]): BookkeepingDraft[] {
  const trusted = candidates.find((candidate) => candidate.priority === "TRUSTED" && trustedLabels.has(candidate.label));
  if (!trusted || drafts.length !== 1 || drafts[0]?.type !== "支出") return drafts;
  return [{ ...drafts[0], amount: trusted.amount }];
}
