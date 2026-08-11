import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createFeedbackHandlers } from "./handlers";
import { FeedbackRateLimitExceededError } from "../../../server/feedback/feedback-rate-limiter";
import {
  SmtpNotConfiguredError,
  SmtpSendFailedError,
} from "../../../server/mail/smtp-mailer";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "home_inventory_session=session-token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("sends feedback with the current user", async () => {
    const sendFeedback = vi.fn().mockResolvedValue(undefined);
    const { POST } = createFeedbackHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      service: { sendFeedback },
      rateLimiter: { check: () => undefined },
    });

    const response = await POST(
      jsonRequest({ message: " 希望支持分类筛选 ", source: "android" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendFeedback).toHaveBeenCalledWith({
      email: "user@example.com",
      message: "希望支持分类筛选",
      source: "android",
      appVersion: undefined,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = createFeedbackHandlers({
      authService: { getCurrentUser: async () => null },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        body: JSON.stringify({ message: "x" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an empty message", async () => {
    const { POST } = createFeedbackHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
    });

    const response = await POST(jsonRequest({ message: "   " }));

    expect(response.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    const { POST } = createFeedbackHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      service: { sendFeedback: async () => undefined },
      rateLimiter: {
        check: () => {
          throw new FeedbackRateLimitExceededError();
        },
      },
    });

    const response = await POST(jsonRequest({ message: "feedback" }));

    expect(response.status).toBe(429);
  });

  it("maps SMTP configuration errors to 501 and send failures to 500", async () => {
    for (const [error, status] of [
      [new SmtpNotConfiguredError(), 501],
      [new SmtpSendFailedError(new Error("boom")), 500],
    ] as const) {
      const { POST } = createFeedbackHandlers({
        authService: {
          getCurrentUser: async () => ({
            userId: "user-1",
            email: "user@example.com",
          }),
        },
        service: {
          sendFeedback: async () => {
            throw error;
          },
        },
        rateLimiter: { check: () => undefined },
      });

      const response = await POST(jsonRequest({ message: "feedback" }));
      expect(response.status).toBe(status);
    }
  });
});
