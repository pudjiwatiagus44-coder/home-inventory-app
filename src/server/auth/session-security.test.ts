import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  createSessionExpiry,
  hashSessionToken,
  isSessionUsable,
  SESSION_DURATION_DAYS,
} from "./session-security";

describe("createSessionToken", () => {
  it("creates a url-safe random token", () => {
    const token = createSessionToken(() => Buffer.alloc(32, 1));

    expect(token).toBe("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE");
    expect(token).not.toMatch(/[+/=]/);
  });
});

describe("createSessionExpiry", () => {
  it("uses a 30 day default session lifetime", () => {
    expect(SESSION_DURATION_DAYS).toBe(30);
    expect(createSessionExpiry(new Date("2026-07-06T00:00:00.000Z"))).toEqual(
      new Date("2026-08-05T00:00:00.000Z"),
    );
  });
});

describe("hashSessionToken", () => {
  it("hashes the token with the server secret", () => {
    expect(hashSessionToken("session-token", "server-secret")).toBe(
      "6ebb04cec3fee9bcc6a003e11ccd598d1a23ad82fd25e442e04d40bf3aa4a8d9",
    );
  });

  it("rejects a missing server secret", () => {
    expect(() => hashSessionToken("session-token", "")).toThrow(
      "SESSION_SECRET is required",
    );
  });
});

describe("isSessionUsable", () => {
  it("accepts a session that has not expired or been revoked", () => {
    expect(
      isSessionUsable(
        {
          expiresAt: new Date("2026-07-07T00:00:00.000Z"),
          revokedAt: null,
        },
        new Date("2026-07-06T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("rejects revoked and expired sessions", () => {
    expect(
      isSessionUsable(
        {
          expiresAt: new Date("2026-07-07T00:00:00.000Z"),
          revokedAt: new Date("2026-07-06T12:00:00.000Z"),
        },
        new Date("2026-07-06T00:00:00.000Z"),
      ),
    ).toBe(false);

    expect(
      isSessionUsable(
        {
          expiresAt: new Date("2026-07-06T00:00:00.000Z"),
          revokedAt: null,
        },
        new Date("2026-07-06T00:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
