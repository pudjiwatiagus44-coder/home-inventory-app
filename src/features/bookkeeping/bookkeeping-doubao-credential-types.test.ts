import { describe, expect, it } from "vitest";

import { parseDoubaoCredentialRequest } from "./bookkeeping-doubao-credential-types";

describe("parseDoubaoCredentialRequest", () => {
  it("accepts an exact apiKey DTO and trims surrounding whitespace", () => {
    expect(parseDoubaoCredentialRequest({ apiKey: "  ark-test-key  " })).toEqual({
      apiKey: "ark-test-key",
    });
  });

  it.each([
    undefined,
    null,
    {},
    { apiKey: undefined },
    { apiKey: 123 },
    { apiKey: "" },
    { apiKey: "   " },
    { apiKey: "a".repeat(513) },
    { apiKey: "ark-test-key", accountId: "account-b" },
  ])("rejects an invalid or over-permissive DTO: %j", (input) => {
    expect(() => parseDoubaoCredentialRequest(input)).toThrow();
  });

  it("accepts a key at the 512 character boundary", () => {
    const apiKey = "a".repeat(512);

    expect(parseDoubaoCredentialRequest({ apiKey })).toEqual({ apiKey });
  });
});
