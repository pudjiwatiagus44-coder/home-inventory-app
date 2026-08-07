import { describe, expect, it } from "vitest";

import { createRecognitionRateLimiter } from "./rate-limiter";

describe("recognition rate limiter", () => {
  it("allows up to the limit inside the window", () => {
    let now = 0;
    const limiter = createRecognitionRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
  });

  it("tracks users independently", () => {
    let now = 0;
    const limiter = createRecognitionRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-2")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
  });

  it("releases the slot after the window expires", () => {
    let now = 0;
    const limiter = createRecognitionRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
    now = 60_001;
    expect(limiter.tryConsume("user-1")).toBe(true);
  });
});
