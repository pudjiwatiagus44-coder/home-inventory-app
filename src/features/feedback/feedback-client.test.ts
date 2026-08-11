import { describe, expect, it, vi } from "vitest";

import { createFeedbackClient } from "./feedback-client";

describe("feedback client", () => {
  it("posts feedback with web source", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const client = createFeedbackClient({ fetch });

    await client.submitFeedback("希望能支持分类筛选");

    expect(fetch).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "希望能支持分类筛选",
          source: "web",
        }),
      }),
    );
  });
});
