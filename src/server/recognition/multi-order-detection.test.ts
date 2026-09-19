import { describe, expect, it } from "vitest";

import { detectSuspectedMultiOrder } from "./multi-order-detection";

describe("detectSuspectedMultiOrder", () => {
  it("detects an order list with repeated final-payment anchors", () => {
    const text = [
      "全部 待付款 待收货 待评价",
      "纸巾 先用后付 实付 ¥18.20",
      "洗衣液 先用后付 实付 ¥32.50",
      "收纳盒 先用后付 实付 ¥11.17",
    ].join("\n");

    expect(detectSuspectedMultiOrder(text)).toEqual({ suspected: true, evidenceCount: 3 });
  });

  it("does not treat several prices in one order detail as several orders", () => {
    const text = "订单详情 商品原价 ¥88.00 优惠 ¥10.00 先用后付 实付 ¥78.00 运费 ¥0.00";

    expect(detectSuspectedMultiOrder(text).suspected).toBe(false);
  });

  it("does not treat a payment page and an advertisement as several orders", () => {
    const text = "支付成功 ¥26.79 为你推荐 券后 ¥1.80";

    expect(detectSuspectedMultiOrder(text).suspected).toBe(false);
  });
});
