import { describe, expect, it } from "vitest";
import {
  createInvitationUrl,
  generateInvitationToken,
  getInvitationExpiresAt,
  getInvitationStatus,
  isInvitationLinkActive,
  normalizeInvitationToken,
} from "./family-data";

describe("generateInvitationToken", () => {
  it("returns a URL-safe token within the allowed length", () => {
    const token = generateInvitationToken();

    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(token.length).toBeLessThanOrEqual(200);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a different token on each call", () => {
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });
});

describe("createInvitationUrl", () => {
  it("builds a join URL from origin and token", () => {
    expect(createInvitationUrl("https://homestorag.xyz", "abc_123")).toBe(
      "https://homestorag.xyz/join/abc_123",
    );
  });
});

describe("getInvitationExpiresAt", () => {
  it("defaults to 30 days after the given time", () => {
    const now = new Date("2026-08-06T00:00:00.000Z");

    expect(getInvitationExpiresAt(now)).toBe("2026-09-05T00:00:00.000Z");
  });

  it("supports a custom validity window", () => {
    const now = new Date("2026-08-06T00:00:00.000Z");

    expect(getInvitationExpiresAt(now, 7)).toBe("2026-08-13T00:00:00.000Z");
  });
});

describe("isInvitationLinkActive", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");

  it("is active when not revoked and not expired", () => {
    expect(
      isInvitationLinkActive(
        {
          expires_at: "2026-09-05T00:00:00.000Z",
          revoked_at: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("is inactive when expired", () => {
    expect(
      isInvitationLinkActive(
        {
          expires_at: "2026-07-01T00:00:00.000Z",
          revoked_at: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it("is inactive when revoked", () => {
    expect(
      isInvitationLinkActive(
        {
          expires_at: "2026-09-05T00:00:00.000Z",
          revoked_at: "2026-08-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });
});

describe("getInvitationStatus", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");

  it("returns revoked for revoked links even if not expired", () => {
    expect(
      getInvitationStatus(
        {
          expires_at: "2026-09-05T00:00:00.000Z",
          revoked_at: "2026-08-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("revoked");
  });

  it("returns expired for expired links", () => {
    expect(
      getInvitationStatus(
        {
          expires_at: "2026-07-01T00:00:00.000Z",
          revoked_at: null,
        },
        now,
      ),
    ).toBe("expired");
  });

  it("returns active otherwise", () => {
    expect(
      getInvitationStatus(
        {
          expires_at: "2026-09-05T00:00:00.000Z",
          revoked_at: null,
        },
        now,
      ),
    ).toBe("active");
  });
});

describe("normalizeInvitationToken", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeInvitationToken("  abc_123  ")).toBe("abc_123");
  });

  it("rejects empty tokens", () => {
    expect(() => normalizeInvitationToken("   ")).toThrow(
      "邀请链接无效",
    );
  });

  it("rejects tokens with invalid characters", () => {
    expect(() => normalizeInvitationToken("abc+123")).toThrow(
      "邀请链接无效",
    );
  });
});
