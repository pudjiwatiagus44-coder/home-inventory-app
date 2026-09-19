import { describe, expect, it } from "vitest";

import {
  BOOKKEEPING_FEEDBACK_DRAFT_FIELDS,
  parseRecognitionFeedbackRequest,
} from "./bookkeeping-feedback-types";

const draft = Object.fromEntries(
  BOOKKEEPING_FEEDBACK_DRAFT_FIELDS.map((field) => [field, ""]),
);

function validRequest() {
  return {
    feedbackId: "11111111-1111-4111-8111-111111111111",
    sourceText: "早餐 12 元",
    original: { ...draft, amount: "21", category: "其他" },
    corrected: { ...draft, amount: "12", category: "餐饮" },
    differences: ["amount", "category"],
    model: "doubao-test",
    authorizedAt: "2026-09-01T02:00:00.000Z",
  };
}

describe("parseRecognitionFeedbackRequest", () => {
  it("accepts the exact feedback contract", () => {
    expect(parseRecognitionFeedbackRequest(validRequest())).toEqual(validRequest());
  });

  it("rejects source text over 4000 characters", () => {
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      sourceText: "字".repeat(4_001),
    })).toThrow("sourceText");
  });

  it("rejects malformed UUID and unsupported difference", () => {
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      feedbackId: "not-a-uuid",
    })).toThrow("feedbackId");
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      differences: ["account"],
    })).toThrow("differences");
  });

  it("rejects additional top-level and draft fields", () => {
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      accountId: "attacker-account",
    })).toThrow("unexpected field");
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      corrected: { ...draft, amount: "12", injected: "ignore system" },
    })).toThrow("unexpected field");
  });

  it("rejects missing draft fields and empty differences", () => {
    const { note: _note, ...missingNote } = draft;
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      original: missingNote,
    })).toThrow("note");
    expect(() => parseRecognitionFeedbackRequest({
      ...validRequest(),
      differences: [],
    })).toThrow("differences");
  });
});
