import { describe, expect, it } from "vitest";

import {
  parseBookkeepingErrorReportRequest,
  validateBookkeepingErrorReportJpeg,
} from "./bookkeeping-error-report-types";

const report = {
  reportId: "11111111-1111-4111-8111-111111111111",
  localTransactionId: 42,
  serverTransactionId: null,
  snapshot: {
    amount: "4.50",
    direction: "expense",
    category: "餐饮",
    merchant: "停车场",
    note: "",
    transactionTime: "2026-09-08T09:22:00.000Z",
    deletedAt: "2026-09-08T10:00:00.000Z",
    source: "photo_recognition",
  },
  reason: "wrong_amount",
  note: "实际支付 4.50",
  authorizedAt: "2026-09-08T10:01:00.000Z",
};

describe("bookkeeping error report contract", () => {
  it("accepts only the approved report fields", () => {
    expect(parseBookkeepingErrorReportRequest(report)).toEqual(report);
  });

  it("rejects OCR, account data, malformed identifiers, and invalid report values", () => {
    expect(() => parseBookkeepingErrorReportRequest({ ...report, rawOcrText: "付款成功" }))
      .toThrow("unexpected field");
    expect(() => parseBookkeepingErrorReportRequest({ ...report, accountId: "attacker" }))
      .toThrow("unexpected field");
    expect(() => parseBookkeepingErrorReportRequest({ ...report, reportId: "not-a-uuid" }))
      .toThrow("reportId");
    expect(() => parseBookkeepingErrorReportRequest({ ...report, localTransactionId: 0 }))
      .toThrow("localTransactionId");
    expect(() => parseBookkeepingErrorReportRequest({ ...report, reason: "ocr_wrong" }))
      .toThrow("reason");
    expect(() => parseBookkeepingErrorReportRequest({ ...report, note: "x".repeat(1_001) }))
      .toThrow("note");
    expect(() => parseBookkeepingErrorReportRequest({ ...report, authorizedAt: "not-a-date" }))
      .toThrow("authorizedAt");
  });

  it("accepts only bounded JPEG evidence", () => {
    expect(() => validateBookkeepingErrorReportJpeg(Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9])))
      .not.toThrow();
    expect(() => validateBookkeepingErrorReportJpeg(Buffer.from([1, 2, 3])))
      .toThrow("JPEG");
    expect(() => validateBookkeepingErrorReportJpeg(Buffer.alloc(2 * 1024 * 1024 + 1, 0xff)))
      .toThrow("2MiB");
  });
});
