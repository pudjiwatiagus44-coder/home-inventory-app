import { describe, expect, it, vi } from "vitest";

import { createFeedbackService } from "./feedback-service";

describe("feedback service", () => {
  it("sends feedback to the target with account metadata", async () => {
    const sendFeedbackEmail = vi.fn().mockResolvedValue(undefined);
    const service = createFeedbackService({
      mailer: { sendFeedbackEmail },
      to: "736259416@qq.com",
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    await service.sendFeedback({
      email: "user@example.com",
      message: "希望能支持分类筛选",
      source: "android",
      appVersion: "0.5.24",
    });

    expect(sendFeedbackEmail).toHaveBeenCalledWith({
      to: "736259416@qq.com",
      subject: "家庭物品 App 反馈 - user@example.com",
      text: expect.stringContaining("希望能支持分类筛选"),
      html: expect.stringContaining("希望能支持分类筛选"),
    });
  });
});
