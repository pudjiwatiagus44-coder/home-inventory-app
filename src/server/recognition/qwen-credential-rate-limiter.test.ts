import { describe, expect, it } from "vitest";

import { createQwenCredentialRateLimiter } from "./qwen-credential-rate-limiter";

describe("Qwen credential rate limiter", () => {
  it("limits requests by account and releases concurrency slots", () => {
    const limiter = createQwenCredentialRateLimiter({ maxRequests: 2, windowMs: 100, maxConcurrent: 1, now: () => 10 });
    const first = limiter.tryAcquire("user-a");
    expect(first).not.toBeNull();
    expect(limiter.tryAcquire("user-a")).toBeNull();
    expect(limiter.tryAcquire("user-b")).not.toBeNull();
    first?.();
    const second = limiter.tryAcquire("user-a");
    expect(second).not.toBeNull();
    second?.();
    expect(limiter.tryAcquire("user-a")).toBeNull();
  });

  it("expires requests outside the rolling window", () => {
    let time = 10;
    const limiter = createQwenCredentialRateLimiter({ maxRequests: 1, windowMs: 50, maxConcurrent: 1, now: () => time });
    limiter.tryAcquire("user-a")?.();
    expect(limiter.tryAcquire("user-a")).toBeNull();
    time = 60;
    expect(limiter.tryAcquire("user-a")).not.toBeNull();
  });
});
