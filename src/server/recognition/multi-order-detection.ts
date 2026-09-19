export type MultiOrderDetection = {
  suspected: boolean;
  evidenceCount: number;
};

const FINAL_PAYMENT_ANCHORS = [
  /实付款?/g,
  /付款金额/g,
  /订单金额/g,
  /成交价/g,
  /已付款\s*[¥￥]?\s*\d/g,
];

/** Detects repeated final-payment anchors without interpreting prices as orders. */
export function detectSuspectedMultiOrder(text: string): MultiOrderDetection {
  const evidenceCount = Math.max(
    0,
    ...FINAL_PAYMENT_ANCHORS.map((pattern) => text.match(pattern)?.length ?? 0),
  );
  return { suspected: evidenceCount >= 2, evidenceCount };
}
