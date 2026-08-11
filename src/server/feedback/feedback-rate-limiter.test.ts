import { describe, expect, it, vi } from "vitest";

import {
  createFeedbackRateLimiter,
  FeedbackRateLimitExceededError,
} from "./feedback-rate-limiter";

describe("feedback rate limiter", () => {
  it("allows three requests and blocks the fourth", () => {
    const now = vi.fn(() => 1000);
    const limiter = createFeedbackRateLimiter({ maxRequests: 3, now });

    limiter.check("user-1");
    limiter.check("user-1");
    limiter.check("user-1");

    expect(() => limiter.check("user-1")).toThrow(
      FeedbackRateLimitExceededError,
    );
  });

  it("allows a request again after the window passes", () => {
    let current = 1000;
    const now = vi.fn(() => current);
    const limiter = createFeedbackRateLimiter({ maxRequests: 1, now });

    limiter.check("user-1");
    current += 60 * 60 * 1000 + 1;

    expect(() => limiter.check("user-1")).not.toThrow();
  });
});
