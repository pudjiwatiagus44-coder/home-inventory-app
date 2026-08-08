import { describe, expect, it } from "vitest";

import {
  createForgotPasswordRateLimiter,
  RateLimitExceededError,
} from "./forgot-password-rate-limiter";

describe("forgot password rate limiter", () => {
  it("allows requests within the window limit", () => {
    const limiter = createForgotPasswordRateLimiter({
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
      now: () => 1_000_000,
    });

    for (let i = 0; i < 5; i += 1) {
      expect(() => limiter.check("user@example.com|ip")).not.toThrow();
    }
  });

  it("rejects requests beyond the window limit", () => {
    const limiter = createForgotPasswordRateLimiter({
      maxRequests: 2,
      windowMs: 60 * 60 * 1000,
      now: () => 1_000_000,
    });

    limiter.check("user@example.com|ip");
    limiter.check("user@example.com|ip");

    expect(() => limiter.check("user@example.com|ip")).toThrow(
      RateLimitExceededError,
    );
  });

  it("allows a new window after the time passes", () => {
    let now = 1_000_000;
    const limiter = createForgotPasswordRateLimiter({
      maxRequests: 2,
      windowMs: 60 * 60 * 1000,
      now: () => now,
    });

    limiter.check("user@example.com|ip");
    limiter.check("user@example.com|ip");
    now += 60 * 60 * 1000;

    expect(() => limiter.check("user@example.com|ip")).not.toThrow();
  });

  it("limits keys independently", () => {
    const limiter = createForgotPasswordRateLimiter({
      maxRequests: 1,
      windowMs: 60 * 60 * 1000,
      now: () => 1_000_000,
    });

    limiter.check("a@example.com|ip");

    expect(() => limiter.check("b@example.com|ip")).not.toThrow();
  });
});
