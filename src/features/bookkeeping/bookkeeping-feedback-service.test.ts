import { describe, expect, it } from "vitest";

import type { PostgresQueryClient } from "../../server/auth/postgres-auth-repository";
import {
  createBookkeepingFeedbackService,
  scoreRecognitionFeedback,
} from "./bookkeeping-feedback-service";
import type {
  RecognitionFeedbackRequest,
  RecognitionFeedbackStoredRow,
} from "./bookkeeping-feedback-types";

type Call = { text: string; values?: unknown[] };

function makeClient(handler: (text: string, values?: unknown[]) => Record<string, unknown>[] = () => []) {
  const calls: Call[] = [];
  const client: PostgresQueryClient = {
    async query<Row>(text: string, values?: unknown[]) {
      calls.push({ text, values });
      if (text.includes("select id from bookkeeping_accounts where user_id")) {
        return { rows: [{ id: values?.[0] === "user-b" ? "account-b" : "account-a" }] as Row[] };
      }
      return { rows: handler(text, values) as Row[] };
    },
  };
  return { client, calls };
}

const emptyDraft = {
  dateTime: "", type: "", category: "", amount: "", currency: "",
  payerPayee: "", account: "", participant: "", tag: "", merchant: "",
  property: "", note: "",
};

const feedback: RecognitionFeedbackRequest = {
  feedbackId: "11111111-1111-4111-8111-111111111111",
  sourceText: "麦当劳早餐付款 12 元",
  original: { ...emptyDraft, amount: "21", category: "其他" },
  corrected: { ...emptyDraft, amount: "12", category: "餐饮", merchant: "麦当劳" },
  differences: ["amount", "category", "merchant"],
  model: "doubao-test",
  authorizedAt: "2026-09-01T02:00:00.000Z",
};

describe("bookkeeping feedback service", () => {
  it("upserts by current account and stable feedback id", async () => {
    const { client, calls } = makeClient(() => [{ id: feedback.feedbackId }]);
    const service = createBookkeepingFeedbackService({ client });

    await service.saveForCurrentUser("user-a", feedback);
    await service.saveForCurrentUser("user-a", feedback);

    const writes = calls.filter((call) => call.text.includes("insert into bookkeeping_recognition_feedback"));
    expect(writes).toHaveLength(2);
    expect(writes.every((call) => call.text.includes("on conflict (account_id, id)"))).toBe(true);
    expect(writes.every((call) => call.values?.[0] === "account-a")).toBe(true);
  });

  it("never accepts an account id from the caller when listing or deleting", async () => {
    const { client, calls } = makeClient();
    const service = createBookkeepingFeedbackService({ client });

    await service.listSummariesForCurrentUser("user-a");
    await service.deleteForCurrentUser("user-b");

    const list = calls.find((call) => call.text.includes("from bookkeeping_recognition_feedback") && call.text.includes("order by"));
    const deletion = calls.find((call) => call.text.includes("delete from bookkeeping_recognition_feedback"));
    expect(list?.values).toEqual(["account-a"]);
    expect(deletion?.values).toEqual(["account-b"]);
    expect(list?.text).toContain("where account_id = $1::uuid");
    expect(deletion?.text).toContain("where account_id = $1::uuid");
  });

  it("returns only current-account similar corrected examples, sorted and capped", async () => {
    const rows: RecognitionFeedbackStoredRow[] = [
      stored("a", "麦当劳早餐付款12元", "餐饮", "麦当劳", "2026-09-01T03:00:00Z"),
      stored("b", "地铁3元", "交通", "地铁", "2026-09-01T04:00:00Z"),
      stored("c", "麦当劳午餐13元", "餐饮", "麦当劳", "2026-09-01T02:00:00Z"),
      stored("d", "麦当劳早餐11元", "餐饮", "麦当劳", "2026-09-01T01:00:00Z"),
    ];
    const { client } = makeClient((text) => text.includes("source_text") ? rows : []);
    const service = createBookkeepingFeedbackService({ client });

    const examples = await service.findSimilarForCurrentUser("user-a", "麦当劳早餐付款 12 元");

    expect(examples).toHaveLength(3);
    expect(examples[0].sourceText).toBe("麦当劳早餐付款12元");
    expect(examples.every((item) => Object.keys(item).sort().join(",") === "corrected,sourceText")).toBe(true);
  });
});

describe("scoreRecognitionFeedback", () => {
  it("scores exact normalized text as 100", () => {
    expect(scoreRecognitionFeedback("麦当劳，早餐 12 元！", stored("x", "麦当劳早餐12元", "餐饮", "麦当劳", "2026-09-01T00:00:00Z"))).toBe(100);
  });

  it("adds amount and corrected merchant/category matches", () => {
    const row = stored("x", "历史文本18元", "餐饮", "麦当劳", "2026-09-01T00:00:00Z");
    expect(scoreRecognitionFeedback("麦当劳餐饮消费18元", row)).toBeGreaterThanOrEqual(60);
  });
});

function stored(
  id: string,
  sourceText: string,
  category: string,
  merchant: string,
  createdAt: string,
): RecognitionFeedbackStoredRow {
  return {
    id,
    source_text: sourceText,
    original_result: emptyDraft,
    corrected_result: { ...emptyDraft, category, merchant },
    differences: ["category"],
    model: "doubao-test",
    authorized_at: "2026-09-01T00:00:00Z",
    created_at: createdAt,
  };
}
